import { reconcileSigla } from '../../../src/application/storico/reconcileSigla';
import { Alunno } from '../../../src/domain/entities/Alunno';
import { StoricoAlunniService } from '../../../src/application/storico/StoricoAlunniService';
import { StoricoDocumentiService } from '../../../src/application/storico/StoricoDocumentiService';
import { StoricoClassiService } from '../../../src/application/storico/StoricoClassiService';
import { StoricoDocentiService } from '../../../src/application/storico/StoricoDocentiService';
import { MasterStoricoDatabaseProvider } from '../../../src/application/storico/StoricoDatabaseProvider';
import type {
  StoricoDatabaseProvider,
  AnnoStorico
} from '../../../src/application/storico/StoricoDatabaseProvider';
import { MasterSheetRepository } from '../../../src/infrastructure/repositories/MasterSheetRepository';
import { ClasseRepository } from '../../../src/infrastructure/repositories/ClasseRepository';
import { LogDocumentoRepository } from '../../../src/infrastructure/repositories/LogDocumentoRepository';
import { TABLE } from '../../../src/config/schema';
import { Materia } from '../../../src/domain/entities/Materia';
import { ClasseId } from '../../../src/domain/value-objects/ClasseId';
import { FakeDatabase } from '../../../test/fakes/FakeDatabase';
import { fixtureTables } from '../../../test/fixtures/tables';
import type { Row } from '../../../src/infrastructure/db/Database';

// --- LazyRef ---

test('LazyRef resolves the loader once and caches (13 §2)', () => {
  let calls = 0;
  const ref = new LazyRef(() => {
    calls += 1;
    return 42;
  });
  expect(ref.isResolved()).toBe(false);
  expect(ref.get()).toBe(42);
  expect(ref.get()).toBe(42);
  expect(calls).toBe(1);
  expect(ref.isResolved()).toBe(true);
});

// --- reconcileSigla ---

test('reconcileSigla maps a historical sigla to the current one via MATERIE.EVOLUZIONE (13 §3/§8)', () => {
  const sto = Materia.fromData({
    ID: 'STO',
    NOME: 'Storia',
    EVOLUZIONE: '{"GST":[1,2],"STO":[3,4,5]}'
  });
  expect(reconcileSigla('GST', 1, [sto])).toBe('STO');
  expect(reconcileSigla('GST', 2, [sto])).toBe('STO');
  expect(reconcileSigla('STO', 4, [sto])).toBe('STO');
});

test('reconcileSigla returns the original sigla when no MATERIA declares it', () => {
  const mate = Materia.fromData({ ID: 'MATE', NOME: 'Matematica' });
  expect(reconcileSigla('XYZ', 1, [mate])).toBe('XYZ');
});

// --- Fake historical provider over two prior years ---

function annoStorico(anno: string, tables: Record<string, Row[]>): AnnoStorico {
  const db = new FakeDatabase(tables);
  return {
    anno,
    db,
    logDocs: new LogDocumentoRepository(db, new LazyRef(() => new ClasseRepository(db)))
  };
}

function fakeProvider(anni: AnnoStorico[]): StoricoDatabaseProvider {
  return { anniStorici: (profondita) => anni.slice(0, profondita) };
}

function sheetTable(rows: Row[]) {
  return {
    getAllRows: jest.fn().mockReturnValue(rows),
    getByPK: jest.fn().mockReturnValue(null),
    createIndex: jest.fn(),
    defineVirtualColumn: jest.fn(),
    setPrimaryKey: jest.fn()
  };
}

function mockDatabaseServiceWith(tables: Record<string, ReturnType<typeof sheetTable>>) {
  const databaseService = jest
    .fn()
    .mockImplementation(() => ({ tables }));
  (global as unknown as { DatabaseService: unknown }).DatabaseService = databaseService;
  return databaseService;
}

function masterWithYear(annoScolasticoRaw: string): MasterSheetRepository {
  return {
    findAnniStorici: jest
      .fn()
      .mockReturnValue([{ idSpreadsheet: 'STORICO_MINIMO', annoScolasticoRaw }])
  } as unknown as MasterSheetRepository;
}

const logger = new LoggerService();

function annoPrecedente(overrides: { movAlunni?: Row[] } = {}): Record<string, Row[]> {
  const tables = fixtureTables();
  tables.CLASSI = [
    {
      ID: '4A',
      ANNO: 4,
      INDIRIZZO: 'SCIENTIFICO',
      ARTICOLAZIONE: null,
      RUOLI: null,
      ATTIVA: true,
      COORD: 'rossi@school.it',
      MATE: 'rossi@school.it',
      FISI: 'bianchi@school.it'
    }
  ];
  tables.ALUNNI = [
    {
      EMAIL: 'a1@school.it',
      COGNOMENOME: 'VERDI ANNA',
      CLASSE: '4A',
      RELIGIONE: 'IRC',
      ATTIVO: true,
      RIPETENTE: false,
      RAPPR_STUD: false,
      TUTOR_1: 'genitore1@x.it',
      TUTOR_2: '',
      CURRICULUM: null
    }
  ];
  tables.CARENZE = [
    {
      STUDENTE: 'a1@school.it',
      PROGRESSIVO: 1,
      CLASSE: '4A',
      DATA: '2025-05-10',
      NOTIFICATO: '2025-05-11',
      ASSENZE: false,
      MATE: '4'
    }
  ];
  // CAMBIO is deliberately present but must never drive esito any more (13 §... /
  // ANALYSIS_HISTORIC_ENRICH_EXTENSION.md §1): it is an internal same-year
  // section change, structurally incapable of signalling promotion.
  tables.MOV_ALUNNI = overrides.movAlunni ?? [
    { STUDENTE: 'a1@school.it', TIPO: 'CAMBIO', DATA: '2025-06-15', DA: '4A', A: '4B' }
  ];
  tables.PIANI = [{ STUDENTE: 'a1@school.it', TIPO: 'PDP_DSA', PARAMETRI: null }];
  tables.LOG_DOCS = [
    {
      ID: 'old_pdp',
      ID_GEN: 'CD_PDP',
      TIPO: 'PDP',
      STATO: 'ARCHIVIATO',
      UTENTI: 'a1@school.it',
      CLASSI: '4A'
    },
    {
      ID: 'old_verbale',
      ID_GEN: 'CD1',
      TIPO: 'VERBALE',
      STATO: 'ARCHIVIATO',
      UTENTI: '',
      CLASSI: '4A'
    }
  ];
  return tables;
}

function alunnoAnnoCorrente(ripetente: boolean): Alunno {
  return Alunno.fromData({
    EMAIL: 'a1@school.it',
    COGNOMENOME: 'VERDI ANNA',
    CLASSE: '5A',
    RELIGIONE: 'IRC',
    ATTIVO: true,
    RIPETENTE: ripetente,
    RAPPR_STUD: false,
    CURRICULUM: null
  });
}

// --- StoricoAlunniService ---

describe('StoricoAlunniService (13 §3, ANALYSIS_HISTORIC_ENRICH_EXTENSION §2-5)', () => {
  test('esito PROMOSSO when the current-year record exists and is not RIPETENTE', () => {
    const service = new StoricoAlunniService(
      fakeProvider([annoStorico('2025-2026', annoPrecedente())])
    );
    const [record] = service.perAlunno('a1@school.it', 1, alunnoAnnoCorrente(false));
    expect(record).toEqual(
      expect.objectContaining({ anno: '2025-2026', classe: '4A', esito: 'PROMOSSO' })
    );
    expect(record!.anno).toBe('2025-2026');
    expect(record!.classe).toBe('4A');
    expect(record!.esito).toBe('PROMOSSO');
    expect(record!.carenze).toEqual([{ materiaSigla: 'MATE', valore: '4' }]);
    expect(record!.piani).toEqual(['PDP_DSA']);
    expect(record!.presenteTuttoAnno).toBe(false); // the inert CAMBIO row still counts as a mid-year entry
  });

  test('esito NON_PROMOSSO when the current-year record exists and is RIPETENTE', () => {
    const service = new StoricoAlunniService(
      fakeProvider([annoStorico('2025-2026', annoPrecedente({ movAlunni: [] }))])
    );
    const [record] = service.perAlunno('a1@school.it', 1, alunnoAnnoCorrente(true));
    expect(record!.esito).toBe('NON_PROMOSSO');
    expect(record!.presenteTuttoAnno).toBe(true); // no movement at all this time
  });

  test('esito SCONOSCIUTO when no next-year record is available (boundary of configured depth)', () => {
    const service = new StoricoAlunniService(
      fakeProvider([annoStorico('2025-2026', annoPrecedente({ movAlunni: [] }))])
    );
    const [record] = service.perAlunno('a1@school.it', 1, null);
    expect(record!.esito).toBe('SCONOSCIUTO');
  });

  test('esito TRASFERITO when the year has an OUT movement, regardless of next-year RIPETENTE', () => {
    const tables = annoPrecedente({
      movAlunni: [{ STUDENTE: 'a1@school.it', TIPO: 'OUT', DATA: '2025-03-01', DA: '4A', A: 'ALTRO ISTITUTO' }]
    });
    const service = new StoricoAlunniService(fakeProvider([annoStorico('2025-2026', tables)]));
    expect(service.perAlunno('a1@school.it', 1, alunnoAnnoCorrente(false))[0]!.esito).toBe(
      'TRASFERITO'
    );
  });

  test('esito RITIRATO when the year has a RITIRATO movement', () => {
    const tables = annoPrecedente({
      movAlunni: [{ STUDENTE: 'a1@school.it', TIPO: 'RITIRATO', DATA: '2025-03-01', DA: '4A', A: '' }]
    });
    const service = new StoricoAlunniService(fakeProvider([annoStorico('2025-2026', tables)]));
    expect(service.perAlunno('a1@school.it', 1, alunnoAnnoCorrente(false))[0]!.esito).toBe(
      'RITIRATO'
    );
  });

  test('an OUT/RITIRATO movement takes priority over a RIPETENTE-derived esito', () => {
    const tables = annoPrecedente({
      movAlunni: [{ STUDENTE: 'a1@school.it', TIPO: 'OUT', DATA: '2025-03-01', DA: '4A', A: 'ALTRO ISTITUTO' }]
    });
    const service = new StoricoAlunniService(fakeProvider([annoStorico('2025-2026', tables)]));
    // Even though the student is RIPETENTE next year (contradictory data), OUT wins.
    expect(service.perAlunno('a1@school.it', 1, alunnoAnnoCorrente(true))[0]!.esito).toBe(
      'TRASFERITO'
    );
  });

  test('unknown student in that historical year yields a null-classe SCONOSCIUTO record, not a crash', () => {
    const service = new StoricoAlunniService(
      fakeProvider([annoStorico('2025-2026', annoPrecedente())])
    );
    const [record] = service.perAlunno('ghost@school.it', 1, alunnoAnnoCorrente(false));
    expect(record).toEqual({
      anno: '2025-2026',
      classe: null,
      esito: 'SCONOSCIUTO',
      carenze: [],
      piani: [],
      presenteAnnoPrecedente: false,
      presenteTuttoAnno: false
    });
  });

  test('profondita limits how many prior years are consulted', () => {
    const anni = [
      annoStorico('2025-2026', annoPrecedente()),
      annoStorico('2024-2025', annoPrecedente())
    ];
    const service = new StoricoAlunniService(fakeProvider(anni));
    expect(service.perAlunno('a1@school.it', 1)).toHaveLength(1);
    expect(service.perAlunno('a1@school.it', 2)).toHaveLength(2);
  });

  test('esito for a year uses the NEXT fetched historical year (not the current year) when profondita > 1', () => {
    // anni[0] = 2025-2026 (RIPETENTE=false -> the anni[1] year was PROMOSSO),
    // anni[1] = 2024-2025 (esito resolved from anni[0]'s RIPETENTE flag: false).
    const anni = [
      annoStorico('2025-2026', annoPrecedente({ movAlunni: [] })), // RIPETENTE=false by default fixture
      annoStorico('2024-2025', annoPrecedente({ movAlunni: [] }))
    ];
    const service = new StoricoAlunniService(fakeProvider(anni));
    const records = service.perAlunno('a1@school.it', 2, alunnoAnnoCorrente(false));
    expect(records[0]!.esito).toBe('PROMOSSO'); // resolved from the (current-year) param
    expect(records[1]!.esito).toBe('PROMOSSO'); // resolved from anni[0]'s own RIPETENTE=false
    expect(records[0]!.presenteAnnoPrecedente).toBe(true); // anni[1] has a matching ALUNNI row
    expect(records[1]!.presenteAnnoPrecedente).toBe(false); // no anni[2] fetched -> boundary default
  });
});

// --- StoricoDocumentiService ---

test('StoricoDocumentiService finds prior-year documents matching UTENTI + ID_GEN (13 §4)', () => {
  const service = new StoricoDocumentiService(
    fakeProvider([annoStorico('2025-2026', annoPrecedente())])
  );
  const docs = service.perAlunno('a1@school.it', 'CD_PDP', 1);
  expect(docs).toEqual([{ anno: '2025-2026', nome: '', link: '' }]);
  expect(service.perAlunno('a1@school.it', 'NOPE', 1)).toEqual([]);
});

test('StoricoDocumentiService.perAlunnoConTipo returns every prior-year document with distinct family, subtype and generator fields', () => {
  const anni = [annoStorico('2025-2026', annoPrecedente())];
  const service = new StoricoDocumentiService(fakeProvider(anni));
  expect(service.perAlunnoConTipo('a1@school.it', 1)).toEqual([
    { anno: '2025-2026', nome: '', link: '', tipo: 'PDP', sottotipo: '', idGen: 'CD_PDP' }
  ]);
  expect(service.perAlunnoConTipo('nope@school.it', 1)).toEqual([]);
});

test('reads historical documents from the minimal CLASSI/ALUNNI/LOG_DOCS database', () => {
  const originalDatabaseService = (global as unknown as { DatabaseService: unknown })
    .DatabaseService;
  const tables = {
    [TABLE.CLASSI]: sheetTable([{ ID: '4A' }]),
    [TABLE.ALUNNI]: sheetTable([{ EMAIL: 'a1@school.it', CLASSE: '4A' }]),
    [TABLE.LOG_DOCS]: sheetTable([
      {
        ID: 'old-plan',
        ID_GEN: 'PIANI_PERSONALIZZATI',
        TIPO: 'PIANO_PERS',
        SOTTOTIPO: 'PDP_BES',
        NOME: 'PDP anno precedente',
        LINK: 'https://drive/old-plan',
        UTENTI: 'a1@school.it',
        STATO: 'GENERATO'
      }
    ])
  };
  const databaseService = mockDatabaseServiceWith(tables);
  const utilsSpy = jest.spyOn(ServiceFactory, 'getUtils').mockReturnValue({});
  const cacheSpy = jest.spyOn(ServiceFactory, 'getCacheService').mockReturnValue({
    getScriptCache: () => ({})
  });
  const exceptionSpy = jest
    .spyOn(ServiceFactory, 'getExceptionService')
    .mockReturnValue({ executeWithRetry: jest.fn() });

  try {
    const provider = new MasterStoricoDatabaseProvider(masterWithYear('2025-2026'), logger);
    const result = new StoricoDocumentiService(provider).perAlunnoConTipo('a1@school.it');
    const historicalDatabase = databaseService.mock.results[0]!.value as {
      tables: Record<string, unknown>;
    };

    expect(Object.keys(historicalDatabase.tables).sort()).toEqual(
      [TABLE.CLASSI, TABLE.ALUNNI, TABLE.LOG_DOCS].sort()
    );

    expect(result).toEqual([
      expect.objectContaining({
        anno: '2025-2026',
        nome: 'PDP anno precedente',
        tipo: 'PIANO_PERS',
        sottotipo: 'PDP_BES'
      })
    ]);
  } finally {
    exceptionSpy.mockRestore();
    cacheSpy.mockRestore();
    utilsSpy.mockRestore();
    (global as unknown as { DatabaseService: unknown }).DatabaseService = originalDatabaseService;
  }
});

// --- StoricoClassiService ---

describe('StoricoClassiService (13 §5)', () => {
  test('reconstructs the CDC of the class STORICO name in the prior year', () => {
    const service = new StoricoClassiService(
      fakeProvider([annoStorico('2025-2026', annoPrecedente())])
    );
    const [record] = service.perClasse([ClasseId.of('4A')], 1);
    expect(record!.nomeStorico).toBe('4A');
    expect(record!.docenti.sort((a, b) => a.materia.localeCompare(b.materia))).toEqual([
      { docenteEmail: 'bianchi@school.it', materia: 'FISI', isItp: false },
      { docenteEmail: 'rossi@school.it', materia: 'MATE', isItp: false }
    ]);
  });

  test('a year with no STORICO entry yields an empty record (class did not exist under a known name)', () => {
    const anni = [
      annoStorico('2025-2026', annoPrecedente()),
      annoStorico('2024-2025', annoPrecedente())
    ];
    const service = new StoricoClassiService(fakeProvider(anni));
    const records = service.perClasse([ClasseId.of('4A')], 2); // only one STORICO name for two years
    expect(records[1]).toEqual({ anno: '2024-2025', nomeStorico: null, docenti: [] });
  });
});

// --- StoricoDocentiService ---

test('StoricoDocentiService scans historical CLASSI for the teacher across all classes (13 §6)', () => {
  const service = new StoricoDocentiService(
    fakeProvider([annoStorico('2025-2026', annoPrecedente())])
  );
  const [record] = service.perDocente('rossi@school.it', 1);
  expect(record!.classi).toEqual([{ classe: '4A', materia: 'MATE' }]);
  expect(service.perDocente('nessuno@school.it', 1)[0]!.classi).toEqual([]);
});

describe('StoricoDocentiService.perDocente — no matches', () => {
  test('returns one AnnoDocenteStorico per year with an empty classi array when the teacher taught nothing that year', () => {
    const tables = fixtureTables();
    const claseRowSenzaDocente: Row = {
      ID: '4A',
      ANNO: 4,
      INDIRIZZO: 'SCIENTIFICO',
      ARTICOLAZIONE: null,
      RUOLI: null,
      ATTIVA: true,
      COORD: '',
      MATE: '',
      FISI: ''
    };
    tables.CLASSI = [claseRowSenzaDocente];
    const service = new StoricoDocentiService(fakeProvider([annoStorico('2023-2024', tables)]));

    expect(service.perDocente('prof.nessuno@example.com')).toEqual([
      { anno: '2023-2024', classi: [] }
    ]);
  });
});

// --- MasterStoricoDatabaseProvider ---

describe('MasterStoricoDatabaseProvider.anniStorici — depth guard', () => {
  function mockHistoricalDatabaseConstruction() {
    const originalDatabaseService = (global as unknown as { DatabaseService: unknown })
      .DatabaseService;
    const databaseService = jest.fn().mockImplementation(() => ({
      tables: new Proxy({}, { get: () => sheetTable([]) })
    }));
    (global as unknown as { DatabaseService: unknown }).DatabaseService = databaseService;
    const utilsSpy = jest.spyOn(ServiceFactory, 'getUtils').mockReturnValue({});
    const cacheSpy = jest.spyOn(ServiceFactory, 'getCacheService').mockReturnValue({
      getScriptCache: () => ({})
    });
    const exceptionSpy = jest
      .spyOn(ServiceFactory, 'getExceptionService')
      .mockReturnValue({ executeWithRetry: jest.fn() });

    return () => {
      exceptionSpy.mockRestore();
      cacheSpy.mockRestore();
      utilsSpy.mockRestore();
      (global as unknown as { DatabaseService: unknown }).DatabaseService = originalDatabaseService;
    };
  }

  it('returns an empty array and never calls the Master Sheet when profondita <= 0', () => {
    const findAnniStorici = jest.fn();
    const master = { findAnniStorici } as unknown as MasterSheetRepository;
    const provider = new MasterStoricoDatabaseProvider(master, new LoggerService());

    expect(provider.anniStorici(0)).toEqual([]);
    expect(provider.anniStorici(-3)).toEqual([]);
    expect(findAnniStorici).not.toHaveBeenCalled();
  });

  it('waits for the essential tables when opening a just-created historical database', () => {
    const originalDatabaseService = (global as unknown as { DatabaseService: unknown })
      .DatabaseService;
    const table = {
      getAllRows: jest.fn().mockReturnValue([]),
      getByPK: jest.fn().mockReturnValue(null),
      createIndex: jest.fn(),
      defineVirtualColumn: jest.fn(),
      setPrimaryKey: jest.fn()
    };
    const databaseService = jest.fn().mockImplementation(() => ({
      tables: new Proxy({}, { get: () => table })
    }));
    (global as unknown as { DatabaseService: unknown }).DatabaseService = databaseService;
    const utilsSpy = jest.spyOn(ServiceFactory, 'getUtils').mockReturnValue({});
    const cacheSpy = jest.spyOn(ServiceFactory, 'getCacheService').mockReturnValue({
      getScriptCache: () => ({})
    });
    const exceptionService = { executeWithRetry: jest.fn() };
    const exceptionSpy = jest
      .spyOn(ServiceFactory, 'getExceptionService')
      .mockReturnValue(exceptionService);
    const master = {
      findAnniStorici: jest.fn().mockReturnValue([
        { idSpreadsheet: 'STORICO_APPENA_CREATO', annoScolasticoRaw: '2025-2026' }
      ])
    } as unknown as MasterSheetRepository;

    try {
      new MasterStoricoDatabaseProvider(master, new LoggerService()).anniStorici(1);

      expect(databaseService).toHaveBeenCalledWith(
        'STORICO_APPENA_CREATO',
        expect.anything(),
        expect.anything(),
        expect.anything(),
        exceptionService,
        { verifyTables: [TABLE.CLASSI, TABLE.LOG_DOCS] }
      );
    } finally {
      exceptionSpy.mockRestore();
      cacheSpy.mockRestore();
      utilsSpy.mockRestore();
      (global as unknown as { DatabaseService: unknown }).DatabaseService = originalDatabaseService;
    }
  });

  test('riusa il database di un anno già aperto tra chiamate successive', () => {
    const restore = mockHistoricalDatabaseConstruction();
    const master = {
      findAnniStorici: jest.fn(() => [
        { idSpreadsheet: 'ss1', annoScolasticoRaw: '2025-2026' }
      ])
    };
    const provider = new MasterStoricoDatabaseProvider(master as never, new LoggerService());

    try {
      const first = provider.anniStorici(1);
      const second = provider.anniStorici(1);

      expect(second[0]!.db).toBe(first[0]!.db);
      expect(second[0]!.logDocs).toBe(first[0]!.logDocs);
    } finally {
      restore();
    }
  });

  test('apre un anno non ancora visto quando la profondità cresce', () => {
    const restore = mockHistoricalDatabaseConstruction();
    const master = {
      findAnniStorici: jest
        .fn()
        .mockReturnValueOnce([{ idSpreadsheet: 'ss1', annoScolasticoRaw: '2025-2026' }])
        .mockReturnValueOnce([
          { idSpreadsheet: 'ss1', annoScolasticoRaw: '2025-2026' },
          { idSpreadsheet: 'ss2', annoScolasticoRaw: '2024-2025' }
        ])
    };
    const provider = new MasterStoricoDatabaseProvider(master as never, new LoggerService());

    try {
      const shallow = provider.anniStorici(1);
      const deep = provider.anniStorici(2);

      expect(deep).toHaveLength(2);
      expect(deep[0]!.db).toBe(shallow[0]!.db);
    } finally {
      restore();
    }
  });
});
