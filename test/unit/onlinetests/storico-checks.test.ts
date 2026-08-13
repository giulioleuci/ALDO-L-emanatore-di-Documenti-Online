import type { ServiceContainer } from '../../../src/config/ServiceContainer';
import {
  assertAlunnoStorico,
  assertClasseStorico,
  assertDocumentiStorici,
  assertStoricoRender,
  registerStoricoChecks,
  type StoricoCheckScope
} from '../../../src/onlinetests/checks/storicoChecks';
import type { SharedTestDatabase } from '../../../src/onlinetests/data/SharedTestDatabaseBuilder';

class RecordingRunner {
  readonly names: string[] = [];

  add(name: string): void {
    this.names.push(name);
  }
}

const sample: SharedTestDatabase & { testMode: boolean } = {
  masterSpreadsheetId: 'master',
  sampleSpreadsheetId: 'sample',
  sampleSpreadsheetUrl: 'https://example.test/sample',
  sampleFolderUrl: 'https://example.test/folder',
  priorSampleSpreadsheetId: 'prior-1',
  priorSampleSpreadsheetUrl: 'https://example.test/prior-1',
  priorSampleSpreadsheetId2: 'prior-2',
  priorSampleSpreadsheetUrl2: 'https://example.test/prior-2',
  logFoldFolderUrl: 'https://example.test/log-fold',
  jobRunnerDocConfigId: 'job-runner',
  masterTestMode: true,
  staticAttachmentFileId: 'attachment',
  testMode: true
};

function names(scope: StoricoCheckScope): string[] {
  const runner = new RecordingRunner();
  registerStoricoChecks(runner as never, { get: () => ({}) } as ServiceContainer, sample, scope);
  return runner.names;
}

test('scopes storico launchers and keeps rendering under documenti', () => {
  expect(names('alunno')).toEqual([
    'storico.alunno::depth 2 materializzato',
    'storico.alunno::casi limite depth 0, mancanti e sconosciuto'
  ]);
  expect(names('classe')).toEqual([
    'storico.classe::statistiche, progetti e referente',
    'storico.classe::continuità CdC, ITP ed evoluzione materie'
  ]);
  expect(names('documenti')).toEqual([
    'storico.documenti::ID_GEN, famiglia, sottotipo e isolamento PEI/PDP',
    'storico.render::template documento e mail senza placeholder'
  ]);
  expect(names('all')).toHaveLength(6);
});

test('student assertion requires two distinctive years, outcomes and plans', () => {
  const storico = {
    anni: [
      {
        annoScolastico: '2025-2026',
        classe: '2C',
        esito: 'PROMOSSO',
        carenze: [{ materiaSigla: 'STO', valore: '4' }]
      },
      {
        annoScolastico: '2024-2025',
        classe: '1C',
        esito: 'NON_PROMOSSO',
        carenze: [{ materiaSigla: 'STO', valore: '5' }]
      }
    ],
    pianiPrimoAnnoPrecedente: [{ tipo: 'PDP_BES', tipoLabel: 'PDP BES' }],
    pianiSecondoAnnoPrecedente: [{ tipo: 'PDP_BES', tipoLabel: 'PDP BES' }],
    bocciature: [{ annoScolastico: '2024-2025', classe: '1C' }],
    hasBocciature: true
  };

  expect(() => assertAlunnoStorico(storico)).not.toThrow();
  expect(() => assertAlunnoStorico({ ...storico, anni: storico.anni.slice(0, 1) })).toThrow(
    /due anni/
  );
  expect(() =>
    assertAlunnoStorico({
      ...storico,
      anni: [
        { ...storico.anni[0], carenze: [{ materiaSigla: 'GST', valore: '4' }] },
        storico.anni[1]
      ]
    })
  ).toThrow(/GST.*STO|riconciliata/i);
});

test('class assertion distinguishes real and fallback referees plus ITP omission', () => {
  const storico = {
    statistiche: [
      { annoScolastico: '2025-2026', classe: '2C', statistiche: { totale: 1 } },
      { annoScolastico: '2024-2025', classe: '1C', statistiche: { totale: 1 } }
    ],
    progetti: [
      {
        annoScolastico: '2025-2026',
        classe: '2C',
        progetti: [
          {
            nome: 'ASL storico 2025-2026',
            isAsl: true,
            referente: { email: 'docente.storico.2025.2026@x', nomeCompleto: 'Docente Storico' }
          },
          {
            nome: 'Orientamento storico 2025-2026',
            isAsl: false,
            referente: { email: null, nomeCompleto: 'Esperto Esterno 2025-2026' }
          }
        ]
      },
      { annoScolastico: '2024-2025', classe: '1C', progetti: [] }
    ]
  };
  const materie = [
    {
      sigla: 'INF',
      hasItp: true,
      continuita: {
        docentiAnniPrecedenti: [
          { annoIndietro: 1, itp: { email: 'e2edocente11@onlinetest.aldo.local' } },
          { annoIndietro: 2, itp: null }
        ],
        continuitaUltimiDueAnniItp: false,
        continuitaUltimiTreAnniItp: false
      }
    },
    {
      sigla: 'MAT',
      hasItp: false,
      continuita: { docentiAnniPrecedenti: [{ annoIndietro: 1 }, { annoIndietro: 2 }] }
    },
    {
      sigla: 'STO',
      continuita: {
        docentiAnniPrecedenti: [
          { annoIndietro: 1, titolare: { email: 'e2edocente4@onlinetest.aldo.local' } },
          { annoIndietro: 2, titolare: { email: 'e2edocente4@onlinetest.aldo.local' } }
        ]
      }
    }
  ];

  expect(() => assertClasseStorico(storico, materie)).not.toThrow();
  const matConItpNull = { ...materie[1], continuita: { docentiAnniPrecedenti: [{ itp: null }] } };
  expect(() => assertClasseStorico(storico, [materie[0], matConItpNull, materie[2]])).toThrow(
    /MAT.*itp/i
  );
});

test('document assertion rejects PEI/PDP cross-linking and render residue', () => {
  const docs = [
    {
      anno: '2025-2026',
      idGen: 'PIANI_PERSONALIZZATI',
      tipo: 'PIANO_PERS',
      sottotipo: 'PEI',
      link: 'https://drive.test/PEI_2025_2026'
    },
    {
      anno: '2025-2026',
      idGen: 'PIANI_PERSONALIZZATI',
      tipo: 'PIANO_PERS',
      sottotipo: 'PDP_BES',
      link: 'https://drive.test/PDP_BES_2025_2026'
    },
    {
      anno: '2024-2025',
      idGen: 'PIANI_PERSONALIZZATI',
      tipo: 'PIANO_PERS',
      sottotipo: 'PEI',
      link: 'https://drive.test/PEI_2024_2025'
    },
    {
      anno: '2024-2025',
      idGen: 'PIANI_PERSONALIZZATI',
      tipo: 'PIANO_PERS',
      sottotipo: 'PDP_BES',
      link: 'https://drive.test/PDP_BES_2024_2025'
    }
  ];

  expect(() => assertDocumentiStorici(docs)).not.toThrow();
  expect(() =>
    assertDocumentiStorici([
      { ...docs[0], link: 'https://drive.test/PDP_BES_cross' },
      ...docs.slice(1)
    ])
  ).toThrow(/isolamento/);
  expect(() =>
    assertStoricoRender(
      '2025-2026 2024-2025 NON_PROMOSSO ASL storico',
      '<p>2C 2025-2026; 1C 2024-2025</p>'
    )
  ).not.toThrow();
  expect(() => assertStoricoRender('{{focus.alunno.storico}}', '<p>ok</p>')).toThrow(/Mustache/);
});
