import { ConfigurazioneDocumento } from '../../../src/domain/entities/ConfigurazioneDocumento';
import { PipelineError } from '../../../src/domain/errors/DomainError';
import { GeneratoreAxis, TipoPiano } from '../../../src/domain/value-objects/enums';
import { composeContextBuilder } from '../../../src/config/ApplicationComposition';
import { recipe } from '../../../src/application/context-engine/Recipe';
import { ExpressionEngineFacade } from '../../../src/infrastructure/facades/ExpressionEngineFacade';
import { ConfigurazioneDocumentoRepository } from '../../../src/infrastructure/repositories/ConfigurazioneDocumentoRepository';
import { FakeDatabase } from '../../fakes/FakeDatabase';
import { fixtureTables } from '../../fixtures/tables';

function focusedPianoCdu(tipo: TipoPiano) {
  const tables = fixtureTables();
  if (!tables.PIANI.some((row) => row.STUDENTE === 'a1@school.it' && row.TIPO === tipo)) {
    tables.PIANI.push({ STUDENTE: 'a1@school.it', TIPO: tipo, PARAMETRI: '{}' });
  }
  const db = new FakeDatabase(tables);
  return composeContextBuilder(db).build(
    {
      target: 'a1@school.it',
      tipoTarget: 'alunno',
      pianoTipo: tipo,
      now: new Date('2026-07-01T09:00:00Z')
    },
    recipe('PIANO_PERSONALIZZATO')
  );
}

function conditionalPlanConfig(): ConfigurazioneDocumento {
  return ConfigurazioneDocumento.fromData({
    ID: 'PIANI_PERSONALIZZATI',
    TIPO: 'PIANO_PERS',
    GENERATORE: GeneratoreAxis.PIANO_PERSONALIZZATO,
    FORMATO: 'GDOC',
    MODELLI: JSON.stringify([
      { condizione: "{{focus.piano.tipo}} == 'PEI'", templateId: 'tmpl_pei' },
      { condizione: "{{focus.piano.tipo}} == 'PDP_BES'", templateId: 'tmpl_pdp_bes' }
    ])
  });
}

test.each([
  [TipoPiano.PEI, 'tmpl_pei'],
  [TipoPiano.PDP_BES, 'tmpl_pdp_bes']
])('resolves conditional MODELLI for focused %s plan', (tipo, templateId) => {
  const db = new FakeDatabase(fixtureTables());
  const repository = new ConfigurazioneDocumentoRepository(db);

  expect(
    repository.resolveTemplateId(
      conditionalPlanConfig(),
      focusedPianoCdu(tipo) as unknown as Record<string, unknown>,
      new ExpressionEngineFacade()
    )
  ).toBe(templateId);
});

test('rejects a focused plan type with no matching conditional MODELLI branch', () => {
  const db = new FakeDatabase(fixtureTables());
  const repository = new ConfigurazioneDocumentoRepository(db);

  expect(() =>
    repository.resolveTemplateId(
      conditionalPlanConfig(),
      focusedPianoCdu(TipoPiano.PFP) as unknown as Record<string, unknown>,
      new ExpressionEngineFacade()
    )
  ).toThrow(PipelineError);
});
