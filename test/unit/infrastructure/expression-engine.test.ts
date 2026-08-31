import { ConfigurazioneDocumentoRepository } from '../../../src/infrastructure/repositories/ConfigurazioneDocumentoRepository';
import { ExpressionEngineFacade } from '../../../src/infrastructure/facades/ExpressionEngineFacade';
import { FakeDatabase } from '../../../test/fakes/FakeDatabase';
import { fixtureTables } from '../../../test/fixtures/tables';
import { PipelineError } from '../../../src/domain/errors/DomainError';

function repo() {
  return new ConfigurazioneDocumentoRepository(new FakeDatabase(fixtureTables()));
}
const engine = new ExpressionEngineFacade();
const ctx = (isTerminale: boolean) => ({ focus: { classe: { isTerminale } } });
const pianoCtx = (tipo: string) => ({ focus: { piano: { tipo } } });

test('ExpressionEngineFacade evaluates {{path}} boolean expressions via the library', () => {
  expect(engine.evaluateBoolean('{{focus.classe.isTerminale}} == true', ctx(true))).toBe(true);
  expect(engine.evaluateBoolean('{{focus.classe.isTerminale}} == true', ctx(false))).toBe(false);
  expect(engine.evaluateBoolean('true', {})).toBe(true);
});

test('ExpressionEngineFacade evaluates != on string placeholders (PIANI_PERSONALIZZATI_NO_PEI CONDIZIONE)', () => {
  expect(engine.evaluateBoolean('{{focus.piano.tipo}} != "PEI"', pianoCtx('PEI'))).toBe(false);
  expect(engine.evaluateBoolean('{{focus.piano.tipo}} != "PEI"', pianoCtx('PDP_BES'))).toBe(true);
});

test('shouldGenerate: null CONDIZIONE → true; else evaluated by the engine (06 §8, 10 Step 1)', () => {
  const r = repo();
  const cd1 = r.findById('CD1')!; // CONDIZIONE null
  const esame = r.findById('CD_ESAME')!; // CONDIZIONE {{focus.classe.isTerminale}}
  expect(r.shouldGenerate(cd1, {}, engine)).toBe(true);
  expect(r.shouldGenerate(esame, ctx(true), engine)).toBe(true);
  expect(r.shouldGenerate(esame, ctx(false), engine)).toBe(false);
});

test('resolveTemplateId: simple form + conditional array first-match (10 Step 6)', () => {
  const r = repo();
  expect(r.resolveTemplateId(r.findById('CD1')!, {}, engine)).toBe('tmpl_verbale'); // simple {templateId}
  expect(r.resolveTemplateId(r.findById('CD_ESAME')!, ctx(true), engine)).toBe('tmpl_esame'); // first cond matches
  expect(r.resolveTemplateId(r.findById('CD_ESAME')!, ctx(false), engine)).toBe('tmpl_default'); // falls to true
});

test('resolveTemplateId throws when no template applies', () => {
  const db = new FakeDatabase({
    CONF_DOC: [{ ID: 'X', GENERATORE: 'CLASSE', FORMATO: 'GDOC', MODELLI: '[{"condizione":"false","templateId":"t"}]' }]
  });
  const r = new ConfigurazioneDocumentoRepository(db);
  expect(() => r.resolveTemplateId(r.findById('X')!, {}, engine)).toThrow(PipelineError);
});
