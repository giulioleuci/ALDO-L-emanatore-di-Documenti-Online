import {
  AnalyzeContextStep,
  CheckDuplicatesStep,
  PrepareInfrastructureStep,
  GenerateNameStep,
  SelectTemplateStep,
  CloneTemplateStep,
  RenderTemplateStep,
  RegisterDocumentStep,
  PostProcessStep,
  ApplyPermissionsStep,
  CRITICAL_STEPS
} from '../../../../src/application/pipelines/documentSteps';
import { VerbaleGeneratorStrategy } from '../../../../src/application/strategies/VerbaleGeneratorStrategy';
import { ConfigurazioneDocumento } from '../../../../src/domain/entities/ConfigurazioneDocumento';
import { ConfigurazioneDocumentoRepository } from '../../../../src/infrastructure/repositories/ConfigurazioneDocumentoRepository';
import { ExpressionEngineFacade } from '../../../../src/infrastructure/facades/ExpressionEngineFacade';
import {
  composeContextBuilder,
  composeRisolutoreRuoli
} from '../../../../src/config/ApplicationComposition';
import { recipe } from '../../../../src/application/context-engine/Recipe';
import type { Cdu } from '../../../../src/application/context-engine/Cdu';
import { FakeDriveFacade } from '../../../../test/fakes/FakeDriveFacade';
import { FakeTemplateEngine } from '../../../../test/fakes/FakeTemplateEngine';
import { FakeDatabase } from '../../../../test/fakes/FakeDatabase';
import { fixtureTables } from '../../../../test/fixtures/tables';
import { AlberoCartelle } from '../../../../src/infrastructure/services/AlberoCartelle';
import {
  DuplicazioneDocumento,
  GestioneSupplenti,
  TipoPiano
} from '../../../../src/domain/value-objects/enums';

const logger = new LoggerService();
const engine = new ExpressionEngineFacade();

function buildCdu(db: FakeDatabase): Cdu {
  return composeContextBuilder(db).build(
    { target: '5A', tipoTarget: 'classe', now: new Date('2026-07-01T09:00:00Z') },
    recipe('CLASSE_COMPLETA')
  );
}

function buildAlunnoCdu(db: FakeDatabase): Cdu {
  return composeContextBuilder(db).build(
    { target: 'a1@school.it', tipoTarget: 'alunno', now: new Date('2026-07-01T09:00:00Z') },
    recipe('ALUNNO_DETTAGLIATO')
  );
}

function buildPianoCdu(db: FakeDatabase, pianoTipo: TipoPiano): Cdu {
  return composeContextBuilder(db).build(
    {
      target: 'a1@school.it',
      tipoTarget: 'alunno',
      pianoTipo,
      now: new Date('2026-07-01T09:00:00Z')
    },
    recipe('PIANO_PERSONALIZZATO')
  );
}

function buildDocenteClasseMateriaCdu(
  db: FakeDatabase,
  docenteCorrente: string,
  materiaCorrente: string
): Cdu {
  return composeContextBuilder(db).build(
    {
      target: '5A',
      tipoTarget: 'classe',
      docenteCorrente,
      materiaCorrente,
      now: new Date('2026-07-01T09:00:00Z')
    },
    recipe('CLASSE_DOCENTE_MATERIA')
  );
}

function buildClasseMateriaCdu(
  db: FakeDatabase,
  materiaCorrente: string,
  now = new Date('2026-07-01T09:00:00Z'),
  target = '5A'
): Cdu {
  return composeContextBuilder(db).build(
    {
      target,
      tipoTarget: 'classe',
      materiaCorrente,
      now
    },
    recipe('CLASSE_MATERIA')
  );
}

function pianoConfig(): Record<string, unknown> {
  return {
    ...fixtureTables().CONF_DOC[0]!,
    ID: 'PIANI_PERSONALIZZATI',
    TIPO: 'PIANO_PERS',
    GENERATORE: 'DOC_PERSONALIZZATO',
    MODELLI: JSON.stringify([
      { condizione: "{{focus.piano.tipo}} == 'PEI'", templateId: 'tmpl_pei' },
      { condizione: "{{focus.piano.tipo}} == 'PDP_BES'", templateId: 'tmpl_pdp_bes' }
    ]),
    FILE_NAME: 'Piano_{{focus.alunno.anagrafica.nomeCompleto}}',
    PATH_OUT: 'Piani',
    PARAMETRI: '',
    REGISTRA_DOC: JSON.stringify({
      classi: '{{focus.classe.anagrafica.nome}}',
      utenti: '{{focus.alunno.anagrafica.email}}',
      materie: ''
    })
  };
}

function baseCtx(db: FakeDatabase, confIndex = 0): PipelineContext {
  const ctx = new PipelineContext();
  const row = fixtureTables().CONF_DOC[confIndex]!;
  ctx.set('config', row);
  ctx.set('confDoc', ConfigurazioneDocumento.fromData(row));
  ctx.set('cdu', buildCdu(db));
  ctx.set('shouldGenerate', true); // gate open for single-step tests
  return ctx;
}

function logDetails(result: StepExecutionResult): unknown {
  return (result as StepExecutionResult & { logDetails: unknown }).logDetails;
}

describe('document pipeline operational log details', () => {
  test('publishes the generation decision and duplicate-check reason', () => {
    const db = new FakeDatabase(fixtureTables());
    const ctx = baseCtx(db);

    const analyze = new AnalyzeContextStep(
      logger,
      new ConfigurazioneDocumentoRepository(db),
      engine
    ).execute(ctx);
    const duplicateCheck = new CheckDuplicatesStep(logger, db, new FakeTemplateEngine()).execute(
      ctx
    );

    expect(logDetails(analyze)).toEqual({ Generate: true });
    expect(logDetails(duplicateCheck)).toBe('No duplicate found');
  });

  test('publishes the duplicate identity when generation is stopped', () => {
    const tables = fixtureTables();
    tables.LOG_DOCS = [
      {
        ID: 'old',
        ID_GEN: 'CD1',
        TIPO: 'VERBALE',
        SOTTOTIPO: '',
        PATH: 'Verbali/5',
        NOME: 'Verbale_5A_01/07/2026',
        CLASSI: '5A',
        STATO: 'GENERATO'
      }
    ];
    const db = new FakeDatabase(tables);
    const ctx = baseCtx(db);

    const result = new CheckDuplicatesStep(logger, db, new FakeTemplateEngine()).execute(ctx);

    expect(logDetails(result)).toBe(
      'Duplicato: TIPO=VERBALE, SOTTOTIPO=, ID_GEN=CD1, PATH=Verbali/5, NOME=Verbale_5A_01/07/2026'
    );
  });

  test('publishes folder, filename, template and cloned file identifiers without a file link', () => {
    const db = new FakeDatabase(fixtureTables());
    const ctx = baseCtx(db);
    const drive = new FakeDriveFacade();

    const infrastructure = new PrepareInfrastructureStep(
      logger,
      drive,
      db,
      new FakeTemplateEngine()
    ).execute(ctx);
    const generatedName = new GenerateNameStep(logger, new FakeTemplateEngine()).execute(ctx);
    const selectedTemplate = new SelectTemplateStep(
      logger,
      new ConfigurazioneDocumentoRepository(db),
      engine
    ).execute(ctx);
    const clonedTemplate = new CloneTemplateStep(logger, drive).execute(ctx);

    expect(logDetails(infrastructure)).toEqual({
      Folder: '5',
      Path: 'Verbali/5',
      Id: 'folder_1'
    });
    expect(logDetails(generatedName)).toBe('Verbale_5A_01/07/2026');
    expect(logDetails(selectedTemplate)).toBe('tmpl_verbale');
    expect(logDetails(clonedTemplate)).toBe('file_2');
    expect(JSON.stringify(logDetails(clonedTemplate))).not.toContain('https://');
  });

  test('publishes the configured generator without scanning the rendered file', () => {
    const db = new FakeDatabase(fixtureTables());
    const ctx = baseCtx(db);
    ctx.set('newFileId', 'file_1');
    const registry = new Map([
      ['VERBALE_CDC', new VerbaleGeneratorStrategy(new FakeTemplateEngine())]
    ]);

    const result = new RenderTemplateStep(logger, registry).execute(ctx);

    expect(logDetails(result)).toBe('VERBALE_CDC');
  });

  test('publishes unique operational permission addresses and no registration payload', () => {
    const db = new FakeDatabase(fixtureTables());
    const ctx = baseCtx(db);
    const perms = {
      file: [
        { ruolo: 'COORDINATORI', permesso: 'SCRITTURA' },
        { ruolo: 'COORDINATORI', permesso: 'SCRITTURA' }
      ],
      folder: [{ ruolo: 'CDC', permesso: 'LETTURA' }]
    };
    ctx.set('config', { ...fixtureTables().CONF_DOC[0]!, PERMESSI: JSON.stringify(perms) });
    ctx.set('newFileId', 'file_1');
    ctx.set('destFolderId', 'folder_1');
    ctx.set('nomeFile', 'Verbale_5A_01/07/2026');
    ctx.set('destFolderPath', 'Verbali/5');
    const drive = new FakeDriveFacade();

    const permissions = new ApplyPermissionsStep(
      logger,
      drive,
      composeRisolutoreRuoli(db)
    ).execute(ctx);
    const registration = new RegisterDocumentStep(
      logger,
      db,
      new FakeTemplateEngine()
    ).execute(ctx);

    expect(logDetails(permissions)).toEqual({
      Editors: ['rossi@school.it'],
      Viewers: ['bianchi@school.it']
    });
    expect(drive.permissions).toHaveLength(3);
    expect(logDetails(registration)).toBeNull();
  });

  test('publishes post-process action names and affected row count', () => {
    const tables = fixtureTables();
    tables.LOG_DOCS = [{ ID: 'file_9', ID_GEN: 'CD1', STATO: 'GENERATO', CLASSI: '5A' }];
    const db = new FakeDatabase(tables);
    const ctx = baseCtx(db);
    ctx.set('config', {
      ...fixtureTables().CONF_DOC[0]!,
      POST_PROCESSO: JSON.stringify([
        { tipo: 'AGGIORNA_STATO_DOC', stato: 'ARCHIVIATO', criteri: { ID: 'file_9' } }
      ])
    });

    const result = new PostProcessStep(
      logger,
      db,
      new FakeTemplateEngine(),
      new Date('2026-07-05T10:00:00Z')
    ).execute(ctx);

    expect(logDetails(result)).toEqual({
      Actions: ['AGGIORNA_STATO_DOC'],
      Updated: 1
    });
  });
});

test('AnalyzeContextStep: empty CONDIZIONE => shouldGenerate true (via ExpressionEngine repo helper)', () => {
  const db = new FakeDatabase(fixtureTables());
  const ctx = baseCtx(db);
  new AnalyzeContextStep(logger, new ConfigurazioneDocumentoRepository(db), engine).execute(ctx);
  expect(ctx.get('shouldGenerate')).toBe(true);
});

test('AnalyzeContextStep: CONDIZIONE evaluated by GasExpressionEngineLib over the CDU (10 §1)', () => {
  const db = new FakeDatabase(fixtureTables());
  const ctx = baseCtx(db, 1); // CD_ESAME: {{focus.classe.anagrafica.anno}} == 5
  new AnalyzeContextStep(logger, new ConfigurazioneDocumentoRepository(db), engine).execute(ctx);
  expect(ctx.get('shouldGenerate')).toBe(true); // 5A is anno 5
});

test('CheckDuplicatesStep: NEGATA closes the gate only for a matching full document identity', () => {
  const tables = fixtureTables();
  tables.LOG_DOCS = [
    {
      ID: 'old',
      ID_GEN: 'CD1',
      TIPO: 'VERBALE',
      SOTTOTIPO: '',
      PATH: 'Verbali/5',
      NOME: 'Verbale_5A_01/07/2026',
      CLASSI: '5A',
      STATO: 'GENERATO'
    }
  ];
  const db = new FakeDatabase(tables);
  const ctx = baseCtx(db);
  ctx.set('config', {
    ...fixtureTables().CONF_DOC[0]!,
    DUPLICAZIONE: DuplicazioneDocumento.NEGATA
  });
  new CheckDuplicatesStep(logger, db, new FakeTemplateEngine()).execute(ctx);
  expect(ctx.get('shouldGenerate')).toBe(false);
  expect(String(ctx.get('skipReason'))).toContain('TIPO=VERBALE');
});

test('CheckDuplicatesStep compares a filename with progressivo masked only for duplicate detection', () => {
  const tables = fixtureTables();
  tables.LOG_DOCS = [
    {
      ID: 'old',
      ID_GEN: 'CD1',
      TIPO: 'VERBALE',
      SOTTOTIPO: '',
      PATH: 'Output',
      NOME: 'E2E_5A_7'
    }
  ];
  const db = new FakeDatabase(tables);
  const ctx = baseCtx(db);
  ctx.set('config', {
    ...fixtureTables().CONF_DOC[0]!,
    FILE_NAME: 'E2E_{{focus.classe.anagrafica.nome}}_{{progressivo}}',
    PATH_OUT: 'Output'
  });

  new CheckDuplicatesStep(logger, db, new FakeTemplateEngine()).execute(ctx);

  expect(ctx.get('shouldGenerate')).toBe(false);

  const differentNameCtx = baseCtx(db);
  differentNameCtx.set('config', {
    ...fixtureTables().CONF_DOC[0]!,
    FILE_NAME: 'E2E_4B_{{progressivo}}',
    PATH_OUT: 'Output'
  });
  new CheckDuplicatesStep(logger, db, new FakeTemplateEngine()).execute(differentNameCtx);
  expect(differentNameCtx.get('shouldGenerate')).toBe(true);
});

test('CheckDuplicatesStep renders a Mustache section spanning the progressivo slot', () => {
  const tables = fixtureTables();
  tables.LOG_DOCS = [
    {
      ID: 'old',
      ID_GEN: 'CD1',
      TIPO: 'VERBALE',
      SOTTOTIPO: '',
      PATH: 'Output',
      NOME: 'Doc-7'
    }
  ];
  const db = new FakeDatabase(tables);
  const ctx = baseCtx(db);
  ctx.set('config', {
    ...fixtureTables().CONF_DOC[0]!,
    FILE_NAME: '{{#flag}}Doc-{{progressivo}}{{/flag}}',
    PATH_OUT: 'Output'
  });
  ctx.set('cdu', { ...buildCdu(db), flag: true });

  new CheckDuplicatesStep(logger, db, new FakeTemplateEngine()).execute(ctx);

  expect(ctx.get('shouldGenerate')).toBe(false);
});

test('CheckDuplicatesStep retries a marker assembled only after Mustache rendering', () => {
  const tables = fixtureTables();
  tables.LOG_DOCS = [
    {
      ID: 'old',
      ID_GEN: 'CD1',
      TIPO: 'VERBALE',
      SOTTOTIPO: '',
      PATH: 'Output',
      NOME: '_PROGRESSIVO_PH_-7'
    }
  ];
  const db = new FakeDatabase(tables);
  const ctx = baseCtx(db);
  ctx.set('config', {
    ...fixtureTables().CONF_DOC[0]!,
    FILE_NAME: '_PRO{{#flag}}GRESSIVO{{/flag}}_PH_-{{progressivo}}',
    PATH_OUT: 'Output'
  });
  ctx.set('cdu', { ...buildCdu(db), flag: true });
  const markerSupplier = jest
    .fn<() => string>()
    .mockReturnValueOnce('PROGRESSIVO')
    .mockReturnValueOnce('SAFE123');

  new CheckDuplicatesStep(logger, db, new FakeTemplateEngine(), markerSupplier).execute(ctx);

  expect(ctx.get('shouldGenerate')).toBe(false);
  expect(markerSupplier).toHaveBeenCalledTimes(2);
});

test('CheckDuplicatesStep fails meaningfully when every generated marker collides', () => {
  const db = new FakeDatabase(fixtureTables());
  const ctx = baseCtx(db);
  ctx.set('config', {
    ...fixtureTables().CONF_DOC[0]!,
    FILE_NAME: '{{#progressivo}}COL{{/progressivo}}LISION-{{progressivo}}',
    PATH_OUT: 'Output'
  });
  const markerSupplier = jest.fn<() => string>().mockReturnValue('COLLISION');

  expect(() =>
    new CheckDuplicatesStep(logger, db, new FakeTemplateEngine(), markerSupplier).execute(ctx)
  ).toThrow('Impossibile selezionare un marker progressivo senza collisioni dopo 16 tentativi');
});

test('CheckDuplicatesStep keeps a literal _PROGRESSIVO_PH_ filename fragment static', () => {
  const tables = fixtureTables();
  tables.LOG_DOCS = [
    {
      ID: 'old',
      ID_GEN: 'CD1',
      TIPO: 'VERBALE',
      SOTTOTIPO: '',
      PATH: 'Output',
      NOME: 'Literal-_PROGRESSIVO_PH_-7'
    }
  ];
  const db = new FakeDatabase(tables);
  const ctx = baseCtx(db);
  ctx.set('config', {
    ...fixtureTables().CONF_DOC[0]!,
    FILE_NAME: 'Literal-_PROGRESSIVO_PH_-{{progressivo}}',
    PATH_OUT: 'Output'
  });

  new CheckDuplicatesStep(logger, db, new FakeTemplateEngine()).execute(ctx);
  expect(ctx.get('shouldGenerate')).toBe(false);

  const differentLiteralCtx = baseCtx(db);
  differentLiteralCtx.set('config', {
    ...fixtureTables().CONF_DOC[0]!,
    FILE_NAME: 'Literal-123-{{progressivo}}',
    PATH_OUT: 'Output'
  });
  new CheckDuplicatesStep(logger, db, new FakeTemplateEngine()).execute(differentLiteralCtx);
  expect(differentLiteralCtx.get('shouldGenerate')).toBe(true);
});

test('CheckDuplicatesStep matches regex punctuation in filename text literally', () => {
  const tables = fixtureTables();
  tables.LOG_DOCS = [
    {
      ID: 'old',
      ID_GEN: 'CD1',
      TIPO: 'VERBALE',
      SOTTOTIPO: '',
      PATH: 'Output',
      NOME: 'A[5].(final)+?-7'
    }
  ];
  const db = new FakeDatabase(tables);
  const ctx = baseCtx(db);
  ctx.set('config', {
    ...fixtureTables().CONF_DOC[0]!,
    FILE_NAME: 'A[5].(final)+?-{{progressivo}}',
    PATH_OUT: 'Output'
  });

  new CheckDuplicatesStep(logger, db, new FakeTemplateEngine()).execute(ctx);
  expect(ctx.get('shouldGenerate')).toBe(false);

  const punctuationMismatchCtx = baseCtx(db);
  punctuationMismatchCtx.set('config', {
    ...fixtureTables().CONF_DOC[0]!,
    FILE_NAME: 'A5.final-{{progressivo}}',
    PATH_OUT: 'Output'
  });
  new CheckDuplicatesStep(logger, db, new FakeTemplateEngine()).execute(punctuationMismatchCtx);
  expect(punctuationMismatchCtx.get('shouldGenerate')).toBe(true);
});

test('CheckDuplicatesStep: PIANO_PERS identity includes focused subtype and configured student', () => {
  const tables = fixtureTables();
  tables.PIANI.push({ STUDENTE: 'a1@school.it', TIPO: 'PDP_BES', PARAMETRI: '{}' });
  tables.LOG_DOCS = [
    {
      ID: 'old',
      ID_GEN: 'PIANI_PERSONALIZZATI',
      TIPO: 'PIANO_PERS',
      SOTTOTIPO: 'PDP_BES',
      UTENTI: 'other@school.it',
      PATH: 'Piani',
      NOME: 'Piano_VERDI ANNA'
    }
  ];
  const db = new FakeDatabase(tables);
  const ctx = baseCtx(db);
  const config = pianoConfig();
  ctx.set('config', config);
  ctx.set('confDoc', ConfigurazioneDocumento.fromData(config));
  ctx.set('cdu', buildPianoCdu(db, TipoPiano.PDP_BES));

  new CheckDuplicatesStep(logger, db, new FakeTemplateEngine()).execute(ctx);
  expect(ctx.get('shouldGenerate')).toBe(true);

  const matchingTables = fixtureTables();
  matchingTables.PIANI.push({ STUDENTE: 'a1@school.it', TIPO: 'PDP_BES', PARAMETRI: '{}' });
  matchingTables.LOG_DOCS = [{ ...tables.LOG_DOCS[0]!, UTENTI: 'a1@school.it' }];
  const matchingDb = new FakeDatabase(matchingTables);
  const matchingCtx = baseCtx(matchingDb);
  matchingCtx.set('config', config);
  matchingCtx.set('confDoc', ConfigurazioneDocumento.fromData(config));
  matchingCtx.set('cdu', buildPianoCdu(matchingDb, TipoPiano.PDP_BES));
  new CheckDuplicatesStep(logger, matchingDb, new FakeTemplateEngine()).execute(matchingCtx);
  expect(matchingCtx.get('shouldGenerate')).toBe(false);
  expect(String(matchingCtx.get('skipReason'))).toContain('SOTTOTIPO=PDP_BES');
});

test('PrepareInfrastructureStep creates folder and registers it in LOG_FOLD (10 §5)', () => {
  const db = new FakeDatabase(fixtureTables());
  const ctx = baseCtx(db);
  const drive = new FakeDriveFacade();
  new PrepareInfrastructureStep(logger, drive, db, new FakeTemplateEngine()).execute(ctx);
  const folderId = ctx.get<string>('destFolderId')!;
  expect(drive.folders.get('Verbali/5')).toBe(folderId);
  expect(ctx.get('destFolderPath')).toBe('Verbali/5');
  const row = db.table('LOG_FOLD').find((r) => r.ID === folderId);
  expect(row?.TIPO).toBe('CD1');
  expect(row?.NOME).toBe('5');
  expect(row?.PATH).toBe('Verbali/5');
});

test('PrepareInfrastructureStep stores only REGISTRA_FOLD-rendered metadata', () => {
  const db = new FakeDatabase(fixtureTables());
  const ctx = baseCtx(db);
  const config = {
    ...fixtureTables().CONF_DOC[0]!,
    REGISTRA_FOLD: JSON.stringify({
      classi: '5B',
      utenti: 'folder@school.it',
      materie: 'MATE,FISI'
    })
  };
  ctx.set('config', config);
  ctx.set('confDoc', ConfigurazioneDocumento.fromData(config));

  new PrepareInfrastructureStep(logger, new FakeDriveFacade(), db, new FakeTemplateEngine()).execute(ctx);

  expect(db.table('LOG_FOLD').findAll()[0]).toMatchObject({
    CLASSI: '5B',
    UTENTI: 'folder@school.it',
    MATERIE: 'MATE,FISI'
  });
});

test('PrepareInfrastructureStep logs a pre-existing folder so email boxes can render it', () => {
  const db = new FakeDatabase(fixtureTables());
  const ctx = baseCtx(db);
  const drive = new FakeDriveFacade();
  const existing = drive.createFolder('Verbali/5'); // pre-existing folder
  new PrepareInfrastructureStep(logger, drive, db, new FakeTemplateEngine()).execute(ctx);
  expect(ctx.get('destFolderId')).toBe(existing);
  expect(db.table('LOG_FOLD').findAll()).toEqual([
    expect.objectContaining({ ID: existing, TIPO: 'CD1', NOME: '5', PATH: 'Verbali/5' })
  ]);
});

test('sets cdu.meta.progressivo and the root alias from countFilesInFolder + 1', () => {
  const db = new FakeDatabase(fixtureTables());
  const ctx = baseCtx(db);
  const drive = new FakeDriveFacade();
  jest.spyOn(drive, 'countFilesInFolder').mockReturnValue(3);
  new PrepareInfrastructureStep(logger, drive, db, new FakeTemplateEngine()).execute(ctx);

  const cduResult = ctx.get<Cdu>('cdu')!;
  expect(cduResult.meta.progressivo).toBe(4);
  expect((cduResult as unknown as { progressivo: number }).progressivo).toBe(4);
});

test('GenerateNameStep resolves FILE_NAME via WorkspaceTemplateEngine (10 §6)', () => {
  const db = new FakeDatabase(fixtureTables());
  const ctx = baseCtx(db);
  new GenerateNameStep(logger, new FakeTemplateEngine()).execute(ctx);
  expect(ctx.get('nomeFile')).toBe('Verbale_5A_01/07/2026');
});

test('SelectTemplateStep reads MODELLI simple form', () => {
  const db = new FakeDatabase(fixtureTables());
  const ctx = baseCtx(db);
  new SelectTemplateStep(logger, new ConfigurazioneDocumentoRepository(db), engine).execute(ctx);
  expect(ctx.get('templateId')).toBe('tmpl_verbale');
});

test('SelectTemplateStep evaluates conditional MODELLI entries via GasExpressionEngineLib (10 §7)', () => {
  const db = new FakeDatabase(fixtureTables());
  const ctx = baseCtx(db, 1); // CD_ESAME: first entry condition {{...anno}} == 5
  new SelectTemplateStep(logger, new ConfigurazioneDocumentoRepository(db), engine).execute(ctx);
  expect(ctx.get('templateId')).toBe('tmpl_esame'); // real evaluation, not the 'true' fallback
});

test.each([
  [TipoPiano.PEI, 'tmpl_pei'],
  [TipoPiano.PDP_BES, 'tmpl_pdp_bes']
])('SelectTemplateStep selects %s from conditional MODELLI using focus.piano.tipo', (tipo, templateId) => {
  const tables = fixtureTables();
  tables.PIANI.push({ STUDENTE: 'a1@school.it', TIPO: 'PDP_BES', PARAMETRI: '{}' });
  const db = new FakeDatabase(tables);
  const ctx = baseCtx(db);
  const config = pianoConfig();
  ctx.set('config', config);
  ctx.set('confDoc', ConfigurazioneDocumento.fromData(config));
  ctx.set('cdu', buildPianoCdu(db, tipo));

  new SelectTemplateStep(logger, new ConfigurazioneDocumentoRepository(db), engine).execute(ctx);
  expect(ctx.get('templateId')).toBe(templateId);
});

test('SelectTemplateStep rejects a focused plan type without a matching MODELLI branch', () => {
  const tables = fixtureTables();
  tables.PIANI.push({ STUDENTE: 'a1@school.it', TIPO: 'PFP', PARAMETRI: '{}' });
  const db = new FakeDatabase(tables);
  const ctx = baseCtx(db);
  const config = pianoConfig();
  ctx.set('config', config);
  ctx.set('confDoc', ConfigurazioneDocumento.fromData(config));
  ctx.set('cdu', buildPianoCdu(db, TipoPiano.PFP));

  expect(() =>
    new SelectTemplateStep(logger, new ConfigurazioneDocumentoRepository(db), engine).execute(ctx)
  ).toThrow('nessun template applicabile');
});

test('CloneTemplateStep copies via Drive facade and sets newFileId', () => {
  const db = new FakeDatabase(fixtureTables());
  const ctx = baseCtx(db);
  ctx.set('destFolderId', 'folder_1');
  ctx.set('nomeFile', 'Verbale_5A_01/07/2026');
  ctx.set('templateId', 'tmpl_verbale');
  const drive = new FakeDriveFacade();
  new CloneTemplateStep(logger, drive).execute(ctx);
  expect(String(ctx.get('newFileId'))).toMatch(/^file_/);
  expect(drive.copies[0]!.templateId).toBe('tmpl_verbale');
});

test('CloneTemplateStep sets newFileLink to a Docs edit URL for FORMATO=GDOC (item 1)', () => {
  const db = new FakeDatabase(fixtureTables());
  const ctx = baseCtx(db); // fixture CONF_DOC[0] (CD1) has FORMATO: 'GDOC'
  ctx.set('destFolderId', 'folder_1');
  ctx.set('nomeFile', 'Verbale_5A_01/07/2026');
  ctx.set('templateId', 'tmpl_verbale');
  const drive = new FakeDriveFacade();
  new CloneTemplateStep(logger, drive).execute(ctx);
  const fileId = ctx.get<string>('newFileId')!;
  expect(ctx.get('newFileLink')).toBe(`https://docs.google.com/document/d/${fileId}/edit`);
});

test('CloneTemplateStep sets newFileLink to a Sheets edit URL for FORMATO=GSHEET (item 1)', () => {
  const db = new FakeDatabase(fixtureTables());
  const ctx = baseCtx(db);
  ctx.set(
    'confDoc',
    ConfigurazioneDocumento.fromData({ ...fixtureTables().CONF_DOC[0]!, FORMATO: 'GSHEET' })
  );
  ctx.set('destFolderId', 'folder_1');
  ctx.set('nomeFile', 'Condotta_5A');
  ctx.set('templateId', 'tmpl_condotta');
  const drive = new FakeDriveFacade();
  new CloneTemplateStep(logger, drive).execute(ctx);
  const fileId = ctx.get<string>('newFileId')!;
  expect(ctx.get('newFileLink')).toBe(
    `https://docs.google.com/spreadsheets/d/${fileId}/edit?gid=0#gid=0`
  );
});

test('CloneTemplateStep falls back to the generic Drive file link for FORMATO=PDF/TEXT (item 1)', () => {
  const db = new FakeDatabase(fixtureTables());
  const ctx = baseCtx(db);
  ctx.set(
    'confDoc',
    ConfigurazioneDocumento.fromData({ ...fixtureTables().CONF_DOC[0]!, FORMATO: 'PDF' })
  );
  ctx.set('destFolderId', 'folder_1');
  ctx.set('nomeFile', 'X');
  ctx.set('templateId', 'tmpl_verbale');
  const drive = new FakeDriveFacade();
  new CloneTemplateStep(logger, drive).execute(ctx);
  const fileId = ctx.get<string>('newFileId')!;
  expect(ctx.get('newFileLink')).toBe(`https://drive.google.com/file/d/${fileId}/edit`);
});

test('RenderTemplateStep delegates to strategy → WorkspaceTemplateEngine with the CDU as context', () => {
  const db = new FakeDatabase(fixtureTables());
  const ctx = baseCtx(db);
  ctx.set('newFileId', 'file_1');
  const templates = new FakeTemplateEngine();
  const registry = new Map([['VERBALE_CDC', new VerbaleGeneratorStrategy(templates)]]);
  new RenderTemplateStep(logger, registry).execute(ctx);
  const rendered = templates.contextFor('file_1') as {
    focus: { classe: { anagrafica: { nome: string } } };
  };
  expect(rendered.focus.classe.anagrafica.nome).toBe('5A');
});

test('RegisterDocumentStep writes LOG_DOCS row with STATO GENERATO (persisted at commit)', () => {
  const db = new FakeDatabase(fixtureTables());
  const ctx = baseCtx(db);
  ctx.set('newFileId', 'file_1');
  ctx.set('newFileLink', 'https://drive/file_1');
  ctx.set('nomeFile', 'Verbale_5A_01/07/2026');
  ctx.set('destFolderPath', 'Verbali/5');
  new RegisterDocumentStep(logger, db, new FakeTemplateEngine()).execute(ctx);
  const row = db.table('LOG_DOCS').find((r) => r.ID === 'file_1');
  expect(row?.STATO).toBe('GENERATO');
  expect(row?.CLASSI).toBe('5A');
});

test('RegisterDocumentStep stores only REGISTRA_DOC-rendered metadata', () => {
  const db = new FakeDatabase(fixtureTables());
  const ctx = baseCtx(db);
  const config = {
    ...fixtureTables().CONF_DOC[0]!,
    REGISTRA_DOC: JSON.stringify({
      classi: '{{focus.classe.anagrafica.nome}}',
      utenti: 'destinatario@scuola.it',
      materie: 'MATE,FISI'
    })
  };
  ctx.set('config', config);
  ctx.set('confDoc', ConfigurazioneDocumento.fromData(config));
  ctx.set('newFileId', 'file_metadata');
  ctx.set('nomeFile', 'Verbale_5A');

  new RegisterDocumentStep(logger, db, new FakeTemplateEngine()).execute(ctx);

  expect(db.table('LOG_DOCS').find((row) => row.ID === 'file_metadata')).toMatchObject({
    CLASSI: '5A',
    UTENTI: 'destinatario@scuola.it',
    MATERIE: 'MATE,FISI'
  });
});

test('RegisterDocumentStep leaves unconfigured metadata blank without legacy fallback', () => {
  const db = new FakeDatabase(fixtureTables());
  const ctx = baseCtx(db);
  const config = { ...fixtureTables().CONF_DOC[0]!, REGISTRA_DOC: '{}' };
  ctx.set('config', config);
  ctx.set('confDoc', ConfigurazioneDocumento.fromData(config));
  ctx.set('cdu', buildAlunnoCdu(db));
  ctx.set('newFileId', 'file_empty_metadata');
  ctx.set('nomeFile', 'PDP_a1');

  new RegisterDocumentStep(logger, db, new FakeTemplateEngine()).execute(ctx);

  expect(db.table('LOG_DOCS').find((row) => row.ID === 'file_empty_metadata')).toMatchObject({
    CLASSI: '',
    UTENTI: '',
    MATERIE: ''
  });
});

test('RegisterDocumentStep writes plan identity from CONF_DOC and focused CDU, not PARAMETRI', () => {
  const db = new FakeDatabase(fixtureTables());
  const ctx = baseCtx(db);
  const config = { ...pianoConfig(), PARAMETRI: JSON.stringify({ tipoPiano: 'PDP_DSA' }) };
  ctx.set('config', config);
  ctx.set('confDoc', ConfigurazioneDocumento.fromData(config));
  ctx.set('cdu', buildPianoCdu(db, TipoPiano.PEI));
  ctx.set('newFileId', 'file_pdp_bes');
  ctx.set('newFileLink', 'https://drive/file_pdp_bes');
  ctx.set('nomeFile', 'PDP_BES_a1');
  ctx.set('destFolderPath', 'Alunni BES/5A');
  new RegisterDocumentStep(logger, db, new FakeTemplateEngine()).execute(ctx);
  const row = db.table('LOG_DOCS').find((r) => r.ID === 'file_pdp_bes');
  expect(row).toMatchObject({
    ID_GEN: 'PIANI_PERSONALIZZATI',
    TIPO: 'PIANO_PERS',
    SOTTOTIPO: 'PEI',
    UTENTI: 'a1@school.it'
  });
});

test('RegisterDocumentStep keeps SOTTOTIPO empty for non-plan generators even with legacy PARAMETRI.tipoPiano', () => {
  const db = new FakeDatabase(fixtureTables());
  const ctx = baseCtx(db);
  const confRow = fixtureTables().CONF_DOC[0]!;
  const config = { ...confRow, PARAMETRI: JSON.stringify({ tipoPiano: 'PEI' }) };
  ctx.set('config', config);
  ctx.set('confDoc', ConfigurazioneDocumento.fromData(config));
  ctx.set('newFileId', 'file_1');
  ctx.set('newFileLink', 'https://drive/file_1');
  ctx.set('nomeFile', 'Verbale_5A');
  ctx.set('destFolderPath', 'Verbali/5');
  new RegisterDocumentStep(logger, db, new FakeTemplateEngine()).execute(ctx);
  const row = db.table('LOG_DOCS').find((r) => r.ID === 'file_1');
  expect(row?.SOTTOTIPO).toBe('');
});

// 5A/MATE resolves to bianchi@school.it via VARIAZIONI_CATTEDRA (rossi is the
// nominal CLASSI.MATE holder but was reassigned to bianchi effective
// 2025-10-01, before this fixed `now`) — same fixture fact relied on by
// document-generation-service.test.ts's generateForDocenteClasseMateria case.
test('RegisterDocumentStep writes SOTTOTIPO as materiaId::docenteEmail for DOCUMENTO_DOCENTE_CLASSE_MATERIA', () => {
  const db = new FakeDatabase(fixtureTables());
  const ctx = baseCtx(db);
  const config = { ...fixtureTables().CONF_DOC[0]!, TIPO: 'DOCUMENTO_DOCENTE_CLASSE_MATERIA' };
  ctx.set('config', config);
  ctx.set('confDoc', ConfigurazioneDocumento.fromData(config));
  ctx.set('cdu', buildDocenteClasseMateriaCdu(db, 'bianchi@school.it', 'MATE'));
  ctx.set('newFileId', 'file_docmat');
  ctx.set('newFileLink', 'https://drive/file_docmat');
  ctx.set('nomeFile', 'Programma_MATE');
  ctx.set('destFolderPath', 'Docs');
  new RegisterDocumentStep(logger, db, new FakeTemplateEngine()).execute(ctx);
  const row = db.table('LOG_DOCS').find((r) => r.ID === 'file_docmat');
  expect(row?.SOTTOTIPO).toBe('MATE::bianchi@school.it');
});

test('RegisterDocumentStep writes SOTTOTIPO as materiaId for DOCUMENTO_CLASSE_MATERIA', () => {
  const db = new FakeDatabase(fixtureTables());
  const ctx = baseCtx(db);
  const config = { ...fixtureTables().CONF_DOC[0]!, TIPO: 'DOCUMENTO_CLASSE_MATERIA' };
  ctx.set('config', config);
  ctx.set('confDoc', ConfigurazioneDocumento.fromData(config));
  ctx.set('cdu', buildClasseMateriaCdu(db, 'MATE'));
  ctx.set('newFileId', 'file_classemat');
  ctx.set('newFileLink', 'https://drive/file_classemat');
  ctx.set('nomeFile', 'Programma_MATE');
  ctx.set('destFolderPath', 'Docs');

  new RegisterDocumentStep(logger, db, new FakeTemplateEngine()).execute(ctx);

  expect(db.table('LOG_DOCS').find((r) => r.ID === 'file_classemat')?.SOTTOTIPO).toBe('MATE');
});

test('CLASSE_MATERIA exposes the active SUPPLENZE actor, not the nominal holder', () => {
  const tables = fixtureTables();
  tables.CLASSI.push({
    ID: '4B',
    ANNO: 4,
    INDIRIZZO: 'SCIENTIFICO',
    ARTICOLAZIONE: null,
    RUOLI: null,
    ATTIVA: true,
    COORD: '',
    MATE: 'rossi@school.it'
  });
  const cdu = buildClasseMateriaCdu(
    new FakeDatabase(tables),
    'MATE',
    new Date('2025-11-15T09:00:00Z'),
    '4B'
  );

  expect(cdu.focus.classiMateria?.docenti.map((docente) => docente.email)).toEqual([
    'bianchi@school.it'
  ]);
});

test('CLASSE_DOCENTE_MATERIA resolves the active SUPPLENZE substitute as focus.docente, not just the nominal titolare', () => {
  const tables = fixtureTables();
  tables.CLASSI.push({
    ID: '4B',
    ANNO: 4,
    INDIRIZZO: 'SCIENTIFICO',
    ARTICOLAZIONE: null,
    RUOLI: null,
    ATTIVA: true,
    COORD: '',
    MATE: 'rossi@school.it'
  });
  const db = new FakeDatabase(tables);

  // Before the Recipe.ts fix, CLASSE_DOCENTE_MATERIA had no gestioneSupplenti
  // default (SOLO_TITOLARI), so the council only contains rossi@school.it (the
  // nominal titolare) and this lookup for the active substitute would throw
  // "DOCUMENTO_DOCENTE_CLASSE_MATERIA: docente bianchi@school.it non trovato
  // nel consiglio di classe".
  const cdu = composeContextBuilder(db).build(
    {
      target: '4B',
      tipoTarget: 'classe',
      docenteCorrente: 'bianchi@school.it',
      materiaCorrente: 'MATE',
      now: new Date('2025-11-15T09:00:00Z')
    },
    recipe('CLASSE_DOCENTE_MATERIA')
  );

  expect(cdu.focus.docente?.email).toBe('bianchi@school.it');
  expect(cdu.focus.materia?.sigla).toBe('MATE');
});

test('CheckDuplicatesStep: DOCUMENTO_DOCENTE_CLASSE_MATERIA identity includes the materia::docente SOTTOTIPO', () => {
  const tables = fixtureTables();
  tables.LOG_DOCS = [
    {
      ID: 'old',
      ID_GEN: 'CD1',
      TIPO: 'DOCUMENTO_DOCENTE_CLASSE_MATERIA',
      SOTTOTIPO: 'MATE::bianchi@school.it',
      PATH: 'Verbali/5',
      NOME: 'Verbale_5A_01/07/2026',
      CLASSI: '5A',
      STATO: 'GENERATO'
    }
  ];
  const db = new FakeDatabase(tables);
  const ctx = baseCtx(db);
  const config = { ...fixtureTables().CONF_DOC[0]!, TIPO: 'DOCUMENTO_DOCENTE_CLASSE_MATERIA' };
  ctx.set('config', config);
  ctx.set('confDoc', ConfigurazioneDocumento.fromData(config));
  ctx.set('cdu', buildDocenteClasseMateriaCdu(db, 'bianchi@school.it', 'MATE'));

  new CheckDuplicatesStep(logger, db, new FakeTemplateEngine()).execute(ctx);
  expect(ctx.get('shouldGenerate')).toBe(false);
  expect(String(ctx.get('skipReason'))).toContain('SOTTOTIPO=MATE::bianchi@school.it');
});

test('CheckDuplicatesStep: DOCUMENTO_DOCENTE_CLASSE_MATERIA matches legacy persisted TIPO', () => {
  const tables = fixtureTables();
  tables.LOG_DOCS = [
    {
      ID: 'old',
      ID_GEN: 'CD1',
      TIPO: 'DOCUMENTO_DOCENTE_MATERIA',
      SOTTOTIPO: 'MATE::bianchi@school.it',
      PATH: 'Verbali/5',
      NOME: 'Verbale_5A_01/07/2026',
      CLASSI: '5A',
      STATO: 'GENERATO'
    }
  ];
  const db = new FakeDatabase(tables);
  const ctx = baseCtx(db);
  const config = { ...fixtureTables().CONF_DOC[0]!, TIPO: 'DOCUMENTO_DOCENTE_CLASSE_MATERIA' };
  ctx.set('config', config);
  ctx.set('confDoc', ConfigurazioneDocumento.fromData(config));
  ctx.set('cdu', buildDocenteClasseMateriaCdu(db, 'bianchi@school.it', 'MATE'));

  new CheckDuplicatesStep(logger, db, new FakeTemplateEngine()).execute(ctx);

  expect(ctx.get('shouldGenerate')).toBe(false);
});

test('critical steps are exactly the rollback points of 10 §8', () => {
  expect([...CRITICAL_STEPS].sort()).toEqual([
    'CloneTemplate',
    'PrepareInfrastructure',
    'RegisterDocument',
    'RenderTemplate',
    'SelectTemplate'
  ]);
});

test('PostProcessStep runs shared POST_PROCESSO actions (10 §12)', () => {
  const tables = fixtureTables();
  tables['LOG_DOCS'] = [{ ID: 'file_9', ID_GEN: 'CD1', STATO: 'GENERATO', CLASSI: '5A' }];
  const db = new FakeDatabase(tables);
  const ctx = baseCtx(db);
  const row = {
    ...fixtureTables().CONF_DOC[0]!,
    POST_PROCESSO: JSON.stringify([
      { tipo: 'AGGIORNA_STATO_DOC', stato: 'ARCHIVIATO', criteri: { ID: 'file_9' } }
    ])
  };
  ctx.set('config', row);
  new PostProcessStep(
    logger,
    db,
    new FakeTemplateEngine(),
    new Date('2026-07-05T10:00:00Z')
  ).execute(ctx);
  expect(db.tables['LOG_DOCS']!.getByPK('file_9')!['STATO']).toBe('ARCHIVIATO');
  expect(ctx.get('postProcessUpdated')).toBe(1);
});

test('PostProcessStep skipped when POST_PROCESSO is null', () => {
  const db = new FakeDatabase(fixtureTables());
  const ctx = baseCtx(db); // fixture CD1 has POST_PROCESSO null
  new PostProcessStep(logger, db, new FakeTemplateEngine(), new Date()).execute(ctx);
  expect(ctx.get('postProcessUpdated')).toBeNull();
});

test("PostProcessStep skipped when POST_PROCESSO is an empty string (regression: blank Sheets cells round-trip as '', not null)", () => {
  const db = new FakeDatabase(fixtureTables());
  const ctx = baseCtx(db);
  ctx.set('config', { ...fixtureTables().CONF_DOC[0]!, POST_PROCESSO: '' });
  new PostProcessStep(logger, db, new FakeTemplateEngine(), new Date()).execute(ctx);
  expect(ctx.get('postProcessUpdated')).toBeNull();
});

test('ApplyPermissionsStep resolves roles and applies file + folder ACLs (10 §10, 14 §1)', () => {
  const db = new FakeDatabase(fixtureTables());
  const ctx = baseCtx(db);
  const perms = {
    file: [{ ruolo: 'COORDINATORI', permesso: 'SCRITTURA' }],
    folder: [{ ruolo: 'CDC', permesso: 'LETTURA' }],
    regolaSupplente: { file: 'SOLO_TITOLARI', folder: 'SOLO_TITOLARI' }
  };
  ctx.set('config', { ...fixtureTables().CONF_DOC[0]!, PERMESSI: JSON.stringify(perms) });
  ctx.set('newFileId', 'file_1');
  ctx.set('destFolderId', 'folder_1');
  const drive = new FakeDriveFacade();
  new ApplyPermissionsStep(logger, drive, composeRisolutoreRuoli(db)).execute(ctx);

  const fileAcls = drive.permissions.filter((p) => p.fileId === 'file_1');
  expect(fileAcls).toEqual([{ fileId: 'file_1', email: 'rossi@school.it', permesso: 'SCRITTURA' }]);
  const folderAcls = drive.permissions
    .filter((p) => p.fileId === 'folder_1')
    .map((p) => p.email)
    .sort();
  // 5A: MATE effective holder is bianchi (VARIAZIONI_CATTEDRA, decorsa since 2025-10-01,
  // and NOW=2026-07-01 is well after); FISI nominal holder is also bianchi -> CDC
  // (routed through CattedraResolver, 10 §14) has one distinct effective teacher.
  expect(folderAcls).toEqual(['bianchi@school.it']);
  // File+folder ACLs (2 distinct roles here) collapse into a single setPermissions
  // batch call, not one Drive round-trip per role/email pair.
  expect(drive.setPermissionsCallCount).toBe(1);
});

test('ApplyPermissionsStep is skipped when PERMESSI is null', () => {
  const db = new FakeDatabase(fixtureTables());
  const ctx = baseCtx(db); // CD1 has PERMESSI null
  const drive = new FakeDriveFacade();
  new ApplyPermissionsStep(logger, drive, composeRisolutoreRuoli(db)).execute(ctx);
  expect(drive.permissions).toEqual([]);
});

test("ApplyPermissionsStep is skipped when PERMESSI is an empty string (regression: blank Sheets cells round-trip as '', not null)", () => {
  const db = new FakeDatabase(fixtureTables());
  const ctx = baseCtx(db);
  ctx.set('config', { ...fixtureTables().CONF_DOC[0]!, PERMESSI: '' });
  const drive = new FakeDriveFacade();
  new ApplyPermissionsStep(logger, drive, composeRisolutoreRuoli(db)).execute(ctx);
  expect(drive.permissions).toEqual([]);
});

describe('CheckDuplicatesStep — DUPLICAZIONE policy', () => {
  test('PERMESSA bypasses the duplicate check for an otherwise identical document', () => {
    const tables = fixtureTables();
    tables.LOG_DOCS = [
      {
        ID: 'old',
        ID_GEN: 'CD1',
        TIPO: 'VERBALE',
        SOTTOTIPO: '',
        PATH: 'Verbali/5',
        NOME: 'Verbale_5A_01/07/2026',
        CLASSI: '5A',
        STATO: 'GENERATO'
      }
    ];
    const db = new FakeDatabase(tables);
    const ctx = baseCtx(db);
    ctx.set('config', {
      ...fixtureTables().CONF_DOC[0]!,
      DUPLICAZIONE: DuplicazioneDocumento.PERMESSA
    });
    const result = new CheckDuplicatesStep(logger, db, new FakeTemplateEngine()).execute(ctx);
    expect(ctx.get('shouldGenerate')).toBe(true);
    expect(ctx.get('skipReason')).toBeNull();
    expect(logDetails(result)).toBe('Duplicates allowed');
  });

  test('NEGATA allows a document whose NOME differs despite matching TIPO/SOTTOTIPO/ID_GEN/PATH', () => {
    const tables = fixtureTables();
    tables.LOG_DOCS = [
      {
        ID: 'old',
        ID_GEN: 'CD1',
        TIPO: 'VERBALE',
        SOTTOTIPO: '',
        PATH: 'Verbali/5',
        NOME: 'Altro_verbale',
        CLASSI: '5A',
        STATO: 'GENERATO'
      }
    ];
    const db = new FakeDatabase(tables);
    const ctx = baseCtx(db);
    ctx.set('config', {
      ...fixtureTables().CONF_DOC[0]!,
      DUPLICAZIONE: DuplicazioneDocumento.NEGATA
    });
    new CheckDuplicatesStep(logger, db, new FakeTemplateEngine()).execute(ctx);
    expect(ctx.get('shouldGenerate')).toBe(true);
  });

  test('NEGATA recognizes a duplicate even when {{progressivo}} makes the rendered name differ from the stored NOME', () => {
    const tables = fixtureTables();
    tables.LOG_DOCS = [
      {
        ID: 'old',
        ID_GEN: 'CD1',
        TIPO: 'VERBALE',
        SOTTOTIPO: '',
        PATH: 'Verbali/5',
        NOME: 'Verbale_1', // stored with a progressivo baked in from a prior run
        CLASSI: '5A',
        STATO: 'GENERATO'
      }
    ];
    const db = new FakeDatabase(tables);
    const ctx = baseCtx(db);
    ctx.set('config', {
      ...fixtureTables().CONF_DOC[0]!,
      FILE_NAME: 'Verbale_{{progressivo}}', // today's render would produce e.g. "Verbale_2" (unresolved/different number)
      DUPLICAZIONE: DuplicazioneDocumento.NEGATA
    });

    new CheckDuplicatesStep(logger, db, new FakeTemplateEngine()).execute(ctx);

    expect(ctx.get('shouldGenerate')).toBe(false);
  });
});

describe('PrepareInfrastructureStep registration metadata options', () => {
  test('passes the configured metadata rather than an implicit class fallback', () => {
    const db = new FakeDatabase(fixtureTables());
    const ctx = baseCtx(db); // buildCdu targets classe '5A' -> focus.classe.anagrafica.nome === '5A'
    const findOrCreateSpy = jest
      .spyOn(AlberoCartelle.prototype, 'findOrCreate')
      .mockReturnValue({ folderId: 'f1', created: true });
    new PrepareInfrastructureStep(
      logger,
      new FakeDriveFacade(),
      db,
      new FakeTemplateEngine()
    ).execute(ctx);
    expect(findOrCreateSpy).toHaveBeenCalledWith('Verbali/5', {
      classi: '',
      utenti: '',
      materie: '',
      tipo: 'CD1',
      nome: '5'
    });
    findOrCreateSpy.mockRestore();
  });

  test('calls AlberoCartelle.findOrCreate without a classe option when classeNome(ctx) is empty', () => {
    const db = new FakeDatabase(fixtureTables());
    const ctx = new PipelineContext();
    // A literal PATH_OUT (no {{focus.classe...}} placeholder) + a minimal fake
    // CDU whose focus.classe is undefined -> classeNome(ctx) === ''.
    ctx.set('config', { ...fixtureTables().CONF_DOC[0]!, PATH_OUT: 'Verbali/Fisso' });
    ctx.set('confDoc', ConfigurazioneDocumento.fromData(fixtureTables().CONF_DOC[0]!));
    const minimalCdu: Cdu = {
      meta: {
        timestamp: '2026-07-01T09:00:00.000Z',
        idConfigurazione: 'CD1',
        tipoOperazione: 'GENERAZIONE_DOCUMENTO',
        idEsecuzione: 'EXEC-test',
        date: {
          oggi: {
            breve: '01/07/2026',
            estesa: '01 luglio 2026',
            iso: '2026-07-01',
            giorno: '01',
            mese: '07',
            anno: '2026',
            ora: '09:00'
          }
        },
        parametriInput: {
          target: '',
          tipoTarget: 'classe',
          materiaCorrente: null,
          opzioni: {}
        }
      },
      focus: {},
      tech: {
        entita: {},
        servizi: [],
        pipeline: { statoCorrente: 'IN_CORSO', stepEseguiti: [], errori: [], logEsecuzione: [] }
      }
    };
    ctx.set('cdu', minimalCdu);
    ctx.set('shouldGenerate', true);
    const findOrCreateSpy = jest
      .spyOn(AlberoCartelle.prototype, 'findOrCreate')
      .mockReturnValue({ folderId: 'f2', created: true });
    new PrepareInfrastructureStep(
      logger,
      new FakeDriveFacade(),
      db,
      new FakeTemplateEngine()
    ).execute(ctx);
    expect(findOrCreateSpy).toHaveBeenCalledWith('Verbali/Fisso', {
      classi: '',
      utenti: '',
      materie: '',
      tipo: 'CD1',
      nome: 'Fisso'
    });
    findOrCreateSpy.mockRestore();
  });
});

describe('ApplyPermissionsStep — newFileId/destFolderId gates and parseRegola mapping (via observable supplenza routing)', () => {
  const INSIDE_WINDOW = new Date('2025-11-15T09:00:00Z'); // rossi -> bianchi -> verdi chain active for 5A

  function buildCduAt(db: FakeDatabase, now: Date): Cdu {
    return composeContextBuilder(db).build(
      { target: '5A', tipoTarget: 'classe', now },
      recipe('CLASSE_COMPLETA')
    );
  }

  test('does not call applica for file when ctx.get("newFileId") is null (no file ACLs applied)', () => {
    const db = new FakeDatabase(fixtureTables());
    const ctx = baseCtx(db);
    ctx.set('config', {
      ...fixtureTables().CONF_DOC[0]!,
      PERMESSI: JSON.stringify({
        file: [{ ruolo: 'COORDINATORI', permesso: 'SCRITTURA' }],
        folder: []
      })
    });
    ctx.set('destFolderId', 'folder_1'); // newFileId intentionally left unset (null)
    const drive = new FakeDriveFacade();
    new ApplyPermissionsStep(logger, drive, composeRisolutoreRuoli(db)).execute(ctx);
    expect(drive.permissions).toEqual([]);
  });

  test('does not call applica for folder when ctx.get("destFolderId") is null (no folder ACLs applied)', () => {
    const db = new FakeDatabase(fixtureTables());
    const ctx = baseCtx(db);
    ctx.set('config', {
      ...fixtureTables().CONF_DOC[0]!,
      PERMESSI: JSON.stringify({
        file: [],
        folder: [{ ruolo: 'COORDINATORI', permesso: 'LETTURA' }]
      })
    });
    ctx.set('newFileId', 'file_1'); // destFolderId intentionally left unset (null)
    const drive = new FakeDriveFacade();
    new ApplyPermissionsStep(logger, drive, composeRisolutoreRuoli(db)).execute(ctx);
    expect(drive.permissions).toEqual([]);
  });

  test.each([
    ['SOLO_SUPPLENTI', ['rossi@school.it']],
    ['ENTRAMBI', ['rossi@school.it']],
    [undefined, ['rossi@school.it']]
  ])(
    'regolaSupplente.file=%p maps to the GestioneSupplenti routing that resolves to %p',
    (regolaFile, expected) => {
      const db = new FakeDatabase(fixtureTables());
      const cdu = buildCduAt(db, INSIDE_WINDOW);
      const ctx = new PipelineContext();
      const perms: Record<string, unknown> = {
        file: [{ ruolo: 'COORDINATORI', permesso: 'SCRITTURA' }],
        folder: []
      };
      if (regolaFile !== undefined) perms['regolaSupplente'] = { file: regolaFile };
      ctx.set('config', { ...fixtureTables().CONF_DOC[0]!, PERMESSI: JSON.stringify(perms) });
      ctx.set('confDoc', ConfigurazioneDocumento.fromData(fixtureTables().CONF_DOC[0]!));
      ctx.set('cdu', cdu);
      ctx.set('shouldGenerate', true);
      ctx.set('newFileId', 'file_1');
      const drive = new FakeDriveFacade();
      new ApplyPermissionsStep(logger, drive, composeRisolutoreRuoli(db)).execute(ctx);
      const fileEmails = drive.permissions
        .filter((p) => p.fileId === 'file_1')
        .map((p) => p.email)
        .sort();
      expect(fileEmails).toEqual(expected);
    }
  );

  test('rejects an unknown CONF_DOC.PERMESSI.regolaSupplente value', () => {
    const db = new FakeDatabase(fixtureTables());
    const ctx = baseCtx(db);
    ctx.set('config', {
      ...fixtureTables().CONF_DOC[0]!,
      PERMESSI: JSON.stringify({
        file: [{ ruolo: 'CDC', permesso: 'SCRITTURA' }],
        regolaSupplente: { file: 'QUALCOSA_DI_IGNOTO' }
      })
    });
    ctx.set('newFileId', 'file_1');

    expect(() =>
      new ApplyPermissionsStep(
        logger,
        new FakeDriveFacade(),
        composeRisolutoreRuoli(db)
      ).execute(ctx)
    ).toThrow(/regolaSupplente non valida/);
  });

  test('missing regolaSupplente preserves Drive ACL default SOLO_TITOLARI', () => {
    const db = new FakeDatabase(fixtureTables());
    const ctx = baseCtx(db);
    ctx.set('config', {
      ...fixtureTables().CONF_DOC[0]!,
      PERMESSI: JSON.stringify({
        file: [{ ruolo: 'CDC', permesso: 'SCRITTURA' }]
      })
    });
    ctx.set('newFileId', 'file_1');
    const seen: Array<GestioneSupplenti | undefined> = [];
    const roles = {
      risolvi: (
        _ruolo: string,
        _cdu: unknown,
        options?: { regolaSupplente?: GestioneSupplenti }
      ) => {
        seen.push(options?.regolaSupplente);
        return [];
      }
    };

    new ApplyPermissionsStep(logger, new FakeDriveFacade(), roles).execute(ctx);

    expect(seen).toEqual([GestioneSupplenti.SOLO_TITOLARI]);
  });

  test('calls applica for both file and folder when both ids are present, using their respective regolaSupplente', () => {
    const db = new FakeDatabase(fixtureTables());
    const cdu = buildCduAt(db, INSIDE_WINDOW);
    const ctx = new PipelineContext();
    const perms = {
      file: [{ ruolo: 'COORDINATORI', permesso: 'SCRITTURA' }],
      folder: [{ ruolo: 'COORDINATORI', permesso: 'LETTURA' }],
      regolaSupplente: { file: 'SOLO_SUPPLENTI', folder: 'ENTRAMBI' }
    };
    ctx.set('config', { ...fixtureTables().CONF_DOC[0]!, PERMESSI: JSON.stringify(perms) });
    ctx.set('confDoc', ConfigurazioneDocumento.fromData(fixtureTables().CONF_DOC[0]!));
    ctx.set('cdu', cdu);
    ctx.set('shouldGenerate', true);
    ctx.set('newFileId', 'file_1');
    ctx.set('destFolderId', 'folder_1');
    const drive = new FakeDriveFacade();
    new ApplyPermissionsStep(logger, drive, composeRisolutoreRuoli(db)).execute(ctx);

    const fileEmails = drive.permissions
      .filter((p) => p.fileId === 'file_1')
      .map((p) => p.email)
      .sort();
    const folderEmails = drive.permissions
      .filter((p) => p.fileId === 'folder_1')
      .map((p) => p.email)
      .sort();
    expect(fileEmails).toEqual(['rossi@school.it']); // non-teaching role remains declared
    expect(folderEmails).toEqual(['rossi@school.it']); // non-teaching role remains declared
  });
});
