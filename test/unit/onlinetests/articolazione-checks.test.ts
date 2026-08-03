import { registerArticolazioneChecks } from '../../../src/onlinetests/checks/articolazioneChecks';
import type { ServiceContainer } from '../../../src/config/ServiceContainer';
import { COL_CONF_DOC, COL_LOG_DOCS, TABLE } from '../../../src/config/schema';
import { ValidationError } from '../../../src/domain/errors/DomainError';
import type { ContextBuilder } from '../../../src/application/context-engine/ContextBuilder';
import type { E2eSampleDatabase } from '../../../src/onlinetests/E2eSampleDatabaseBuilder';
import {
  CLASSE_A,
  CLASSE_B,
  CLASSE_C,
  CLASSE_C_PARENT,
  CLASSE_C_PARTNER,
  CONF_DOC_PIANI,
  CONF_DOC_RIEPILOGO_FIRME_CDC
} from '../../../src/onlinetests/E2eSampleDatabaseBuilder';
import { TipoPiano } from '../../../src/domain/value-objects/enums';

interface RegisteredCheck {
  name: string;
  artifactUrl: string | undefined;
}

class RecordingRunner {
  readonly checks: RegisteredCheck[] = [];
  readonly callbacks = new Map<string, () => void>();

  add(name: string, artifactUrl: string | undefined, fn: () => void): void {
    this.callbacks.set(name, fn);
    this.checks.push({ name, artifactUrl });
  }
}

function runCheck(container: ServiceContainer, name: string): void {
  const runner = new RecordingRunner();
  registerArticolazioneChecks(runner as never, container, sample);
  const callback = runner.callbacks.get(name);
  if (callback === undefined) throw new Error(`Missing check: ${name}`);
  callback();
}

function classCdu(council: Array<Record<string, unknown>>): ReturnType<ContextBuilder['build']> {
  return {
    focus: {
      classe: {
        anagrafica: {
          nome: CLASSE_A,
          anno: 1,
          sezione: 'A',
          indirizzo: { nome: 'Liceo', nomeSintetico: 'SCI', sigla: 'IND_E2E', tipo: 'Liceo' }
        },
        consiglioDiClasse: council
      }
    }
  } as unknown as ReturnType<ContextBuilder['build']>;
}

const sample: E2eSampleDatabase & { testMode: boolean } = {
  masterSpreadsheetId: 'master',
  sampleSpreadsheetId: 'sample',
  sampleSpreadsheetUrl: 'https://example.test/sample',
  sampleFolderUrl: 'https://example.test/folder',
  priorSampleSpreadsheetId: 'prior-sample',
  priorSampleSpreadsheetUrl: 'https://example.test/prior-sample',
  masterTestMode: true,
  staticAttachmentFileId: 'static-attachment',
  testMode: true
};

test('registers the articulation checks only for a TEST_MODE sample', () => {
  const runner = new RecordingRunner();

  registerArticolazioneChecks(runner as never, {} as ServiceContainer, sample);

  expect(runner.checks).toEqual([
    {
      name: 'Articolazione CDU: supplenza, titolare finale e confini data',
      artifactUrl: sample.sampleSpreadsheetUrl
    },
    {
      name: 'Articolazione CDU: serializzabilita, CdC unico, materie e indirizzo',
      artifactUrl: sample.sampleSpreadsheetUrl
    },
    {
      name: 'Articolazione CDU: round trip partner-parent e split comune/separato',
      artifactUrl: sample.sampleSpreadsheetUrl
    },
    {
      name: 'Articolazione CDU: target documenti COMPLETA e ARTICOLATA',
      artifactUrl: sample.sampleSpreadsheetUrl
    },
    {
      name: 'Articolazione CDU: target mail COMPLETA e ARTICOLATA',
      artifactUrl: sample.sampleSpreadsheetUrl
    },
    {
      name: 'Articolazione CDU: documento CDC include partner ed esclude parent',
      artifactUrl: sample.sampleSpreadsheetUrl
    },
    {
      name: 'Articolazione CDU: piano duale renderizzato',
      artifactUrl: sample.sampleSpreadsheetUrl
    }
  ]);
});

test('registers only a TEST_MODE guard failure for an unsafe sample', () => {
  const runner = new RecordingRunner();

  registerArticolazioneChecks(runner as never, {} as ServiceContainer, {
    ...sample,
    testMode: false
  });

  expect(runner.checks).toEqual([
    {
      name: 'Articolazione CDU: MASTER.TEST_MODE guard',
      artifactUrl: sample.sampleSpreadsheetUrl
    }
  ]);
});

test('CDC check rejects a generated partner document without rendered council content', () => {
  const rows: Array<Record<string, unknown>> = [];
  const db = {
    table(name: string) {
      if (name === TABLE.CONF_DOC) {
        return {
          findAll: () => [
            {
              [COL_CONF_DOC.ID]: CONF_DOC_RIEPILOGO_FIRME_CDC,
              [COL_CONF_DOC.GESTIONE_ARTICOLAZIONE]: 'ARTICOLATA'
            }
          ]
        };
      }
      return { findAll: () => rows };
    }
  };
  const classi = {
    findAttive: () =>
      [CLASSE_A, CLASSE_B, CLASSE_C_PARENT, CLASSE_C, CLASSE_C_PARTNER].map((id) => ({ id })),
    filterPerGestioneArticolazione: () =>
      [CLASSE_A, CLASSE_B, CLASSE_C, CLASSE_C_PARTNER].map((id) => ({ id }))
  };
  const documents = {
    generateForClasse: (classe: { value: string }) => {
      rows.push({
        [COL_LOG_DOCS.ID]: `cdc-${classe.value}`,
        [COL_LOG_DOCS.ID_GEN]: CONF_DOC_RIEPILOGO_FIRME_CDC,
        [COL_LOG_DOCS.CLASSI]: classe.value,
        [COL_LOG_DOCS.TIPO]: 'RIEPILOGO_FIRME_CDC',
        [COL_LOG_DOCS.NOME]: `CDC ${classe.value}`,
        [COL_LOG_DOCS.LINK]: `https://example.test/${classe.value}`
      });
      return { fileId: `cdc-${classe.value}`, status: 'CREATED' };
    }
  };
  const container = {
    get<T>(key: string): T {
      if (key === 'db') return db as T;
      if (key === 'classi') return classi as T;
      if (key === 'documentGenerationService') return documents as T;
      if (key === 'drive') return { getFileText: () => 'Riepilogo firme' } as T;
      throw new Error(`Unexpected dependency: ${key}`);
    }
  } as ServiceContainer;

  expect(() =>
    runCheck(container, 'Articolazione CDU: documento CDC include partner ed esclude parent')
  ).toThrow(/contenuto renderizzato/);
});

test('CDC check rejects a stale LOG_DOCS row that is not bound to the generated file', () => {
  const rows: Array<Record<string, unknown>> = [];
  const db = {
    table(name: string) {
      if (name === TABLE.CONF_DOC) {
        return {
          findAll: () => [
            {
              [COL_CONF_DOC.ID]: CONF_DOC_RIEPILOGO_FIRME_CDC,
              [COL_CONF_DOC.GESTIONE_ARTICOLAZIONE]: 'ARTICOLATA'
            }
          ]
        };
      }
      return { findAll: () => rows };
    }
  };
  const classi = {
    findAttive: () =>
      [CLASSE_A, CLASSE_B, CLASSE_C_PARENT, CLASSE_C, CLASSE_C_PARTNER].map((id) => ({ id })),
    filterPerGestioneArticolazione: () =>
      [CLASSE_A, CLASSE_B, CLASSE_C, CLASSE_C_PARTNER].map((id) => ({ id }))
  };
  const documents = {
    generateForClasse: (classe: { value: string }) => {
      rows.push({
        [COL_LOG_DOCS.ID]: `stale-${classe.value}`,
        [COL_LOG_DOCS.ID_GEN]: CONF_DOC_RIEPILOGO_FIRME_CDC,
        [COL_LOG_DOCS.CLASSI]: classe.value,
        [COL_LOG_DOCS.TIPO]: 'RIEPILOGO_FIRME_CDC',
        [COL_LOG_DOCS.NOME]: `CDC ${classe.value}`,
        [COL_LOG_DOCS.LINK]: `https://example.test/stale-${classe.value}`
      });
      return { fileId: `cdc-${classe.value}`, status: 'CREATED' };
    }
  };
  const container = {
    get<T>(key: string): T {
      if (key === 'db') return db as T;
      if (key === 'classi') return classi as T;
      if (key === 'documentGenerationService') return documents as T;
      if (key === 'drive') {
        return {
          getFileText: (fileId: string) =>
            `Riepilogo firme del Consiglio di Classe ${fileId.replace('cdc-', '')} Matematica`
        } as T;
      }
      throw new Error(`Unexpected dependency: ${key}`);
    }
  } as ServiceContainer;

  expect(() =>
    runCheck(container, 'Articolazione CDU: documento CDC include partner ed esclude parent')
  ).toThrow(/fileId LOG_DOCS/);
});

test('CDC check rejects a rendered class repeater that loses LAB.SEMINARIO_POMERIDIANO', () => {
  const rows: Array<Record<string, unknown>> = [];
  const db = {
    table(name: string) {
      if (name === TABLE.CONF_DOC) {
        return {
          findAll: () => [
            {
              [COL_CONF_DOC.ID]: CONF_DOC_RIEPILOGO_FIRME_CDC,
              [COL_CONF_DOC.GESTIONE_ARTICOLAZIONE]: 'ARTICOLATA'
            }
          ]
        };
      }
      return { findAll: () => rows };
    }
  };
  const classi = {
    findAttive: () =>
      [CLASSE_A, CLASSE_B, CLASSE_C_PARENT, CLASSE_C, CLASSE_C_PARTNER].map((id) => ({ id })),
    filterPerGestioneArticolazione: () =>
      [CLASSE_A, CLASSE_B, CLASSE_C, CLASSE_C_PARTNER].map((id) => ({ id }))
  };
  const documents = {
    generateForClasse: (classe: { value: string }) => {
      const fileId = `cdc-${classe.value}`;
      rows.push({
        [COL_LOG_DOCS.ID]: fileId,
        [COL_LOG_DOCS.ID_GEN]: CONF_DOC_RIEPILOGO_FIRME_CDC,
        [COL_LOG_DOCS.CLASSI]: classe.value,
        [COL_LOG_DOCS.TIPO]: 'RIEPILOGO_FIRME_CDC',
        [COL_LOG_DOCS.NOME]: `CDC ${classe.value}`,
        [COL_LOG_DOCS.LINK]: `https://example.test/${classe.value}`
      });
      return { fileId, status: 'CREATED' };
    }
  };
  const container = {
    get<T>(key: string): T {
      if (key === 'db') return db as T;
      if (key === 'classi') return classi as T;
      if (key === 'documentGenerationService') return documents as T;
      if (key === 'drive') {
        return {
          getFileText: (fileId: string) =>
            `Riepilogo firme del Consiglio di Classe ${fileId.replace('cdc-', '')} Matematica`
        } as T;
      }
      throw new Error(`Unexpected dependency: ${key}`);
    }
  } as ServiceContainer;

  expect(() =>
    runCheck(container, 'Articolazione CDU: documento CDC include partner ed esclude parent')
  ).toThrow(/LAB\.SEMINARIO_POMERIDIANO/);
});

test('dual-plan check rejects rendered output that loses the selected subtype', () => {
  const rows: Array<Record<string, unknown>> = [];
  const documents = {
    generateForPiano: (studente: string, tipo: TipoPiano) => {
      const fileId = `${studente}-${tipo}`;
      rows.push({
        [COL_LOG_DOCS.ID_GEN]: CONF_DOC_PIANI,
        [COL_LOG_DOCS.UTENTI]: studente,
        [COL_LOG_DOCS.SOTTOTIPO]: tipo,
        [COL_LOG_DOCS.ID]: fileId
      });
      return { fileId, status: 'CREATED' };
    }
  };
  const container = {
    get<T>(key: string): T {
      if (key === 'documentGenerationService') return documents as T;
      if (key === 'drive') return { getFileText: () => 'Tipo piano: WRONG' } as T;
      if (key === 'db') return { table: () => ({ findAll: () => rows }) } as T;
      throw new Error(`Unexpected dependency: ${key}`);
    }
  } as ServiceContainer;

  expect(() => runCheck(container, 'Articolazione CDU: piano duale renderizzato')).toThrow(
    /output renderizzato/
  );
});

test('role/date check rejects a final holder that is not assigned to ITA', () => {
  const during = classCdu([
    {
      anagrafica: { email: 'e2edocente18@onlinetest.aldo.local' },
      materie: [{ sigla: 'LAB', specificita: 'SEMINARIO_POMERIDIANO' }]
    },
    { anagrafica: { email: 'e2edocente16@onlinetest.aldo.local' }, materie: [{ sigla: 'MAT' }] }
  ]);
  const after = classCdu([
    {
      anagrafica: { email: 'e2edocente4@onlinetest.aldo.local' },
      materie: [{ sigla: 'LAB', specificita: 'SEMINARIO_POMERIDIANO' }]
    }
  ]);
  const container = {
    get<T>(key: string): T {
      if (key === 'contextBuilder') {
        return {
          build: (params: { now: Date }) => (params.now.getDate() === 5 ? during : after)
        } as T;
      }
      throw new Error(`Unexpected dependency: ${key}`);
    }
  } as ServiceContainer;

  expect(() =>
    runCheck(container, 'Articolazione CDU: supplenza, titolare finale e confini data')
  ).toThrow(/titolare finale ITA/);
});

test('serializability check converts a cyclic CDU failure into ValidationError diagnostics', () => {
  const cyclic = classCdu([]) as Record<string, unknown>;
  cyclic.self = cyclic;
  const container = {
    get<T>(key: string): T {
      if (key === 'contextBuilder') return { build: () => cyclic } as T;
      throw new Error(`Unexpected dependency: ${key}`);
    }
  } as ServiceContainer;

  expect(() =>
    runCheck(container, 'Articolazione CDU: serializzabilita, CdC unico, materie e indirizzo')
  ).toThrow(ValidationError);
});
