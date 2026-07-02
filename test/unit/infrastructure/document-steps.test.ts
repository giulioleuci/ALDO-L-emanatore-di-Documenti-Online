import { PipelineContext } from '../../../src/infrastructure/pipelines/PipelineContext';
import {
  AnalyzeContextStep, GenerateNameStep, SelectTemplateStep, CloneTemplateStep,
  RenderTemplateStep, RegisterDocumentStep
} from '../../../src/infrastructure/steps/documentSteps';
import { VerbaleGeneratorStrategy } from '../../../src/application/strategies/VerbaleGeneratorStrategy';
import { FakeDriveFacade } from '../../../test/fakes/FakeDriveFacade';
import { FakeDocumentFacade } from '../../../test/fakes/FakeDocumentFacade';
import { FakeDatabase } from '../../../test/fakes/FakeDatabase';
import { fixtureTables } from '../../../test/fixtures/tables';
import type { Cdu } from '../../../src/application/context/Cdu';
import { ConsiglioDiClasse } from '../../../src/domain/entities/ConsiglioDiClasse';

function cdu(): Cdu {
  return {
    meta: { date: { oggi: { breve: '01/07/2026', anno: '2026' } }, parametriInput: { target: '5A', tipoTarget: 'classe' } },
    focus: { classe: { anagrafica: { nome: '5A', anno: 5 } } },
    tech: { consiglioDiClasse: new ConsiglioDiClasse([]) }
  };
}
function baseCtx(): PipelineContext {
  const ctx = new PipelineContext();
  ctx.set('cdu', cdu());
  ctx.set('config', fixtureTables().CONF_DOC[0]);
  return ctx;
}

test('AnalyzeContextStep: empty CONDIZIONE => shouldGenerate true', () => {
  const ctx = baseCtx();
  new AnalyzeContextStep().execute(ctx);
  expect(ctx.get('shouldGenerate')).toBe(true);
});

test('GenerateNameStep resolves FILE_NAME placeholders', () => {
  const ctx = baseCtx();
  new GenerateNameStep().execute(ctx);
  expect(ctx.get('nomeFile')).toBe('Verbale_5A_01/07/2026');
});

test('SelectTemplateStep reads MODELLI simple form', () => {
  const ctx = baseCtx();
  new SelectTemplateStep().execute(ctx);
  expect(ctx.get('templateId')).toBe('tmpl_verbale');
});

test('CloneTemplateStep copies via Drive facade and sets newFileId', () => {
  const ctx = baseCtx();
  ctx.set('destFolderId', 'folder_1');
  ctx.set('nomeFile', 'Verbale_5A_01/07/2026');
  ctx.set('templateId', 'tmpl_verbale');
  const drive = new FakeDriveFacade();
  new CloneTemplateStep(drive).execute(ctx);
  expect(String(ctx.get('newFileId'))).toMatch(/^file_/);
  expect(drive.copies[0]!.templateId).toBe('tmpl_verbale');
});

test('RenderTemplateStep delegates to strategy → Document facade', () => {
  const ctx = baseCtx();
  ctx.set('newFileId', 'file_1');
  const doc = new FakeDocumentFacade();
  const registry = new Map([['VERBALE_CDC', new VerbaleGeneratorStrategy(doc)]]);
  new RenderTemplateStep(registry).execute(ctx);
  expect(doc.replacementsFor('file_1')['{{focus.classe.anagrafica.nome}}']).toBe('5A');
});

test('RegisterDocumentStep writes LOG_DOCS row with STATO GENERATO', () => {
  const ctx = baseCtx();
  ctx.set('newFileId', 'file_1');
  ctx.set('newFileLink', 'https://drive/file_1');
  ctx.set('nomeFile', 'Verbale_5A_01/07/2026');
  ctx.set('destFolderPath', 'Verbali/5');
  const db = new FakeDatabase(fixtureTables());
  new RegisterDocumentStep(db).execute(ctx);
  const row = db.table('LOG_DOCS').find((r) => r.ID === 'file_1');
  expect(row?.STATO).toBe('GENERATO');
  expect(row?.CLASSI).toBe('5A');
  expect(db.saved).toBeGreaterThan(0);
});
