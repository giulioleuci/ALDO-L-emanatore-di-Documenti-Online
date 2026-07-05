import {
  AnalyzeContextStep, CheckDuplicatesStep, PrepareInfrastructureStep, GenerateNameStep,
  SelectTemplateStep, CloneTemplateStep, RenderTemplateStep, RegisterDocumentStep, CRITICAL_STEPS
} from '../../../src/infrastructure/steps/documentSteps';
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
  const rendered = templates.contextFor('file_1') as { focus: { classe: { anagrafica: { nome: string } } } };
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
  expect([...CRITICAL_STEPS].sort()).toEqual(['CloneTemplate', 'RegisterDocument', 'RenderTemplate', 'SelectTemplate']);
});
