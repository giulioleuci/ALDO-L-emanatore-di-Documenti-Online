import { DipartimentoRepository } from '../../../src/infrastructure/repositories/DipartimentoRepository';
import { Dipartimento } from '../../../src/domain/entities/Dipartimento';
import { Materia } from '../../../src/domain/entities/Materia';
import { MateriePerDipartimentoSpec } from '../../../src/domain/specifications/MateriePerDipartimentoSpec';
import { FakeDatabase } from '../../../test/fakes/FakeDatabase';
import { fixtureTables } from '../../../test/fixtures/tables';

function repo(): DipartimentoRepository {
  return new DipartimentoRepository(new FakeDatabase(fixtureTables()));
}

test('Dipartimento parses CAPO email and MATERIE CSV', () => {
  const d = Dipartimento.fromData({
    ID: 'SCIENTIFICO_DIP',
    NOME: 'Dip. scientifico',
    CAPO: 'rossi@school.it',
    MATERIE: 'MATE,FISI'
  });
  expect(d.dipartimentoId.value).toBe('SCIENTIFICO_DIP');
  expect(d.getCapoEmail()?.value).toBe('rossi@school.it');
  expect(d.getMaterieIds().map((m) => m.value)).toEqual(['MATE', 'FISI']);
});

test('empty CAPO yields null email', () => {
  expect(
    Dipartimento.fromData({ ID: 'LETTERE', CAPO: '', MATERIE: 'ITA' }).getCapoEmail()
  ).toBeNull();
});

test('MateriePerDipartimentoSpec filters materie of a department (07 §4)', () => {
  const dip = Dipartimento.fromData({ ID: 'SCIENTIFICO_DIP', MATERIE: 'MATE,FISI' });
  const spec = new MateriePerDipartimentoSpec(dip);
  expect(spec.isSatisfiedBy(Materia.fromData({ ID: 'MATE' }))).toBe(true);
  expect(spec.isSatisfiedBy(Materia.fromData({ ID: 'ITA' }))).toBe(false);
  expect(spec.toQueryObject()).toBeNull();
});

test('findAll returns every DIPART row as a Dipartimento', () => {
  const r = repo();
  const all = r.findAll();
  expect(all.map((d) => d.id)).toEqual(['SCIENTIFICO_DIP', 'LETTERE']);
});
