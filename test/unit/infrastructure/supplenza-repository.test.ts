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
  const s = Supplenza.fromData({ TITOLARE: 'rossi@school.it', SUPPLENTE: 'bianchi@school.it', DAL: '2025-11-01', AL: '2025-11-30', CLASSI: '5A,4B', MATERIE: '*' });
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
  expect(r.findAttive(new Date('2025-11-15')).map((s) => s.titolare).sort())
    .toEqual(['bianchi@school.it', 'rossi@school.it']);
});

test('findSupplenzaSpecifica follows the replacement chain to the final substitute (06 §14)', () => {
  const r = repo();
  // rossi→bianchi→verdi active on 15/11 for 5A/ITA: effective substitute is verdi.
  expect(r.findSupplenzaSpecifica(rossi, new Date('2025-11-15'), ClasseId.of('5A'), MateriaId.of('ITA'))!.supplente)
    .toBe('verdi@school.it');
  // on 25/11 the second link has ended: chain stops at bianchi.
  expect(r.findSupplenzaSpecifica(rossi, new Date('2025-11-25'), ClasseId.of('5A'), MateriaId.of('ITA'))!.supplente)
    .toBe('bianchi@school.it');
  // no active supplenza for rossi in July.
  expect(r.findSupplenzaSpecifica(rossi, new Date('2025-07-01'))).toBeNull();
});

test('getTitolare / getSupplente resolve Docente entities', () => {
  const r = repo();
  const s = r.findByTitolare(rossi)[0]!;
  expect(r.getTitolare(s).id).toBe('rossi@school.it');
  expect(r.getSupplente(s).id).toBe('bianchi@school.it');
});

// --- A19: indexed-lookup fallback, overlap-conflict, and delegation-chain branches ---

describe('SupplenzaRepository — indexed-lookup fallback and overlap/chain branches', () => {
  test('findByTitolare falls back to a full scan when indexedLookup returns null', () => {
    const { r, db } = repoAndDb();
    jest.spyOn(db.tables[TABLE.SUPPLENZE], 'indexedLookup').mockReturnValue(null);
    expect(r.findByTitolare(rossi).map((s) => s.supplente)).toEqual(['bianchi@school.it']);
  });

  test('findBySupplente falls back to a full scan when indexedLookup returns null', () => {
    const { r, db } = repoAndDb();
    jest.spyOn(db.tables[TABLE.SUPPLENZE], 'indexedLookup').mockReturnValue(null);
    expect(r.findBySupplente(rossi).map((s) => s.titolare)).toEqual(['verdi@school.it']);
  });

  test('findSupplenzaSpecifica returns null immediately when titolare.id is blank', () => {
    const repository = repo();
    expect(repository.findSupplenzaSpecifica(Docente.fromData({ EMAIL: '' }), new Date())).toBeNull();
  });

  test('creaSupplenza throws ValidationError when an overlapping supplenza exists for the same titolare+context', () => {
    const r = repo();
    const verdiD = Docente.fromData({ EMAIL: 'verdi@school.it' });
    // rossi already has 5A,4B/* active 2025-11-01..2025-11-30 (fixture); this overlaps on 5A/*.
    expect(() =>
      r.creaSupplenza(rossi, verdiD, new Date('2025-11-10'), new Date('2025-11-20'), '5A', '*')
    ).toThrow(ValidationError);
  });

  test('the delegation chain resolves to null when the titolare has no outgoing delegation on that date', () => {
    const r = repo();
    const verdi = Docente.fromData({ EMAIL: 'verdi@school.it' });
    // Other supplenze (rossi→bianchi, bianchi→verdi) are active on 15/11, so `applicabili`
    // is non-empty, but verdi's own verdi→rossi row is only active in September — no chain
    // starts at verdi on this date, so getDelegationChain returns length 0.
    expect(r.findSupplenzaSpecifica(verdi, new Date('2025-11-15'))).toBeNull();
  });

  test('requireDocente throws EntityNotFoundError for an unknown email', () => {
    const r = repo();
    const s = Supplenza.fromData({
      TITOLARE: 'ghost@school.it', SUPPLENTE: 'bianchi@school.it',
      DAL: '2025-11-01', AL: '2025-11-30', CLASSI: '5A', MATERIE: '*'
    });
    expect(() => r.getTitolare(s)).toThrow(EntityNotFoundError);
  });

  test('findSupplenzaSpecifica keeps only the first-seen supplenza when two applicable rows share the same titolare→supplente arc', () => {
    const db = new FakeDatabase({
      ...fixtureTables(),
      SUPPLENZE: [
        ...fixtureTables().SUPPLENZE,
        // Same arc (rossi→bianchi) as the fixture row, also active on 15/11.
        { TITOLARE: 'rossi@school.it', SUPPLENTE: 'bianchi@school.it', DAL: '2025-11-05', AL: '2025-11-25', CLASSI: '5A', MATERIE: '*' }
      ]
    });
    const r = new SupplenzaRepository(db);
    expect(r.findSupplenzaSpecifica(rossi, new Date('2025-11-15'), ClasseId.of('5A'), MateriaId.of('ITA'))!.supplente)
      .toBe('verdi@school.it');
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
        ...fixtureTables().SUPPLENZE,
        { TITOLARE: null, SUPPLENTE: 'bianchi@school.it', DAL: '2026-02-01', AL: '2026-02-10', CLASSI: '9Z', MATERIE: 'FISI' }
      ]
    });
    const r = new SupplenzaRepository(db);
    const ghost = Docente.fromData({}); // id null → findByTitolare matches the seeded TITOLARE:null row
    const supplente = Docente.fromData({ EMAIL: 'bianchi@school.it' });
    expect(() =>
      r.creaSupplenza(ghost, supplente, new Date('2026-02-03'), new Date('2026-02-05'), '9Z', 'FISI')
    ).toThrow(ValidationError);
  });
});
