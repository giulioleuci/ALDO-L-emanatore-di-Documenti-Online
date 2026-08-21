import { ClasseRepository } from '../../../src/infrastructure/repositories/ClasseRepository';
import { FakeDatabase } from '../../../test/fakes/FakeDatabase';
import { fixtureTables } from '../../../test/fixtures/tables';
import { ClasseId } from '../../../src/domain/value-objects/ClasseId';
import { MateriaId } from '../../../src/domain/value-objects/MateriaId';
import { IndirizzoId } from '../../../src/domain/value-objects/IndirizzoId';
import { MateriaNotFoundError } from '../../../src/domain/errors/DomainError';

function repo(): ClasseRepository {
  return new ClasseRepository(new FakeDatabase(fixtureTables()));
}
function classe(id: string) {
  return repo().findById(ClasseId.of(id))!;
}

test('finders: attive / anno / indirizzo / articolate (06 §3)', () => {
  const r = repo();
  expect(r.findAttive().map((c) => c.id)).toEqual(['5A', '1F', '1F-LSO', '1F-LSS']);
  expect(r.findByAnno(3).map((c) => c.id)).toEqual(['3B']);
  expect(r.findByIndirizzo(IndirizzoId.of('ITI')).map((c) => c.id)).toEqual(['3B']);
  expect(r.findArticolate().map((c) => c.id)).toEqual(['1F', '1F-LSO', '1F-LSS']);
});

test('cattedra matrix: getDocentiPerMateria + unknown materia throws', () => {
  const r = repo();
  const c5a = classe('5A');
  expect(r.getDocentiPerMateria(c5a, MateriaId.of('MATE')).map((d) => d.id)).toEqual([
    'rossi@school.it'
  ]);
  expect(r.getDocentiPerMateria(c5a, MateriaId.of('FISI')).map((d) => d.id)).toEqual([
    'bianchi@school.it'
  ]);
  expect(() => r.getDocentiPerMateria(c5a, MateriaId.of('NOPE'))).toThrow(MateriaNotFoundError);
});

test('ignora una colonna specifica non registrata quando è vuota', () => {
  const r = new ClasseRepository(
    new FakeDatabase({
      MATERIE: [{ ID: 'INTERPRET.CHITARRA' }],
      CLASSI: [
        {
          ID: '4A',
          ANNO: 4,
          INDIRIZZO: 'SCIENTIFICO',
          'INTERPRET.CHITARRA': 'doc5@x.it',
          'INTERPRET.FLAUTO': ''
        }
      ]
    })
  );

  const slots = r.getTeachingSlots(r.findById('4A')!);

  expect(slots.map((slot) => slot.column)).toEqual(['INTERPRET.CHITARRA']);
});

test('continua a rifiutare una colonna specifica non registrata ma popolata', () => {
  const r = new ClasseRepository(
    new FakeDatabase({
      MATERIE: [{ ID: 'INTERPRET.CHITARRA' }],
      CLASSI: [
        {
          ID: '4A',
          ANNO: 4,
          INDIRIZZO: 'SCIENTIFICO',
          'INTERPRET.CHITARRA': 'doc5@x.it',
          'INTERPRET.FLAUTO': 'doc6@x.it'
        }
      ]
    })
  );

  expect(() => r.getTeachingSlots(r.findById('4A')!)).toThrow(
    /Specifica INTERPRET\.FLAUTO non registrata in MATERIE/
  );
});

test('getAllDocentiCDC dedupes and sorts by surname', () => {
  expect(
    repo()
      .getAllDocentiCDC(classe('5A'))
      .map((d) => d.cognome)
  ).toEqual(['BIANCHI', 'ROSSI']);
});

test('IRC / coordinatori / ruoli (single + multi holder)', () => {
  const r = repo();
  const c5a = classe('5A');
  expect(r.getDocentiIRC(c5a).map((d) => d.id)).toEqual(['bianchi@school.it']);
  expect(r.getDocentiALT(c5a)).toEqual([]);
  expect(r.getCoordinatori(c5a).map((d) => d.id)).toEqual(['rossi@school.it']);
  expect(r.getRuolo(c5a, 'SEGRETARIO')!.id).toBe('rossi@school.it');
  expect(
    r
      .getDocentiRuolo(c5a, 'TUTOR_ASL')
      .map((d) => d.id)
      .sort()
  ).toEqual(['bianchi@school.it', 'rossi@school.it']);
  expect(r.getDocentiRuolo(c5a, 'ASSENTE')).toEqual([]);
});

test('storico / indirizzo / studenti', () => {
  const r = repo();
  const c5a = classe('5A');
  expect(r.getStorico(c5a).map((c) => c.value)).toEqual(['4A', '3A']);
  expect(r.getIndirizzo(c5a).id).toBe('SCIENTIFICO');
  expect(r.getStudenti(c5a).map((a) => a.id)).toEqual([
    'a3@school.it',
    'a2@school.it',
    'a1@school.it'
  ]);
  expect(r.getStudenti(c5a, true).map((a) => a.id)).toEqual(['a1@school.it']);
});
