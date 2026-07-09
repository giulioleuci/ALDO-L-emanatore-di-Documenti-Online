import { DocumentoGenericoGeneratorStrategy } from '../../../src/application/strategies/DocumentoGenericoGeneratorStrategy';
import { DocPersonalizzatoGeneratorStrategy } from '../../../src/application/strategies/DocPersonalizzatoGeneratorStrategy';
import { ConfigurazioneDocumento } from '../../../src/domain/entities/ConfigurazioneDocumento';
import { FakeTemplateEngine } from '../../../test/fakes/FakeTemplateEngine';
import type { Cdu } from '../../../src/application/context-engine/Cdu';

function confDoc(parametri: Record<string, unknown> | null = null): ConfigurazioneDocumento {
  return ConfigurazioneDocumento.fromData({
    ID: 'CD_X', TIPO: 'PIANO', GENERATORE: 'DOC_PERSONALIZZATO', CONDIZIONE: null,
    MODELLI: '{"templateId":"tmpl"}', FILE_NAME: 'x', PATH_OUT: 'x',
    PATH_OUT_SOTTOCARTELLE: null, SCHEMA_SOTTOCARTELLE: 'UNO PER CLASSE', PERMESSI: null,
    POST_PROCESSO: null, PARAMETRI: parametri === null ? null : JSON.stringify(parametri),
    GESTIONE_ARTICOLAZIONE: 'COMPLETA', FORMATO: 'GDOC'
  });
}

function cduConPiani(items: Array<{ tipo: string; isBes: boolean; link: string; parametriGenerazione: unknown }>): Cdu {
  return {
    meta: { date: { oggi: { breve: '09/07/2026', anno: '2026', iso: '2026-07-09' }, oraCorrente: '' }, parametriInput: { target: 'a1@school.it', tipoTarget: 'alunno', opzioni: {} } },
    focus: {
      alunno: {
        anagrafica: { nomeCompleto: 'VERDI ANNA', email: 'a1@school.it' },
        status: { religione: 'SI', isBes: true, isRipetente: false, isRappresentante: false },
        curriculum: {},
        classe: { nome: '5A', indirizzoSigla: '', indirizzoNome: '' },
        didattica: {
          carenze: { dettaglio: [], numero: 0, hasCarenze: false },
          asl: { oreCumulate: 0, oreAnnoCorrente: 0 },
          piani: { items, hasPiani: items.length > 0, hasBes: items.some((i) => i.isBes) }
        }
      }
    },
    tech: { entita: {}, servizi: [], pipeline: { statoCorrente: '', stepEseguiti: [], errori: [], logEsecuzione: [] } }
  } as unknown as Cdu;
}

test('DocumentoGenericoGeneratorStrategy renders the whole CDU with no extra structure (10 §9)', () => {
  const templates = new FakeTemplateEngine();
  const cdu = cduConPiani([]);
  new DocumentoGenericoGeneratorStrategy(templates).render('file_1', cdu);
  expect(templates.contextFor('file_1')).toEqual(cdu);
});

describe('DocPersonalizzatoGeneratorStrategy (10 §9)', () => {
  test('selects the piano matching CONF_DOC.PARAMETRI.tipoPiano and exposes its fields as piano.<campo>', () => {
    const cdu = cduConPiani([
      { tipo: 'PDP_DSA', isBes: true, link: '', parametriGenerazione: { gravita: 'lieve' } },
      { tipo: 'PEI', isBes: true, link: '', parametriGenerazione: { sostegno: 'totale' } }
    ]);
    const templates = new FakeTemplateEngine();
    new DocPersonalizzatoGeneratorStrategy(templates).render('file_2', cdu, confDoc({ tipoPiano: 'PEI' }));
    const ctx = templates.contextFor('file_2') as { piano: Record<string, unknown> };
    expect(ctx.piano).toEqual({ sostegno: 'totale' });
  });

  test('defaults to the first plan when CONF_DOC.PARAMETRI.tipoPiano is absent', () => {
    const cdu = cduConPiani([{ tipo: 'PFP', isBes: false, link: '', parametriGenerazione: { sport: 'nuoto' } }]);
    const templates = new FakeTemplateEngine();
    new DocPersonalizzatoGeneratorStrategy(templates).render('file_3', cdu, confDoc());
    const ctx = templates.contextFor('file_3') as { piano: Record<string, unknown> };
    expect(ctx.piano).toEqual({ sport: 'nuoto' });
  });

  test('a missing field resolves to empty string via the template engine, never an error', () => {
    const cdu = cduConPiani([{ tipo: 'PEI', isBes: true, link: '', parametriGenerazione: { sostegno: 'totale' } }]);
    const templates = new FakeTemplateEngine();
    new DocPersonalizzatoGeneratorStrategy(templates).render('file_4', cdu, confDoc({ tipoPiano: 'PEI' }));
    const ctx = templates.contextFor('file_4')!;
    expect(templates.processString('{{piano.campoInesistente}}', ctx)).toBe('');
  });

  test('no plans at all -> piano context is an empty object, no crash', () => {
    const cdu = cduConPiani([]);
    const templates = new FakeTemplateEngine();
    new DocPersonalizzatoGeneratorStrategy(templates).render('file_5', cdu, confDoc());
    expect((templates.contextFor('file_5') as { piano: unknown }).piano).toEqual({});
  });
});
