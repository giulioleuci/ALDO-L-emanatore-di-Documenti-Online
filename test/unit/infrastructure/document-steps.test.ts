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
} from '../../../src/infrastructure/steps/documentSteps';
import { RisolutoreRuoliService } from '../../../src/application/services/RisolutoreRuoliService';
import { VerbaleGeneratorStrategy } from '../../../src/application/strategies/VerbaleGeneratorStrategy';
import { ConfigurazioneDocumento } from '../../../src/domain/entities/ConfigurazioneDocumento';
import { ConfigurazioneDocumentoRepository } from '../../../src/infrastructure/repositories/ConfigurazioneDocumentoRepository';
import { ExpressionEngineFacade } from '../../../src/infrastructure/facades/ExpressionEngineFacade';
import { ContextEngineFactory } from '../../../src/application/context-engine/ContextEngineFactory';
import { recipe } from '../../../src/application/context-engine/Recipe';
import type { Cdu } from '../../../src/application/context-engine/Cdu';
import { FakeDriveFacade } from '../../../test/fakes/FakeDriveFacade';
import { FakeTemplateEngine } from '../../../test/fakes/FakeTemplateEngine';
import { FakeDatabase } from '../../../test/fakes/FakeDatabase';
import { fixtureTables } from '../../../test/fixtures/tables';
import { AlberoCartelle } from '../../../src/infrastructure/services/AlberoCartelle';
import { SchemaSottocartelle } from '../../../src/domain/value-objects/enums';

const logger = new LoggerService();
const engine = new ExpressionEngineFacade();

function buildCdu(db: FakeDatabase): Cdu {
  return ContextEngineFactory.create(db).build(
    { target: '5A', tipoTarget: 'classe', now: new Date('2026-07-01T09:00:00Z') },
    recipe('CLASSE_COMPLETA')
  );
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

test('CheckDuplicatesStep: existing LOG_DOCS row for same ID_GEN+classe closes the gate (10 §4)', () => {
  const tables = fixtureTables();
  tables.LOG_DOCS = [{ ID: 'old', ID_GEN: 'CD1', CLASSI: '5A', STATO: 'GENERATO' }];
  const db = new FakeDatabase(tables);
  const ctx = baseCtx(db);
  new CheckDuplicatesStep(logger, db).execute(ctx);
  expect(ctx.get('shouldGenerate')).toBe(false);
  expect(String(ctx.get('skipReason'))).toContain('5A');
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
  expect(row?.PATH).toBe('Verbali/5');
});

test('PrepareInfrastructureStep reuses an existing folder without a duplicate LOG_FOLD row', () => {
  const db = new FakeDatabase(fixtureTables());
  const ctx = baseCtx(db);
  const drive = new FakeDriveFacade();
  const existing = drive.createFolder('Verbali/5'); // pre-existing folder
  new PrepareInfrastructureStep(logger, drive, db, new FakeTemplateEngine()).execute(ctx);
  expect(ctx.get('destFolderId')).toBe(existing);
  expect(db.table('LOG_FOLD').findAll()).toHaveLength(0); // not re-registered
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
  new RegisterDocumentStep(logger, db).execute(ctx);
  const row = db.table('LOG_DOCS').find((r) => r.ID === 'file_1');
  expect(row?.STATO).toBe('GENERATO');
  expect(row?.CLASSI).toBe('5A');
});

test('critical steps are exactly the rollback points of 10 §8', () => {
  expect([...CRITICAL_STEPS].sort()).toEqual([
    'CloneTemplate',
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
  new ApplyPermissionsStep(logger, drive, new RisolutoreRuoliService(db)).execute(ctx);

  const fileAcls = drive.permissions.filter((p) => p.fileId === 'file_1');
  expect(fileAcls).toEqual([{ fileId: 'file_1', email: 'rossi@school.it', permesso: 'SCRITTURA' }]);
  const folderAcls = drive.permissions
    .filter((p) => p.fileId === 'folder_1')
    .map((p) => p.email)
    .sort();
  expect(folderAcls).toEqual(['bianchi@school.it', 'rossi@school.it']);
});

test('ApplyPermissionsStep is skipped when PERMESSI is null', () => {
  const db = new FakeDatabase(fixtureTables());
  const ctx = baseCtx(db); // CD1 has PERMESSI null
  const drive = new FakeDriveFacade();
  new ApplyPermissionsStep(logger, drive, new RisolutoreRuoliService(db)).execute(ctx);
  expect(drive.permissions).toEqual([]);
});

describe('CheckDuplicatesStep — SCHEMA_SOTTOCARTELLE MULTIPLO_PER_CLASSE skip branch', () => {
  test('skips dedup checking entirely (no early-return on a matching LOG_DOCS row) when SCHEMA_SOTTOCARTELLE is MULTIPLO_PER_CLASSE', () => {
    const tables = fixtureTables();
    // Row that WOULD otherwise trigger the dedup early-return (same ID_GEN + classe as CD1/5A).
    tables.LOG_DOCS = [{ ID: 'old', ID_GEN: 'CD1', CLASSI: '5A', STATO: 'GENERATO' }];
    const db = new FakeDatabase(tables);
    const ctx = baseCtx(db);
    ctx.set('config', {
      ...fixtureTables().CONF_DOC[0]!,
      SCHEMA_SOTTOCARTELLE: SchemaSottocartelle.MULTIPLO_PER_CLASSE
    });
    new CheckDuplicatesStep(logger, db).execute(ctx);
    // Gate untouched: still true (as baseCtx set it), no skipReason recorded.
    expect(ctx.get('shouldGenerate')).toBe(true);
    expect(ctx.get('skipReason')).toBeNull();
  });
});

describe('PrepareInfrastructureStep — classeNome(ctx) empty-vs-non-empty options to AlberoCartelle.findOrCreate', () => {
  test('passes { classe } when classeNome(ctx) is non-empty', () => {
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
    expect(findOrCreateSpy).toHaveBeenCalledWith('Verbali/5', { classe: '5A' });
    findOrCreateSpy.mockRestore();
  });

  test('calls AlberoCartelle.findOrCreate without a classe option when classeNome(ctx) is empty', () => {
    const db = new FakeDatabase(fixtureTables());
    const ctx = new PipelineContext();
    // A literal PATH_OUT (no {{focus.classe...}} placeholder) + a minimal fake
    // CDU whose focus.classe is undefined -> classeNome(ctx) === ''.
    ctx.set('config', { ...fixtureTables().CONF_DOC[0]!, PATH_OUT: 'Verbali/Fisso' });
    ctx.set('confDoc', ConfigurazioneDocumento.fromData(fixtureTables().CONF_DOC[0]!));
    const minimalCdu: Cdu = { focus: {} };
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
    expect(findOrCreateSpy).toHaveBeenCalledWith('Verbali/Fisso', {});
    findOrCreateSpy.mockRestore();
  });
});

describe('ApplyPermissionsStep — newFileId/destFolderId gates and parseRegola mapping (via observable supplenza routing)', () => {
  const INSIDE_WINDOW = new Date('2025-11-15T09:00:00Z'); // rossi -> bianchi -> verdi chain active for 5A

  function buildCduAt(db: FakeDatabase, now: Date): Cdu {
    return ContextEngineFactory.create(db).build(
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
    new ApplyPermissionsStep(logger, drive, new RisolutoreRuoliService(db)).execute(ctx);
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
    new ApplyPermissionsStep(logger, drive, new RisolutoreRuoliService(db)).execute(ctx);
    expect(drive.permissions).toEqual([]);
  });

  test.each([
    ['SOLO_SUPPLENTI', ['verdi@school.it']],
    ['ENTRAMBI', ['rossi@school.it', 'verdi@school.it']],
    [undefined, ['rossi@school.it']],
    ['QUALCOSA_DI_IGNOTO', ['rossi@school.it']]
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
      new ApplyPermissionsStep(logger, drive, new RisolutoreRuoliService(db)).execute(ctx);
      const fileEmails = drive.permissions
        .filter((p) => p.fileId === 'file_1')
        .map((p) => p.email)
        .sort();
      expect(fileEmails).toEqual(expected);
    }
  );

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
    new ApplyPermissionsStep(logger, drive, new RisolutoreRuoliService(db)).execute(ctx);

    const fileEmails = drive.permissions
      .filter((p) => p.fileId === 'file_1')
      .map((p) => p.email)
      .sort();
    const folderEmails = drive.permissions
      .filter((p) => p.fileId === 'folder_1')
      .map((p) => p.email)
      .sort();
    expect(fileEmails).toEqual(['verdi@school.it']); // SOLO_SUPPLENTI -> chain-resolved delegate only
    expect(folderEmails).toEqual(['rossi@school.it', 'verdi@school.it']); // ENTRAMBI -> both
  });
});
