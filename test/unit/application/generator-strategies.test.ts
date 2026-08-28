import { DocumentoGenericoGeneratorStrategy } from '../../../src/application/strategies/DocumentoGenericoGeneratorStrategy';
import { FoglioGenericoGeneratorStrategy } from '../../../src/application/strategies/FoglioGenericoGeneratorStrategy';
import { DocPersonalizzatoGeneratorStrategy } from '../../../src/application/strategies/DocPersonalizzatoGeneratorStrategy';
import { ConfigurazioneDocumento } from '../../../src/domain/entities/ConfigurazioneDocumento';
import { GeneratoreAxis, TipoPiano } from '../../../src/domain/value-objects/enums';
import { FakeTemplateEngine } from '../../../test/fakes/FakeTemplateEngine';
import type { Cdu } from '../../../src/application/context-engine/Cdu';

function confDoc(parametri: Record<string, unknown> | null = null): ConfigurazioneDocumento {
  return ConfigurazioneDocumento.fromData({
    ID: 'CD_X',
    TIPO: 'PIANO',
    GENERATORE: GeneratoreAxis.PIANO_PERSONALIZZATO,
    CONDIZIONE: null,
    MODELLI: '{"templateId":"tmpl"}',
    FILE_NAME: 'x',
    PATH_OUT: 'x',
    DUPLICAZIONE: 'NEGATA',
    PERMESSI: null,
    POST_PROCESSO: null,
    PARAMETRI: parametri === null ? null : JSON.stringify(parametri),
    GESTIONE_ARTICOLAZIONE: 'COMPLETA',
    FORMATO: 'GDOC'
  });
}

function cduConPiani(
  items: Array<{ tipo: string; isBes: boolean; link: string; parametriGenerazione: unknown }>
): Cdu {
  return {
    meta: {
      date: { oggi: { breve: '09/07/2026', anno: '2026', iso: '2026-07-09' }, oraCorrente: '' },
      parametriInput: { target: 'a1@school.it', tipoTarget: 'alunno', opzioni: {} }
    },
    focus: {
      alunno: {
        anagrafica: { nomeCompleto: 'VERDI ANNA', email: 'a1@school.it' },
        status: {
          religione: 'SI',
          isBes: true,
          isRipetente: false,
          isRappresentante: false,
          presenteAnnoPrecedente: false,
          presenteTuttoAnno: true
        },
        curriculum: {},
        classe: { nome: '5A', indirizzoSigla: '', indirizzoNome: '' },
        didattica: {
          carenze: { dettaglio: [], numero: 0, hasCarenze: false },
          asl: { oreCumulate: 0, oreAnnoCorrente: 0 },
          piani: { items, hasPiani: items.length > 0, hasBes: items.some((i) => i.isBes) }
        }
      }
    },
    tech: {
      entita: {},
      servizi: [],
      pipeline: { statoCorrente: '', stepEseguiti: [], errori: [], logEsecuzione: [] }
    }
  } as unknown as Cdu;
}

test('DocumentoGenericoGeneratorStrategy renders the whole CDU with no extra structure (10 §9)', () => {
  const templates = new FakeTemplateEngine();
  const cdu = cduConPiani([]);
  new DocumentoGenericoGeneratorStrategy(templates).render('file_1', cdu);
  expect(templates.contextFor('file_1')).toEqual(cdu);
});

test('FoglioGenericoGeneratorStrategy renders the whole CDU into a Sheet with no extra structure', () => {
  const templates = new FakeTemplateEngine();
  const cdu = cduConPiani([]);
  new FoglioGenericoGeneratorStrategy(templates).render('sheet_1', cdu);
  expect(templates.sheetContextFor('sheet_1')).toEqual(cdu);
});

describe('DocPersonalizzatoGeneratorStrategy (10 §9)', () => {
  test('renders the full CDU and exposes the focused plan parameters through the piano compatibility alias', () => {
    const cdu = cduConPiani([
      { tipo: 'PDP_DSA', isBes: true, link: '', parametriGenerazione: { gravita: 'lieve' } },
      { tipo: 'PEI', isBes: true, link: '', parametriGenerazione: { sostegno: 'totale' } }
    ]);
    cdu.focus.piano = {
      tipo: TipoPiano.PEI,
      isBes: true,
      parametriGenerazione: { sostegno: 'totale' }
    };
    const templates = new FakeTemplateEngine();
    new DocPersonalizzatoGeneratorStrategy(templates).render(
      'file_2',
      cdu,
      confDoc({ tipoPiano: 'PDP_DSA' })
    );
    const ctx = templates.contextFor('file_2') as {
      focus: { piano: { tipo: string; parametriGenerazione: Record<string, unknown> } };
      piano: Record<string, unknown>;
    };

    expect(ctx.focus.piano.tipo).toBe('PEI');
    expect(ctx.piano).toEqual({ sostegno: 'totale' });
  });

  test('never selects the first available plan when the focused plan is absent', () => {
    const cdu = cduConPiani([
      { tipo: 'PFP', isBes: false, link: '', parametriGenerazione: { sport: 'nuoto' } }
    ]);
    const templates = new FakeTemplateEngine();
    new DocPersonalizzatoGeneratorStrategy(templates).render('file_3', cdu, confDoc());
    const ctx = templates.contextFor('file_3') as { piano?: Record<string, unknown> };
    expect(ctx.piano).toBeUndefined();
  });

  test('a missing field resolves to empty string via the template engine, never an error', () => {
    const cdu = cduConPiani([
      { tipo: 'PEI', isBes: true, link: '', parametriGenerazione: { sostegno: 'totale' } }
    ]);
    cdu.focus.piano = {
      tipo: TipoPiano.PEI,
      isBes: true,
      parametriGenerazione: { sostegno: 'totale' }
    };
    const templates = new FakeTemplateEngine();
    new DocPersonalizzatoGeneratorStrategy(templates).render(
      'file_4',
      cdu,
      confDoc()
    );
    const ctx = templates.contextFor('file_4')!;
    expect(templates.processString('{{piano.campoInesistente}}', ctx)).toBe('');
  });

  test('no focused plan leaves the compatibility alias absent, without crashing', () => {
    const cdu = cduConPiani([]);
    const templates = new FakeTemplateEngine();
    new DocPersonalizzatoGeneratorStrategy(templates).render('file_5', cdu, confDoc());
    expect((templates.contextFor('file_5') as { piano?: unknown }).piano).toBeUndefined();
  });
});
