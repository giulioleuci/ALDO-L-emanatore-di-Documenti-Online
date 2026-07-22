import { E2eTemplateProvisioner, type IArtifactFactory } from '../../../src/onlinetests/E2eTemplateProvisioner';
import { FakeDriveFacade } from '../../fakes/FakeDriveFacade';
import { TIPI_PIANO } from '../../../src/onlinetests/E2eSampleDatabaseBuilder';

function fakeArtifacts(): { artifacts: IArtifactFactory; created: string[] } {
  const created: string[] = [];
  let seq = 0;
  return {
    created,
    artifacts: {
      createDocument: (name: string) => {
        created.push(`doc:${name}`);
        return `doc_${++seq}`;
      },
      createSheet: (name: string) => {
        created.push(`sheet:${name}`);
        return `sheet_${++seq}`;
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
