import { CarenzaRepository } from '../../../src/infrastructure/repositories/CarenzaRepository';
import { DocenteRepository } from '../../../src/infrastructure/repositories/DocenteRepository';
import { SupplenzaRepository } from '../../../src/infrastructure/repositories/SupplenzaRepository';
import { LogEmailRepository } from '../../../src/infrastructure/repositories/LogEmailRepository';
import { Alunno } from '../../../src/domain/entities/Alunno';
import { Docente } from '../../../src/domain/entities/Docente';
import { StatoEmail } from '../../../src/domain/value-objects/enums';
import { FakeDatabase } from '../../../test/fakes/FakeDatabase';
import { fixtureTables } from '../../../test/fixtures/tables';

// REPORT_GLF.md B1/A1: verifies repositories actually take the DomainRepositoryLib
// query-pushdown path via `this.find(spec)` (select().from().where().execute()),
// not merely that results happen to be correct via the in-memory fallback.
test('CarenzaRepository.findByAlunno pushes the STUDENTE filter down through select()', () => {
  const db = new FakeDatabase(fixtureTables());
  const selectSpy = jest.spyOn(db, 'select');
  const repo = new CarenzaRepository(db);

  const a1 = Alunno.fromData({ EMAIL: 'a1@school.it' });
  const result = repo.findByAlunno(a1);

  expect(selectSpy).toHaveBeenCalled();
  expect(
    result
      .map(({ studente, progressivo, classe, data }) => ({ studente, progressivo, classe, data }))
      .sort((a, b) => a.progressivo - b.progressivo)
  ).toEqual([
    { studente: 'a1@school.it', progressivo: 1, classe: '5A', data: '2026-02-15' },
    { studente: 'a1@school.it', progressivo: 2, classe: '5A', data: '2026-05-20' }
  ]);
});

test('DocenteRepository.findITP pushes the ITP=true filter down through select()', () => {
  const db = new FakeDatabase(fixtureTables());
  const selectSpy = jest.spyOn(db, 'select');
  const repo = new DocenteRepository(db);

  const result = repo.findITP();

  expect(selectSpy).toHaveBeenCalled();
  expect(result.every((d) => d.isITP())).toBe(true);
});

test('CarenzaRepository.findNonNotificate (toQueryObject() null) falls back to in-memory filtering', () => {
  const db = new FakeDatabase(fixtureTables());
  const selectSpy = jest.spyOn(db, 'select');
  const repo = new CarenzaRepository(db);

  repo.findNonNotificate();

  // No equality criteria available; QueryTranslator.validate() must reject this
  // spec so Repository.find() takes the getAllRows()+isSatisfiedBy() fallback.
  expect(selectSpy).not.toHaveBeenCalled();
});

// REPORT_GLF.md A2: repository constructors build a hot-lookup index, and the
// finder actually uses it (not merely correct by coincidence via a scan).
test('CarenzaRepository builds a STUDENTE index at construction time', () => {
  const db = new FakeDatabase(fixtureTables());
  new CarenzaRepository(db);

  expect(db.tables.CARENZE.indexedLookup('STUDENTE', 'a1@school.it')).not.toBeNull();
});

test('SupplenzaRepository.findByTitolare/findBySupplente use the indexed lookup seam directly', () => {
  const db = new FakeDatabase({
    SUPPLENZE: [
      {
        TITOLARE: 'rossi@school.it',
        SUPPLENTE: 'bianchi@school.it',
        DAL: '2026-01-01',
        AL: '',
        CLASSI: '5A',
        MATERIE: 'MATE'
      },
      {
        TITOLARE: 'verdi@school.it',
        SUPPLENTE: 'rossi@school.it',
        DAL: '2026-01-01',
        AL: '',
        CLASSI: '3B',
        MATERIE: 'FISI'
      }
    ],
    DOCENTI: []
  });
  const indexedLookupSpy = jest.spyOn(db.tables.SUPPLENZE, 'indexedLookup');
  const repo = new SupplenzaRepository(db);
  const rossi = Docente.fromData({ EMAIL: 'rossi@school.it', DIPART: 'X' });

  const asTitolare = repo.findByTitolare(rossi);
  const asSupplente = repo.findBySupplente(rossi);

  expect(indexedLookupSpy).toHaveBeenCalledWith('TITOLARE', 'rossi@school.it');
  expect(indexedLookupSpy).toHaveBeenCalledWith('SUPPLENTE', 'rossi@school.it');
  expect(asTitolare.map((s) => s.supplente)).toEqual(['bianchi@school.it']);
  expect(asSupplente.map((s) => s.titolare)).toEqual(['verdi@school.it']);
});

test('LogEmailRepository.findByPattern uses the indexed lookup seam directly', () => {
  const db = new FakeDatabase({
    LOG_MAIL: [
      {
        PATTERN: 'P1',
        DESTINATARI: 'a@x.it',
        DATA: '2026-01-01',
        STATO: StatoEmail.SUCCESS,
        ALLEGATI: null,
        ERRORE: ''
      },
      {
        PATTERN: 'P2',
        DESTINATARI: 'b@x.it',
        DATA: '2026-01-01',
        STATO: StatoEmail.SUCCESS,
        ALLEGATI: null,
        ERRORE: ''
      }
    ]
  });
  const indexedLookupSpy = jest.spyOn(db.tables.LOG_MAIL, 'indexedLookup');
  const repo = new LogEmailRepository(db);

  const result = repo.findByPattern('P1');

  expect(indexedLookupSpy).toHaveBeenCalledWith('PATTERN', 'P1');
  expect(result.map((l) => l.destinatariRaw)).toEqual(['a@x.it']);
});
