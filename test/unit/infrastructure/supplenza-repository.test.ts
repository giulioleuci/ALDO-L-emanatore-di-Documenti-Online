import { SupplenzaRepository } from '../../../src/infrastructure/repositories/SupplenzaRepository';
import { Supplenza } from '../../../src/domain/entities/Supplenza';
import { Docente } from '../../../src/domain/entities/Docente';
import { FakeDatabase } from '../../../test/fakes/FakeDatabase';
import { fixtureTables } from '../../../test/fixtures/tables';
import { ClasseId } from '../../../src/domain/value-objects/ClasseId';
import { MateriaId } from '../../../src/domain/value-objects/MateriaId';

function repo(): SupplenzaRepository {
  return new SupplenzaRepository(new FakeDatabase(fixtureTables()));
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
