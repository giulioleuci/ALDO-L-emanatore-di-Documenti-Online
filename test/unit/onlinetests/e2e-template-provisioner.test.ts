import {
  E2eTemplateProvisioner,
  type E2eDocumentParagraphInput,
  type E2eDocumentTable,
  type IArtifactFactory,
  type SheetValueUpdate
} from '../../../src/onlinetests/E2eTemplateProvisioner';
import { FakeDriveFacade } from '../../fakes/FakeDriveFacade';
import { TIPI_PIANO } from '../../../src/onlinetests/E2eSampleDatabaseBuilder';

function fakeArtifacts(): {
  artifacts: IArtifactFactory;
  created: string[];
  docContent: Record<string, E2eDocumentParagraphInput[]>;
  docTables: Record<string, E2eDocumentTable[]>;
  sheetContent: Record<string, SheetValueUpdate[]>;
} {
  const created: string[] = [];
  const docContent: Record<string, E2eDocumentParagraphInput[]> = {};
  const docTables: Record<string, E2eDocumentTable[]> = {};
  const sheetContent: Record<string, SheetValueUpdate[]> = {};
  let seq = 0;
  return {
    created,
    docContent,
    docTables,
    sheetContent,
    artifacts: {
      createDocument: (
        name: string,
        _folderId: string,
        paragraphs: E2eDocumentParagraphInput[] = [],
        tables: E2eDocumentTable[] = []
      ) => {
        created.push(`doc:${name}`);
        const id = `doc_${++seq}`;
        docContent[id] = paragraphs;
        docTables[id] = tables;
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

function documentText(paragraphs: E2eDocumentParagraphInput[]): string {
  return paragraphs
    .map((paragraph) => (typeof paragraph === 'string' ? paragraph : paragraph.text))
    .join('\n');
}

test('creates all 15 E2E artifacts, including the CDC signature-summary template', () => {
  const { artifacts, created } = fakeArtifacts();
  const drive = new FakeDriveFacade();
  const ids = new E2eTemplateProvisioner(artifacts, drive).provision('FOLDER_1');

  expect(created).toHaveLength(15);
  expect(created.filter((c) => c.startsWith('sheet:'))).toHaveLength(3);
  expect(created.filter((c) => c.startsWith('doc:'))).toHaveLength(12);
  expect(ids.verbale).toMatch(/^doc_/);
  expect(ids.condotta).toMatch(/^sheet_/);
  expect(ids.riepilogo).toMatch(/^doc_/);
  expect(ids.staticAttachment).toMatch(/^doc_/);
  expect(created).toContain('doc:E2E Static Attachment Fixture');
  expect(created).toContain('doc:E2E Riepilogo Template v4');
  expect(created).toContain('doc:E2E Doc Complesso Template v2');
  expect(ids.docArticolata).toMatch(/^doc_/);
  expect(created).toContain('doc:E2E Doc Articolata Template');
  expect(ids).toHaveProperty('cdcRiepilogo', expect.stringMatching(/^doc_/));
  expect(created).toContain('doc:E2E CDC Riepilogo Firme Template');
  for (const tipo of TIPI_PIANO) {
    expect(ids.piani[tipo]).toMatch(/^doc_/);
  }
});

test('authors the CDC signature-summary template with a row-loop council table', () => {
  const { artifacts, docContent, docTables } = fakeArtifacts();
  const drive = new FakeDriveFacade();
  const ids = new E2eTemplateProvisioner(artifacts, drive).provision('FOLDER_1');

  expect(documentText(docContent[ids.cdcRiepilogo] ?? [])).toContain(
    'Riepilogo firme del Consiglio di Classe {{focus.classe.anagrafica.nome}}'
  );
  expect(docTables[ids.cdcRiepilogo]).toEqual([
    {
      data: [
        ['Docente', 'Materie', 'Firma'],
        [
          '{{#tablerow_loop:focus.classe.consiglioDiClasse}}{{anagrafica.appellativoCompleto}}',
          '{{materieDescrizione}}',
          '________________'
        ]
      ],
      options: { headerRow: true, alternatingRows: true }
    }
  ]);
});

test('verbale template renders the generated custom-plan list through the class CDU placeholder', () => {
  const { artifacts, docContent } = fakeArtifacts();
  const drive = new FakeDriveFacade();
  const ids = new E2eTemplateProvisioner(artifacts, drive).provision('FOLDER_1');

  expect(documentText(docContent[ids.verbale]!)).toContain(
    '{{#bullet_list:focus.classe.didattica.pianiPersonalizzati.items}}'
  );
});

test('reuses an existing template by name instead of recreating it', () => {
  const { artifacts, created } = fakeArtifacts();
  const drive = new FakeDriveFacade();
  drive.files.set('FOLDER_1::E2E Verbale Template v2', 'existing_verbale_id');

  const ids = new E2eTemplateProvisioner(artifacts, drive).provision('FOLDER_1');

  expect(ids.verbale).toBe('existing_verbale_id');
  expect(created.some((c) => c.includes('Verbale'))).toBe(false);
  expect(created).toHaveLength(14); // cdc riepilogo + static attachment + condotta + riepilogo + asl import + doc complesso + doc articolata + sheet permessi + piano lavoro + 5 piani still created
});

test('reuses the real static attachment artifact by its fixed name', () => {
  const { artifacts, created } = fakeArtifacts();
  const drive = new FakeDriveFacade();
  drive.files.set('FOLDER_1::E2E Static Attachment Fixture', 'existing_static_attachment_id');

  const ids = new E2eTemplateProvisioner(artifacts, drive).provision('FOLDER_1');

  expect(ids.staticAttachment).toBe('existing_static_attachment_id');
  expect(created).not.toContain('doc:E2E Static Attachment Fixture');
});

test('does not reuse legacy personalized-plan templates after focused CDU placeholders change', () => {
  const { artifacts, created } = fakeArtifacts();
  const drive = new FakeDriveFacade();
  drive.files.set('FOLDER_1::E2E Piano PEI Template', 'legacy_pei_template');

  const ids = new E2eTemplateProvisioner(artifacts, drive).provision('FOLDER_1');

  expect(ids.piani.PEI).not.toBe('legacy_pei_template');
  expect(created).toContain('doc:E2E Piano PEI Template v2');
});

test('authors real CDU-path placeholder content into newly-created templates, not blank artifacts', () => {
  const { artifacts, docContent, docTables, sheetContent } = fakeArtifacts();
  const drive = new FakeDriveFacade();
  const ids = new E2eTemplateProvisioner(artifacts, drive).provision('FOLDER_1');

  const verbaleParagraphs = docContent[ids.verbale] ?? [];
  expect(verbaleParagraphs.length).toBeGreaterThan(0);
  expect(documentText(verbaleParagraphs)).toContain('{{focus.classe.anagrafica.nome}}');
  expect(documentText(verbaleParagraphs)).toContain('consiglioDiClasse');

  const condottaUpdates = sheetContent[ids.condotta] ?? [];
  expect(condottaUpdates.length).toBeGreaterThan(0);
  const condottaText = JSON.stringify(condottaUpdates);
  expect(condottaText).toContain('dynamic_rows[source=focus.classe.studenti.listaCompleta');
  expect(condottaText).toContain('AVERAGE(');

  const riepilogoParagraphs = docContent[ids.riepilogo] ?? [];
  expect(riepilogoParagraphs.length).toBeGreaterThan(0);
  const riepilogoText = documentText(riepilogoParagraphs);
  expect(riepilogoText).not.toContain('{{TABELLA_ALUNNI}}');
  expect(docTables[ids.riepilogo]).toEqual([
    {
      data: [
        ['Alunno', 'Religione', 'Email', 'Piani'],
        [
          '{{#tablerow_loop:focus.classe.studenti.listaCompleta}}{{anagrafica.nomeCompleto}}',
          '{{status.religione}}',
          '{{anagrafica.email}}',
          '{{didattica.piani.hasPiani}}'
        ]
      ],
      options: { headerRow: true, alternatingRows: true }
    }
  ]);
  expect(riepilogoText).toContain('{{#bullet_list:focus.classe.rappresentanti.studenti}}');
  expect(riepilogoText).toContain('{{#bullet_list:focus.classe.rappresentanti.genitori}}');
  expect(riepilogoText).toContain('{{focus.classe.studenti.statistiche.totale}}');
  expect(riepilogoParagraphs).toEqual(
    expect.arrayContaining([
      {
        text: '{{#bullet_list:focus.classe.rappresentanti.studenti}}{{nomeCompleto}}{{/bullet_list}}',
        listType: 'bullet'
      },
      {
        text: '{{#bullet_list:focus.classe.rappresentanti.genitori}}{{nomeCompleto}}{{/bullet_list}}',
        listType: 'bullet'
      }
    ])
  );

  for (const tipo of TIPI_PIANO) {
    const pianoParagraphs = docContent[ids.piani[tipo]] ?? [];
    expect(pianoParagraphs.length).toBeGreaterThan(0);
    const pianoText = documentText(pianoParagraphs);
    expect(pianoText).toContain('{{focus.alunno.anagrafica.nomeCompleto}}');
    expect(pianoText).toContain('{{focus.piano.tipo}}');
    expect(pianoText).toContain('{{focus.piano.parametriGenerazione.note}}');
    expect(pianoText).toContain(`Modello E2E ${tipo}`);
  }
});

test('provisions the ASL import source sheet with 3 mapped columns and only 3rd-year students', () => {
  const { artifacts, sheetContent, created } = fakeArtifacts();
  const drive = new FakeDriveFacade();
  const ids = new E2eTemplateProvisioner(artifacts, drive).provision('FOLDER_1');

  expect(ids.aslImportSheet).toMatch(/^sheet_/);
  expect(created).toContain('sheet:E2E ASL Import Source');
  const updates = sheetContent[ids.aslImportSheet] ?? [];
  const text = JSON.stringify(updates);
  expect(text).toContain('STUDENTE');
  expect(text).toContain('ANNO');
  expect(text).toContain('ORE');
  expect(text).toContain('e2ealunno43@onlinetest.aldo.local');
  expect(text).toContain('2026-2027');
});

test('authors the complex-placeholder template with bullet/number lists, tablerow/tablecol loops, and pipe filters', () => {
  const { artifacts, docContent, docTables } = fakeArtifacts();
  const drive = new FakeDriveFacade();
  const ids = new E2eTemplateProvisioner(artifacts, drive).provision('FOLDER_1');

  const text = documentText(docContent[ids.docComplesso] ?? []);
  expect(text).toContain("{{#bullet_list:focus.classe.coordinatori.elenco | sortBy:'nome'}}");
  expect(text).toContain(
    "{{#number_list:focus.classe.rappresentanti.studenti | filter:'active',true}}"
  );
  expect(text).toContain('| uppercase');
  expect(text).toContain('{{#bullet_list:focus.classe.esame.materiePrimaProva}}');
  expect(text).toContain('{{focus.classe.coordinatori.elenco.0.appellativoCompleto}}');
  expect(text).toContain('{{#bullet_list:focus.classe.progetti}}');
  expect(text).toContain('{{status.religioneLabel}}');
  expect(text).toContain('Specificità per materia (sempre disponibile nel CDU classe; 3 livelli):');
  expect(text).toContain('{{#focus.classe.studenti.perSpecificita}}');
  expect(docContent[ids.docComplesso]).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ listType: 'bullet' }),
      expect.objectContaining({ listType: 'number' })
    ])
  );
  const tables = docTables[ids.docComplesso] ?? [];
  const tableText = JSON.stringify(tables);
  expect(tableText).toContain(
    "tablerow_loop:focus.classe.studenti.listaCompleta | sortBy:'anagrafica.nomeCompleto'"
  );
  expect(tableText).toContain('tablecol_loop:focus.classe.consiglioDiClasse');
});

test('authors the articulated-class template with 4 flat bullet lists, no nested loops or filter pipes', () => {
  const { artifacts, docContent } = fakeArtifacts();
  const drive = new FakeDriveFacade();
  const ids = new E2eTemplateProvisioner(artifacts, drive).provision('FOLDER_1');

  const text = documentText(docContent[ids.docArticolata] ?? []);
  expect(text).toContain('{{#bullet_list:focus.classe.studenti.listaCompleta');
  expect(text).toContain('{{anagrafica.nomeCompleto}} ({{indirizzo.nome}})');
  expect(text).toContain('{{#bullet_list:focus.classe.consiglioDiClasseComune}}');
  expect(text).toContain('({{materieDescrizione}})');
  expect(text).toContain('{{#bullet_list:focus.classe.consiglioDiClasseSeparato}}');
  expect(text).toContain('({{gruppoNome}})');
  expect(text).toContain('{{#bullet_list:focus.classe.rappresentanti.studenti}}');
  expect(text).toContain('{{#bullet_list:focus.classe.rappresentanti.genitori}}');
  expect(text).toContain('{{#bullet_list:focus.classe.coordinatori.elenco}}');
  expect(text).not.toMatch(/\|\s*where/);
  expect(text).not.toMatch(/\|\s*map/);
});

test('authors the sheet-with-permessi template with the multi-group dynamic_columns placeholder', () => {
  const { artifacts, sheetContent } = fakeArtifacts();
  const drive = new FakeDriveFacade();
  const ids = new E2eTemplateProvisioner(artifacts, drive).provision('FOLDER_1');

  const text = JSON.stringify(sheetContent[ids.sheetPermessi] ?? []);
  expect(text).toContain('dynamic_columns[');
  expect(text).toContain('source=focus.classe.sheet.materieColonne.group1,value=header');
  expect(text).toContain(
    'source2=focus.classe.sheet.materieColonne.group2,value2=header,' +
      'label2=focus.classe.sheet.materieColonne.group2Label'
  );
  expect(text).toContain(
    'source3=focus.classe.sheet.materieColonne.group3,value3=header,' +
      'label3=focus.classe.sheet.materieColonne.group3Label'
  );
});

test('authors the work-plan (piano di lavoro) template', () => {
  const { artifacts, docContent } = fakeArtifacts();
  const drive = new FakeDriveFacade();
  const ids = new E2eTemplateProvisioner(artifacts, drive).provision('FOLDER_1');

  const text = documentText(docContent[ids.pianoLavoro] ?? []);
  expect(text).toContain('{{focus.classe.anagrafica.nome}}');
  expect(text.length).toBeGreaterThan(0);
});

test('does not re-author content for a reused (found, not created) template', () => {
  const { artifacts, docContent } = fakeArtifacts();
  const drive = new FakeDriveFacade();
  drive.files.set('FOLDER_1::E2E Verbale Template v2', 'existing_verbale_id');

  const ids = new E2eTemplateProvisioner(artifacts, drive).provision('FOLDER_1');

  expect(ids.verbale).toBe('existing_verbale_id');
  expect(docContent['existing_verbale_id']).toBeUndefined();
});
