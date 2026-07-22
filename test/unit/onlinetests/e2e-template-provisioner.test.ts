import {
  E2eTemplateProvisioner,
  type IArtifactFactory,
  type SheetValueUpdate
} from '../../../src/onlinetests/E2eTemplateProvisioner';
import { FakeDriveFacade } from '../../fakes/FakeDriveFacade';
import { TIPI_PIANO } from '../../../src/onlinetests/E2eSampleDatabaseBuilder';

function fakeArtifacts(): {
  artifacts: IArtifactFactory;
  created: string[];
  docContent: Record<string, string[]>;
  sheetContent: Record<string, SheetValueUpdate[]>;
} {
  const created: string[] = [];
  const docContent: Record<string, string[]> = {};
  const sheetContent: Record<string, SheetValueUpdate[]> = {};
  let seq = 0;
  return {
    created,
    docContent,
    sheetContent,
    artifacts: {
      createDocument: (name: string, _folderId: string, paragraphs: string[] = []) => {
        created.push(`doc:${name}`);
        const id = `doc_${++seq}`;
        docContent[id] = paragraphs;
        return id;
      },
      createSheet: (name: string, _folderId: string, updates: SheetValueUpdate[] = []) => {
        created.push(`sheet:${name}`);
        const id = `sheet_${++seq}`;
        sheetContent[id] = updates;
        return id;
      }
    }
  };
}

test('creates all 7 templates (1 doc verbale + 1 sheet condotta + 5 doc piani) when none exist yet', () => {
  const { artifacts, created } = fakeArtifacts();
  const drive = new FakeDriveFacade();
  const ids = new E2eTemplateProvisioner(artifacts, drive).provision('FOLDER_1');

  expect(created).toHaveLength(7);
  expect(created.filter((c) => c.startsWith('sheet:'))).toHaveLength(1);
  expect(created.filter((c) => c.startsWith('doc:'))).toHaveLength(6);
  expect(ids.verbale).toMatch(/^doc_/);
  expect(ids.condotta).toMatch(/^sheet_/);
  for (const tipo of TIPI_PIANO) {
    expect(ids.piani[tipo]).toMatch(/^doc_/);
  }
});

test('reuses an existing template by name instead of recreating it', () => {
  const { artifacts, created } = fakeArtifacts();
  const drive = new FakeDriveFacade();
  drive.files.set('FOLDER_1::E2E Verbale Template', 'existing_verbale_id');

  const ids = new E2eTemplateProvisioner(artifacts, drive).provision('FOLDER_1');

  expect(ids.verbale).toBe('existing_verbale_id');
  expect(created.some((c) => c.includes('Verbale'))).toBe(false);
  expect(created).toHaveLength(6); // condotta + 5 piani still created
});

test('authors real CDU-path placeholder content into newly-created templates, not blank artifacts', () => {
  const { artifacts, docContent, sheetContent } = fakeArtifacts();
  const drive = new FakeDriveFacade();
  const ids = new E2eTemplateProvisioner(artifacts, drive).provision('FOLDER_1');

  const verbaleParagraphs = docContent[ids.verbale] ?? [];
  expect(verbaleParagraphs.length).toBeGreaterThan(0);
  expect(verbaleParagraphs.join('\n')).toContain('{{focus.classe.anagrafica.nome}}');
  expect(verbaleParagraphs.join('\n')).toContain('consiglioDiClasse');

  const condottaUpdates = sheetContent[ids.condotta] ?? [];
  expect(condottaUpdates.length).toBeGreaterThan(0);
  const condottaText = JSON.stringify(condottaUpdates);
  expect(condottaText).toContain('dynamic_rows[source=focus.classe.studenti.listaCompleta');
  expect(condottaText).toContain('AVERAGE(');

  for (const tipo of TIPI_PIANO) {
    const pianoParagraphs = docContent[ids.piani[tipo]] ?? [];
    expect(pianoParagraphs.length).toBeGreaterThan(0);
    const pianoText = pianoParagraphs.join('\n');
    expect(pianoText).toContain('{{focus.alunno.anagrafica.nomeCompleto}}');
    expect(pianoText).toContain('{{piano.note}}');
    expect(pianoText).toContain(tipo);
  }
});

test('does not re-author content for a reused (found, not created) template', () => {
  const { artifacts, docContent } = fakeArtifacts();
  const drive = new FakeDriveFacade();
  drive.files.set('FOLDER_1::E2E Verbale Template', 'existing_verbale_id');

  const ids = new E2eTemplateProvisioner(artifacts, drive).provision('FOLDER_1');

  expect(ids.verbale).toBe('existing_verbale_id');
  expect(docContent['existing_verbale_id']).toBeUndefined();
});
