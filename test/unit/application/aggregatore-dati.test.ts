import { AggregatoreDati } from '../../../src/application/services/AggregatoreDati';
import { StatoDocumento } from '../../../src/domain/value-objects/enums';
import { FakeDatabase } from '../../../test/fakes/FakeDatabase';
import { fixtureTables } from '../../../test/fixtures/tables';
import type { Row } from '../../../src/infrastructure/db/Database';
import { LogCartellaRepository } from '../../../src/infrastructure/repositories/LogCartellaRepository';
import type { LogDocumento } from '../../../src/domain/entities/LogDocumento';

function aggregatore(tables: Record<string, Row[]> = fixtureTables()): AggregatoreDati {
  return new AggregatoreDati(new FakeDatabase(tables));
}

const logger = new LoggerService();

test('getCarenzePerAlunno returns the student rows most-recent first (14 §2)', () => {
  const rows = aggregatore().getCarenzePerAlunno('a1@school.it');
  expect(rows.map((c) => c.data)).toEqual(['2026-05-20', '2026-02-15']); // desc
  expect(rows.every((c) => c.studente === 'a1@school.it')).toBe(true);
});

test('getDocumentiPerAlunno filters by UTENTI contains + tipo/stato (14 §2)', () => {
  const tables = fixtureTables();
  tables.LOG_DOCS = [
    {
      ID: 'd1',
      ID_GEN: 'CD1',
      TIPO: 'PDP',
      STATO: 'GENERATO',
      UTENTI: 'a1@school.it',
      CLASSI: '5A'
    },
    {
      ID: 'd2',
      ID_GEN: 'CD1',
      TIPO: 'VERBALE',
      STATO: 'ARCHIVIATO',
      UTENTI: 'a1@school.it',
      CLASSI: '5A'
    },
    {
      ID: 'd3',
      ID_GEN: 'CD1',
      TIPO: 'PDP',
      STATO: 'GENERATO',
      UTENTI: 'a2@school.it',
      CLASSI: '5A'
    }
  ];
  const agg = aggregatore(tables);
  expect(agg.getDocumentiPerAlunno('a1@school.it').map((d) => d.id)).toEqual(['d1', 'd2']);
  expect(agg.getDocumentiPerAlunno('a1@school.it', { tipo: 'PDP' }).map((d) => d.id)).toEqual([
    'd1'
  ]);
  expect(
    agg.getDocumentiPerAlunno('a1@school.it', { stato: StatoDocumento.ARCHIVIATO }).map((d) => d.id)
  ).toEqual(['d2']);
});

test('getDocumentiPerClasse and getCartellePerClasse filter by CSV contains (14 §2)', () => {
  const tables = fixtureTables();
  tables.LOG_DOCS = [
    { ID: 'd1', ID_GEN: 'CD1', TIPO: 'VERBALE', STATO: 'GENERATO', CLASSI: '5A,3B', UTENTI: '' }
  ];
  tables.LOG_FOLD = [
    { ID: 'f1', PATH: 'Verbali/5', LINK: '', CLASSI: '5A', UTENTI: '' },
    { ID: 'f2', PATH: 'Verbali/3', LINK: '', CLASSI: '3B', UTENTI: '' }
  ];
  const agg = aggregatore(tables);
  expect(agg.getDocumentiPerClasse('5A').map((d) => d.id)).toEqual(['d1']);
  expect(agg.getCartellePerClasse('5A').map((f) => f.id ?? '')).toEqual(['f1']);
});

test('documentiPerClasse exposes parent-owned documents to a partner without rewriting CLASSI', () => {
  const tables = fixtureTables();
  tables.CLASSI = [
    {
      ID: '3C',
      ANNO: 3,
      INDIRIZZO: 'SCI',
      ARTICOLAZIONE: JSON.stringify({ partners: '3C-S,3C-C' })
    },
    {
      ID: '3C-S',
      ANNO: 3,
      INDIRIZZO: 'SCI',
      ARTICOLAZIONE: JSON.stringify({ parent: '3C', partner: '3C-C' })
    }
  ];
  tables.LOG_DOCS = [
    {
      ID: 'verbale-parent',
      ID_GEN: 'VERBALE',
      TIPO: 'VERBALE',
      STATO: 'GENERATO',
      CLASSI: '3C',
      UTENTI: ''
    }
  ];
  const agg = aggregatore(tables);

  expect(agg.getDocumentiPerClasse('3C-S').map((doc) => doc.id)).toEqual(['verbale-parent']);
  expect(
    (agg.perMetodo('documentiPerClasse', { classeId: '3C-S' }, logger) as LogDocumento[]).map(
      (doc) => doc.id
    )
  ).toEqual(['verbale-parent']);
  expect(tables.LOG_DOCS[0]!.CLASSI).toBe('3C');
});

test('getEmailCoordinatori reads CLASSI.COORD (14 §2)', () => {
  expect(
    aggregatore()
      .getEmailCoordinatori('5A')
      .map((e) => e.value)
  ).toEqual(['rossi@school.it']);
  expect(aggregatore().getEmailCoordinatori('9Z')).toEqual([]);
});

test('perMetodo routes DATI_SORGENTE.metodo; unknown method warns and returns null (14 §2, 11 §5)', () => {
  const agg = aggregatore();
  expect(agg.perMetodo('carenzePerAlunno', { alunnoEmail: 'a1@school.it' }, logger)).toHaveLength(
    2
  );
  expect(agg.perMetodo('emailCoordinatori', { classeId: '5A' }, logger)).toHaveLength(1);
  expect(agg.perMetodo('inesistente', {}, logger)).toBeNull();
});

test('the full-table load is memoized: later inserts are not observed (N+1 prevention)', () => {
  const db = new FakeDatabase(fixtureTables());
  const agg = new AggregatoreDati(db);
  const before = agg.getCarenzePerAlunno('a1@school.it').length;
  // Insert a new CARENZE row AFTER the first query populated the cache.
  db.table('CARENZE').insert({
    STUDENTE: 'a1@school.it',
    PROGRESSIVO: 9,
    CLASSE: '5A',
    DATA: '2026-06-01',
    MATE: '3'
  });
  const after = agg.getCarenzePerAlunno('a1@school.it').length;
  expect(after).toBe(before); // served from the memoized snapshot, not re-read
});

test('perMetodo routes documentiPerClasse and cartellePerClasse to their accessors (14 §2)', () => {
  const tables = fixtureTables();
  tables.LOG_DOCS = [
    { ID: 'd1', ID_GEN: 'CD1', TIPO: 'VERBALE', STATO: 'GENERATO', CLASSI: '5A,3B', UTENTI: '' }
  ];
  tables.LOG_FOLD = [
    { ID: 'f1', PATH: 'Verbali/5', LINK: '', CLASSI: '5A', UTENTI: '' },
    { ID: 'f2', PATH: 'Verbali/3', LINK: '', CLASSI: '3B', UTENTI: '' }
  ];
  const agg = aggregatore(tables);
  expect(
    (agg.perMetodo('documentiPerClasse', { classeId: '5A' }, logger) as { id: string }[]).map(
      (d) => d.id
    )
  ).toEqual(['d1']);
  expect(
    (
      agg.perMetodo('cartellePerClasse', { classeId: '5A' }, logger) as { id: string | undefined }[]
    ).map((f) => f.id ?? '')
  ).toEqual(['f1']);
});

test('perMetodo logs a warning with the unknown metodo name and returns null (11 §5)', () => {
  const agg = aggregatore();
  const warnSpy = jest.spyOn(logger, 'warn');
  const result = agg.perMetodo('boh', {}, logger);
  expect(result).toBeNull();
  expect(warnSpy).toHaveBeenCalledWith(
    expect.stringContaining('metodo DATI_SORGENTE sconosciuto "boh"')
  );
  warnSpy.mockRestore();
});

test('getDocumentiPerAlunno filters by sottotipo too, and only matches when ALL provided filtri match (14 §2)', () => {
  const tables = fixtureTables();
  tables.LOG_DOCS = [
    {
      ID: 'd1',
      ID_GEN: 'CD1',
      TIPO: 'PDP',
      SOTTOTIPO: 'ANNUALE',
      STATO: 'GENERATO',
      UTENTI: 'a1@school.it',
      CLASSI: '5A'
    },
    {
      ID: 'd2',
      ID_GEN: 'CD1',
      TIPO: 'PDP',
      SOTTOTIPO: 'INTERMEDIO',
      STATO: 'GENERATO',
      UTENTI: 'a1@school.it',
      CLASSI: '5A'
    }
  ];
  const agg = aggregatore(tables);
  expect(
    agg.getDocumentiPerAlunno('a1@school.it', { sottotipo: 'ANNUALE' }).map((d) => d.id)
  ).toEqual(['d1']);
  expect(agg.getDocumentiPerAlunno('a1@school.it', { sottotipo: 'INESISTENTE' })).toEqual([]);
  expect(
    agg
      .getDocumentiPerAlunno('a1@school.it', { tipo: 'PDP', sottotipo: 'ANNUALE' })
      .map((d) => d.id)
  ).toEqual(['d1']);
});

test('allCartelle() memoizes LOG_FOLD: cartellePerClasse called twice reads the table only once (N+1 prevention)', () => {
  const db = new FakeDatabase(fixtureTables());
  const findAllSpy = jest.spyOn(LogCartellaRepository.prototype, 'findAll');
  const agg = new AggregatoreDati(db);
  agg.getCartellePerClasse('5A');
  agg.getCartellePerClasse('3B');
  expect(findAllSpy).toHaveBeenCalledTimes(1);
  findAllSpy.mockRestore();
});
