import { registerArticolazioneChecks } from '../../../src/onlinetests/checks/articolazioneChecks';
import type { ServiceContainer } from '../../../src/config/ServiceContainer';
import { COL_CONF_DOC, COL_LOG_DOCS, TABLE } from '../../../src/config/schema';
import { ValidationError } from '../../../src/domain/errors/DomainError';
import type { ContextBuilder } from '../../../src/application/context-engine/ContextBuilder';
import type { SharedTestDatabase } from '../../../src/onlinetests/data/SharedTestDatabaseBuilder';
import {
  ALL_CLASSI,
  CLASSE_A,
  CLASSE_C,
  CONF_DOC_PIANI,
  CONF_DOC_RIEPILOGO_FIRME_CDC,
  PIANO_DOPPIO_STUDENTE,
  e2eDocenteEmail
} from '../../../src/onlinetests/data/SharedTestDatabaseBuilder';
import { TipoPiano } from '../../../src/domain/value-objects/enums';

interface RegisteredCheck {
  name: string;
  artifactUrl: string | undefined;
}

const COMPLETE_TARGETS = ['1A', '2A', '4A', '1B', '2B', '5B', '3C', '4D', '5E'];
const ARTICULATED_TARGETS = [
  '1A',
  '2A',
  '4A',
  '1B',
  '2B',
  '5B-S',
  '5B-C',
  '3C-S',
  '3C-C',
  '4D',
  '5E'
];

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

const sample: SharedTestDatabase & { testMode: boolean } = {
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

function persistedArtifactContainer(): {
  container: ServiceContainer;
  rows: Array<Record<string, unknown>>;
} {
  const rows: Array<Record<string, unknown>> = [
    ...ARTICULATED_TARGETS.map((classe) => ({
      [COL_LOG_DOCS.ID]: `cdc-${classe}`,
      [COL_LOG_DOCS.ID_GEN]: CONF_DOC_RIEPILOGO_FIRME_CDC,
      [COL_LOG_DOCS.CLASSI]: classe,
      [COL_LOG_DOCS.TIPO]: 'RIEPILOGO_FIRME_CDC',
      [COL_LOG_DOCS.NOME]: `CDC ${classe}`,
      [COL_LOG_DOCS.LINK]: `https://example.test/cdc-${classe}`
    })),
    ...[TipoPiano.PEI, TipoPiano.PDP_BES].map((tipo) => ({
      [COL_LOG_DOCS.ID]: `piano-${tipo}`,
      [COL_LOG_DOCS.ID_GEN]: CONF_DOC_PIANI,
      [COL_LOG_DOCS.UTENTI]: PIANO_DOPPIO_STUDENTE,
      [COL_LOG_DOCS.SOTTOTIPO]: tipo
    }))
  ];
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
    findAttive: () => ALL_CLASSI.map((id) => ({ id })),
    filterPerGestioneArticolazione: (
      _classi: Array<{ id: string }>,
      gestione: string
    ) =>
      (gestione === 'ARTICOLATA' ? ARTICULATED_TARGETS : COMPLETE_TARGETS).map((id) => ({ id }))
  };
  const drive = {
    getFileText(fileId: string) {
      if (fileId.startsWith('cdc-')) {
        return `Riepilogo firme del Consiglio di Classe ${fileId.slice(4)} Matematica`;
      }
      const tipo = fileId.slice('piano-'.length) as TipoPiano;
      return `Tipo piano: ${tipo === TipoPiano.PDP_BES ? 'PDP (BES)' : tipo}\nNote: Piano E2E ${tipo}`;
    }
  };
  const container = {
    get<T>(key: string): T {
      if (key === 'db') return db as T;
      if (key === 'classi') return classi as T;
      if (key === 'drive') return drive as T;
      if (key === 'documentGenerationService') {
        throw new Error('read-only verification requested documentGenerationService');
      }
      throw new Error(`Unexpected dependency: ${key}`);
    }
  } as ServiceContainer;
  return { container, rows };
}

test('registers the articulation checks only for a TEST_MODE sample', () => {
  const runner = new RecordingRunner();

  registerArticolazioneChecks(runner as never, {} as ServiceContainer, sample);

  expect(runner.checks).toEqual([
    {
      name: 'articolazione.prerequisiti::documenti di batch 1 presenti',
      artifactUrl: sample.sampleSpreadsheetUrl
    },
    {
      name: 'Articolazione CDU: supplenza, titolare finale e confini data',
      artifactUrl: sample.sampleSpreadsheetUrl
    },
    {
      name: 'Articolazione CDU: sovrapposizioni su classi diverse non filtrano la cattedra focale',
      artifactUrl: sample.sampleSpreadsheetUrl
    },
    {
      name: 'Articolazione CDU: visibilita supplenze SOLO_TITOLARI, SOLO_SUPPLENTI, ENTRAMBI',
      artifactUrl: sample.sampleSpreadsheetUrl
    },
    {
      name: 'Articolazione CDU: cattedra INTERPRET.CHITARRA risolve alla riga composita, non alla materia base',
      artifactUrl: sample.sampleSpreadsheetUrl
    },
    {
      name: 'Articolazione CDU: batch DOCUMENTO_DOCENTE_MATERIA registra INTERPRET.CHITARRA composita',
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
    },
    {
      name: 'Articolazione CDU: roster comune/separato per indirizzo, scoping parent vs partner',
      artifactUrl: sample.sampleSpreadsheetUrl
    }
  ]);
});

test('registers only a TEST_MODE guard failure for an unsafe sample', () => {
  const runner = new RecordingRunner();

  registerArticolazioneChecks(runner as never, {} as ServiceContainer, {
    ...sample,
    masterTestMode: false
  });

  expect(runner.checks).toEqual([
    {
      name: 'Articolazione CDU: MASTER.TEST_MODE guard',
      artifactUrl: sample.sampleSpreadsheetUrl
    }
  ]);
});

test('artifact verification is read-only and repeatable over persisted LOG_DOCS fixtures', () => {
  const { container, rows } = persistedArtifactContainer();
  const before = JSON.stringify(rows);

  for (let attempt = 0; attempt < 2; attempt += 1) {
    expect(() =>
      runCheck(container, 'Articolazione CDU: documento CDC include partner ed esclude parent')
    ).not.toThrow();
    expect(() => runCheck(container, 'Articolazione CDU: piano duale renderizzato')).not.toThrow();
  }

  expect(JSON.stringify(rows)).toBe(before);
});

test('CDC check rejects persisted partner content without the rendered council', () => {
  const base = persistedArtifactContainer();
  const container = {
    get<T>(key: string): T {
      if (key === 'drive') return { getFileText: () => 'Riepilogo firme' } as T;
      return base.container.get<T>(key);
    }
  } as ServiceContainer;

  expect(() =>
    runCheck(container, 'Articolazione CDU: documento CDC include partner ed esclude parent')
  ).toThrow(/contenuto renderizzato/);
});

test('CDC check rejects a persisted LOG_DOCS row without a file ID', () => {
  const { container, rows } = persistedArtifactContainer();
  const row = rows.find(
    (candidate) =>
      candidate[COL_LOG_DOCS.ID_GEN] === CONF_DOC_RIEPILOGO_FIRME_CDC &&
      candidate[COL_LOG_DOCS.CLASSI] === CLASSE_C
  );
  if (row === undefined) throw new Error('Missing CDC fixture row');
  row[COL_LOG_DOCS.ID] = '';

  expect(() =>
    runCheck(container, 'Articolazione CDU: documento CDC include partner ed esclude parent')
  ).toThrow(/fileId LOG_DOCS/);
});

test('dual-plan check rejects rendered output that loses the selected subtype', () => {
  const base = persistedArtifactContainer();
  const container = {
    get<T>(key: string): T {
      if (key === 'drive') return { getFileText: () => 'Tipo piano: WRONG' } as T;
      return base.container.get<T>(key);
    }
  } as ServiceContainer;

  expect(() => runCheck(container, 'Articolazione CDU: piano duale renderizzato')).toThrow(
    /output renderizzato/
  );
});

test('dual-plan check rejects persisted subtypes that share one file ID', () => {
  const { container, rows } = persistedArtifactContainer();
  const planRows = rows.filter((row) => row[COL_LOG_DOCS.ID_GEN] === CONF_DOC_PIANI);
  planRows[1]![COL_LOG_DOCS.ID] = planRows[0]![COL_LOG_DOCS.ID];

  expect(() => runCheck(container, 'Articolazione CDU: piano duale renderizzato')).toThrow(
    /stesso file/
  );
});

test('role/date check rejects a final holder that is not assigned to ITA', () => {
  const during = classCdu([
    {
      anagrafica: { email: 'e2edocente18@onlinetest.aldo.local' },
      materie: [
        {
          sigla: 'LAB.SEMINARIO_POMERIDIANO',
          principale: 'Laboratorio',
          specificita: 'Seminario pomeridiano'
        }
      ]
    },
    { anagrafica: { email: 'e2edocente16@onlinetest.aldo.local' }, materie: [{ sigla: 'MAT' }] }
  ]);
  const after = classCdu([
    {
      anagrafica: { email: 'e2edocente4@onlinetest.aldo.local' },
      materie: [
        {
          sigla: 'LAB.SEMINARIO_POMERIDIANO',
          principale: 'Laboratorio',
          specificita: 'Seminario pomeridiano'
        }
      ]
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

function validLabSeminar(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    sigla: 'LAB.SEMINARIO_POMERIDIANO',
    principale: 'Laboratorio',
    specificita: 'Seminario pomeridiano',
    ...overrides
  };
}

function substitutionContainer(
  substituteMateria: Record<string, unknown>,
  restoredHolderMateria: Record<string, unknown>
): ServiceContainer {
  const during = classCdu([
    {
      anagrafica: { email: 'e2edocente18@onlinetest.aldo.local' },
      materie: [substituteMateria]
    },
    {
      anagrafica: { email: 'e2edocente16@onlinetest.aldo.local' },
      materie: [{ sigla: 'ITA', specificita: null }]
    }
  ]);
  const after = classCdu([
    {
      anagrafica: { email: 'e2edocente4@onlinetest.aldo.local' },
      materie: [restoredHolderMateria]
    }
  ]);
  return {
    get<T>(key: string): T {
      if (key === 'contextBuilder') {
        return {
          build: (params: { now: Date }) => (params.now.getDate() === 5 ? during : after)
        } as T;
      }
      throw new Error(`Unexpected dependency: ${key}`);
    }
  } as ServiceContainer;
}

test('role/date check accepts valid composite LAB catalog rows for substitute and restored holder', () => {
  const container = substitutionContainer(validLabSeminar(), validLabSeminar());

  expect(() =>
    runCheck(container, 'Articolazione CDU: supplenza, titolare finale e confini data')
  ).not.toThrow();
});

test.each([
  ['substitute', 'sigla', 'LAB'],
  ['substitute', 'principale', 'Laboratorio errato'],
  ['substitute', 'specificita', 'Seminario Pomeridiano'],
  ['restored holder', 'sigla', 'LAB'],
  ['restored holder', 'principale', 'Laboratorio errato'],
  ['restored holder', 'specificita', 'Seminario Pomeridiano']
])(
  'role/date check rejects a corrupted %s LAB catalog %s',
  (holder, field, value) => {
    const corrupted = validLabSeminar({ [field]: value });
    const container =
      holder === 'substitute'
        ? substitutionContainer(corrupted, validLabSeminar())
        : substitutionContainer(validLabSeminar(), corrupted);

    expect(() =>
      runCheck(container, 'Articolazione CDU: supplenza, titolare finale e confini data')
    ).toThrow(/attesi supplente LAB\.SEMINARIO_POMERIDIANO/);
  }
);

test('role/date check rejects the obsolete split LAB seminar representation', () => {
  const during = classCdu([
    {
      anagrafica: { email: 'e2edocente18@onlinetest.aldo.local' },
      materie: [{ sigla: 'LAB', principale: null, specificita: 'SEMINARIO_POMERIDIANO' }]
    },
    {
      anagrafica: { email: 'e2edocente16@onlinetest.aldo.local' },
      materie: [{ sigla: 'ITA', specificita: null }]
    }
  ]);
  const after = classCdu([
    {
      anagrafica: { email: 'e2edocente4@onlinetest.aldo.local' },
      materie: [{ sigla: 'LAB', principale: null, specificita: 'SEMINARIO_POMERIDIANO' }]
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
  ).toThrow(/attesi supplente LAB\.SEMINARIO_POMERIDIANO/);
});

test('overlap check rejects a substitute from another class leaking into the focal council', () => {
  const replacement = e2eDocenteEmail(20);
  const leakedReplacement = e2eDocenteEmail(18);
  const container = {
    get<T>(key: string): T {
      if (key === 'contextBuilder') {
        return {
          build: (params: { target: string }) =>
            classCdu([
              {
                anagrafica: {
                  email: params.target === '4A' ? leakedReplacement : replacement
                },
                materie: [{ sigla: params.target === '4A' ? 'MAT' : 'ING' }]
              }
            ])
        } as T;
      }
      throw new Error(`Unexpected dependency: ${key}`);
    }
  } as ServiceContainer;

  expect(() =>
    runCheck(
      container,
      'Articolazione CDU: sovrapposizioni su classi diverse non filtrano la cattedra focale'
    )
  ).toThrow(/sovrapposizione/);
});

test('visibility check rejects SOLO_TITOLARI that exposes the substitute', () => {
  const holder = e2eDocenteEmail(4);
  const substitute = e2eDocenteEmail(18);
  const container = {
    get<T>(key: string): T {
      if (key === 'contextBuilder') {
        return {
          build: () =>
            classCdu([
              {
                anagrafica: { email: holder },
                materie: [validLabSeminar()]
              },
              {
                anagrafica: { email: substitute },
                materie: [validLabSeminar()]
              }
            ])
        } as T;
      }
      throw new Error(`Unexpected dependency: ${key}`);
    }
  } as ServiceContainer;

  expect(() =>
    runCheck(
      container,
      'Articolazione CDU: visibilita supplenze SOLO_TITOLARI, SOLO_SUPPLENTI, ENTRAMBI'
    )
  ).toThrow(/SOLO_TITOLARI/);
});

test('INTERPRET.CHITARRA check rejects a base-only materia resolution', () => {
  const container = {
    get<T>(key: string): T {
      if (key === 'contextBuilder') {
        return {
          build: () =>
            classCdu([
              {
                anagrafica: { email: 'e2edocente5@onlinetest.aldo.local' },
                materie: [
                  {
                    sigla: 'INTERPRET',
                    principale: 'Interpretazione ed esecuzione',
                    specificita: 'Chitarra',
                    nome: 'Interpretazione ed esecuzione (Chitarra)'
                  }
                ]
              }
            ])
        } as T;
      }
      throw new Error(`Unexpected dependency: ${key}`);
    }
  } as ServiceContainer;

  expect(() =>
    runCheck(
      container,
      'Articolazione CDU: cattedra INTERPRET.CHITARRA risolve alla riga composita, non alla materia base'
    )
  ).toThrow(/non risolta alla riga composita/);
});

test('DOCUMENTO_DOCENTE_MATERIA check rejects a base materia LOG_DOCS key', () => {
  const rows: Array<Record<string, unknown>> = [
    {
      [COL_LOG_DOCS.ID_GEN]: 'E2E_DOCENTE_MATERIA',
      [COL_LOG_DOCS.CLASSI]: CLASSE_A,
      [COL_LOG_DOCS.UTENTI]: 'e2edocente5@onlinetest.aldo.local',
      [COL_LOG_DOCS.MATERIE]: 'INTERPRET',
      [COL_LOG_DOCS.SOTTOTIPO]: 'INTERPRET::e2edocente5@onlinetest.aldo.local'
    }
  ];
  const container = {
    get<T>(key: string): T {
      if (key === 'documentBatchService') {
        return {
          *batchGenerateHandler() {
            yield { percentage: 100 };
            return { success: true, totale: 1, processed: [], errori: [] };
          }
        } as T;
      }
      if (key === 'db') {
        return {
          table: (name: string) =>
            name === TABLE.CONF_DOC
              ? {
                  findAll: () => [
                    {
                      [COL_CONF_DOC.ID]: 'E2E_DOCENTE_MATERIA',
                      [COL_CONF_DOC.TIPO]: 'DOCUMENTO_DOCENTE_MATERIA'
                    }
                  ]
                }
              : { findAll: () => rows }
        } as T;
      }
      throw new Error(`Unexpected dependency: ${key}`);
    }
  } as ServiceContainer;

  expect(() =>
    runCheck(
      container,
      'Articolazione CDU: batch DOCUMENTO_DOCENTE_MATERIA registra INTERPRET.CHITARRA composita'
    )
  ).toThrow(/non registra la chiave composita/);
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

/** Minimal fake container exposing only LOG_DOCS rows, for the batch-1-ordering prerequisite check. */
function containerWithLogDocs(rows: Array<Record<string, unknown>>): ServiceContainer {
  const db = {
    table(name: string) {
      if (name === TABLE.LOG_DOCS) return { findAll: () => rows };
      return { findAll: () => [] };
    }
  };
  return {
    get<T>(key: string): T {
      if (key === 'db') return db as T;
      throw new Error(`Unexpected dependency: ${key}`);
    }
  } as ServiceContainer;
}

test('articolazione prerequisite fails with an ordering hint when batch 1 left no LOG_DOCS', () => {
  const runner = new RecordingRunner();
  const container = containerWithLogDocs([]);

  registerArticolazioneChecks(runner as never, container, sample);

  expect(runner.callbacks.get('articolazione.prerequisiti::documenti di batch 1 presenti')).toThrow(
    /Batch 1 non eseguito su questa fixture/
  );
});
