import { SupplenzaRepository } from '../../../src/infrastructure/repositories/SupplenzaRepository';
import { Supplenza } from '../../../src/domain/entities/Supplenza';
import { Docente } from '../../../src/domain/entities/Docente';
import { FakeDatabase } from '../../../test/fakes/FakeDatabase';
import { fixtureTables } from '../../../test/fixtures/tables';
import { ClasseId } from '../../../src/domain/value-objects/ClasseId';
import { MateriaId } from '../../../src/domain/value-objects/MateriaId';
import { EntityNotFoundError, ValidationError } from '../../../src/domain/errors/DomainError';
import { TABLE } from '../../../src/config/schema';

function repo(): SupplenzaRepository {
  return new SupplenzaRepository(new FakeDatabase(fixtureTables()));
}
function repoAndDb(): { r: SupplenzaRepository; db: FakeDatabase } {
  const db = new FakeDatabase(fixtureTables());
  return { r: new SupplenzaRepository(db), db };
}
const rossi = Docente.fromData({ EMAIL: 'rossi@school.it' });

test('Supplenza: composite identity, period, context predicates (04 §14)', () => {
  const s = Supplenza.fromData({
    TITOLARE: 'rossi@school.it',
    SUPPLENTE: 'bianchi@school.it',
    DAL: '2025-11-01',
    AL: '2025-11-30',
    CLASSI: '5A,4B',
    MATERIE: '*'
  });
  expect(s.id).toBe('rossi@school.it::bianchi@school.it::2025-11-01::5A,4B::*');
  expect(s.isAttivaData(new Date('2025-11-15'))).toBe(true);
  expect(s.applicaAClasse(ClasseId.of('5A'))).toBe(true);
  expect(s.applicaAClasse(ClasseId.of('3C'))).toBe(false);
  expect(s.applicaAMateria(MateriaId.of('ITA'))).toBe(true); // wildcard
  expect(s.applicaAContesto(ClasseId.of('4B'), MateriaId.of('MATE'))).toBe(true);
});

test('findByTitolare / findBySupplente / findAttive', () => {
  const r = repo();
  expect(r.findByTitolare(rossi).map((s) => s.supplente)).toEqual(['bianchi@school.it']);
  expect(r.findBySupplente(rossi).map((s) => s.titolare)).toEqual(['verdi@school.it']);
  expect(
    r
      .findAttive(new Date('2025-11-15'))
      .map((s) => s.titolare)
      .sort()
  ).toEqual(['bianchi@school.it', 'rossi@school.it']);
});

test('getTitolare / getSupplente resolve Docente entities', () => {
  const r = repo();
  const s = r.findByTitolare(rossi)[0]!;
  expect(r.getTitolare(s).id).toBe('rossi@school.it');
  expect(r.getSupplente(s).id).toBe('bianchi@school.it');
});

// --- A19: indexed-lookup fallback, overlap-conflict, and hydration branches ---

describe('SupplenzaRepository — indexed-lookup fallback, overlap, and hydration branches', () => {
  test('findByTitolare falls back to a full scan when indexedLookup returns null', () => {
    const { r, db } = repoAndDb();
    jest.spyOn(db.tables.SUPPLENZE!, 'indexedLookup').mockReturnValue(null);
    expect(r.findByTitolare(rossi).map((s) => s.supplente)).toEqual(['bianchi@school.it']);
  });

  test('findBySupplente falls back to a full scan when indexedLookup returns null', () => {
    const { r, db } = repoAndDb();
    jest.spyOn(db.tables.SUPPLENZE!, 'indexedLookup').mockReturnValue(null);
    expect(r.findBySupplente(rossi).map((s) => s.titolare)).toEqual(['verdi@school.it']);
  });

  test('creaSupplenza throws ValidationError when an overlapping supplenza exists for the same titolare+context', () => {
    const r = repo();
    const verdiD = Docente.fromData({ EMAIL: 'verdi@school.it' });
    // rossi already has 5A,4B/* active 2025-11-01..2025-11-30 (fixture); this overlaps on 5A/*.
    expect(() =>
      r.creaSupplenza(rossi, verdiD, new Date('2025-11-10'), new Date('2025-11-20'), '5A', '*')
    ).toThrow(ValidationError);
  });

  test('creaSupplenza detects overlap between a restriction-by-omission row and an explicit-CSV row for the same nominal cattedra', () => {
    const db = new FakeDatabase({
      ...fixtureTables(),
      SUPPLENZE: [
        ...(fixtureTables().SUPPLENZE ?? []),
        {
          TITOLARE: 'bianchi@school.it',
          SUPPLENTE: 'rossi@school.it',
          DAL: '2026-03-01',
          AL: '2026-03-10',
          // Restriction-by-omission: resolves to bianchi's own nominal FISI
          // cattedre (5A, 1F-LSO per fixtureTables' CLASSI). Its raw CLASSI/
          // MATERIE text ('' / 'FISI') never intersects the explicit-CSV row
          // below ('5A' / 'FISI') -- the pre-expansion check alone would miss
          // this real overlap (ref design 2026-07-30-cattedra-chain-verification §5).
          CLASSI: '',
          MATERIE: 'FISI'
        }
      ]
    });
    const r = new SupplenzaRepository(db);
    const bianchi = Docente.fromData({ EMAIL: 'bianchi@school.it' });
    const verdi = Docente.fromData({ EMAIL: 'verdi@school.it' });
    expect(() =>
      r.creaSupplenza(bianchi, verdi, new Date('2026-03-05'), new Date('2026-03-08'), '5A', 'FISI')
    ).toThrow(ValidationError);
  });

  test('requireDocente throws EntityNotFoundError for an unknown email', () => {
    const r = repo();
    const s = Supplenza.fromData({
      TITOLARE: 'ghost@school.it',
      SUPPLENTE: 'bianchi@school.it',
      DAL: '2025-11-01',
      AL: '2025-11-30',
      CLASSI: '5A',
      MATERIE: '*'
    });
    expect(() => r.getTitolare(s)).toThrow(EntityNotFoundError);
  });

  test('creaSupplenza stores "" for titolare/supplente when the Docente has no id', () => {
    const { r, db } = repoAndDb();
    const ghost = Docente.fromData({});
    r.creaSupplenza(ghost, ghost, new Date('2026-01-01'), new Date('2026-01-10'), '9Z', 'FISI');
    const rows = db.tables[TABLE.SUPPLENZE].getAllRows();
    const row = rows.find((row) => row['CLASSI'] === '9Z')!;
    expect(row['TITOLARE']).toBe('');
    expect(row['SUPPLENTE']).toBe('');
  });

  test('creaSupplenza stores an empty AL for an open-ended (al=null) supplenza', () => {
    const { r, db } = repoAndDb();
    const nuovo = Docente.fromData({ EMAIL: 'nuovo@school.it' });
    r.creaSupplenza(nuovo, rossi, new Date('2026-01-01'), null, '9Z', 'FISI');
    const rows = db.tables[TABLE.SUPPLENZE].getAllRows();
    const row = rows.find((row) => row['TITOLARE'] === 'nuovo@school.it')!;
    expect(row['AL']).toBe('');
  });

  test('creaSupplenza throws with the "?" id fallback in the message when the titolare has no id', () => {
    const db = new FakeDatabase({
      ...fixtureTables(),
      SUPPLENZE: [
        ...(fixtureTables().SUPPLENZE ?? []),
        {
          TITOLARE: null,
          SUPPLENTE: 'bianchi@school.it',
          DAL: '2026-02-01',
          AL: '2026-02-10',
          CLASSI: '9Z',
          MATERIE: 'FISI'
        }
      ]
    });
    const r = new SupplenzaRepository(db);
    const ghost = Docente.fromData({}); // id null → findByTitolare matches the seeded TITOLARE:null row
    const supplente = Docente.fromData({ EMAIL: 'bianchi@school.it' });
    expect(() =>
      r.creaSupplenza(
        ghost,
        supplente,
        new Date('2026-02-03'),
        new Date('2026-02-05'),
        '9Z',
        'FISI'
      )
    ).toThrow(ValidationError);
  });
});
