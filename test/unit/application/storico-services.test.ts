import { reconcileSigla } from '../../../src/application/storico/reconcileSigla';
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
  return { anno, db: new FakeDatabase(tables) };
}

function fakeProvider(anni: AnnoStorico[]): StoricoDatabaseProvider {
  return { anniStorici: (profondita) => anni.slice(0, profondita) };
}

function annoPrecedente(): Record<string, Row[]> {
  const tables = fixtureTables();
  // a1 was in 4A last year, promoted to 5A this year (CAMBIO 4A->5A).
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
  tables.MOV_ALUNNI = [
    { STUDENTE: 'a1@school.it', TIPO: 'CAMBIO', DATA: '2025-06-15', DA: '4A', A: '5A' }
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

// --- StoricoAlunniService ---

describe('StoricoAlunniService (13 §3)', () => {
  test('resolves class, esito, reconciled carenze and piani for the prior year', () => {
    const service = new StoricoAlunniService(
      fakeProvider([annoStorico('2025-2026', annoPrecedente())])
    );
    const [record] = service.perAlunno('a1@school.it', 1);
    expect(record).toBeDefined();
    expect(record!.anno).toBe('2025-2026');
    expect(record!.classe).toBe('4A');
    expect(record!.esito).toBe('PROMOSSO'); // 4A -> 5A
    expect(record!.carenze).toEqual([{ materiaSigla: 'MATE', valore: '4' }]);
    expect(record!.piani).toEqual(['PDP_DSA']);
  });

  test('esito RITIRATO when the year has an OUT movement', () => {
    const tables = annoPrecedente();
    tables.MOV_ALUNNI = [
      { STUDENTE: 'a1@school.it', TIPO: 'OUT', DATA: '2025-03-01', DA: '4A', A: 'RITIRO' }
    ];
    const service = new StoricoAlunniService(fakeProvider([annoStorico('2025-2026', tables)]));
    expect(service.perAlunno('a1@school.it', 1)[0]!.esito).toBe('RITIRATO');
  });

  test('esito NON_PROMOSSO when CAMBIO does not increase the class year', () => {
    const tables = annoPrecedente();
    tables.MOV_ALUNNI = [
      { STUDENTE: 'a1@school.it', TIPO: 'CAMBIO', DATA: '2025-06-15', DA: '4A', A: '4B' }
    ];
    const service = new StoricoAlunniService(fakeProvider([annoStorico('2025-2026', tables)]));
    expect(service.perAlunno('a1@school.it', 1)[0]!.esito).toBe('NON_PROMOSSO');
  });

  test('unknown student in that historical year yields a null-classe SCONOSCIUTO record, not a crash', () => {
    const service = new StoricoAlunniService(
      fakeProvider([annoStorico('2025-2026', annoPrecedente())])
    );
    const [record] = service.perAlunno('ghost@school.it', 1);
    expect(record).toEqual({
      anno: '2025-2026',
      classe: null,
      esito: 'SCONOSCIUTO',
      carenze: [],
      piani: []
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
  it('returns an empty array and never calls the Master Sheet when profondita <= 0', () => {
    const findAnniStorici = jest.fn();
    const master = { findAnniStorici } as unknown as MasterSheetRepository;
    const provider = new MasterStoricoDatabaseProvider(master, new LoggerService());

    expect(provider.anniStorici(0)).toEqual([]);
    expect(provider.anniStorici(-3)).toEqual([]);
    expect(findAnniStorici).not.toHaveBeenCalled();
  });
});
