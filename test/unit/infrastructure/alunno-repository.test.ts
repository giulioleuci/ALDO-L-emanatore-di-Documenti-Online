import { AlunnoRepository } from '../../../src/infrastructure/repositories/AlunnoRepository';
import { Alunno } from '../../../src/domain/entities/Alunno';
import {
  AlunniInClasseSpec, AlunniRipetentiSpec, AlunniRappresentantiSpec, AlunniPerReligioneSpec
} from '../../../src/domain/specifications/AlunnoSpecs';
import { FakeDatabase } from '../../../test/fakes/FakeDatabase';
import { fixtureTables } from '../../../test/fixtures/tables';
import { ClasseId } from '../../../src/domain/value-objects/ClasseId';
import { ReligioneScelta } from '../../../src/domain/value-objects/enums';

function repo(): AlunnoRepository {
  return new AlunnoRepository(new FakeDatabase(fixtureTables()));
}

test('Alunno exposes tutors, curriculum, flags', () => {
  const a = repo().findById('a1@school.it')!;
  expect(a.email.value).toBe('a1@school.it');
  expect(a.classeId.value).toBe('5A');
  expect(a.isAttivo()).toBe(true);
  expect(a.isRappresentante()).toBe(true);
  expect(a.getTutors().map((e) => e.value)).toEqual(['genitore1@x.it']);
  expect([...a.getCurriculum().entries()].map(([m, s]) => [m.value, s])).toEqual([['INTERP', ['CHITARRA', 'PIANO']]]);
});

test('getTutors handles two tutors and none', () => {
  expect(repo().findById('a2@school.it')!.getTutors().map((e) => e.value)).toEqual(['genitore2@x.it', 'genitore3@x.it']);
  expect(repo().findById('a3@school.it')!.getTutors()).toEqual([]);
});

test('findByClasse sorts by COGNOMENOME', () => {
  expect(repo().findByClasse(ClasseId.of('5A')).map((a) => a.id)).toEqual(['a3@school.it', 'a2@school.it', 'a1@school.it']);
});

test('findAttivi / findAttiviInClasse filter inactive', () => {
  expect(repo().findAttivi().map((a) => a.id)).toEqual(['a1@school.it']);
  expect(repo().findAttiviInClasse(ClasseId.of('5A')).map((a) => a.id)).toEqual(['a1@school.it']);
});

test('Alunno specs (07 §1): isSatisfiedBy + toQueryObject', () => {
  const a1 = Alunno.fromData({ EMAIL: 'a1', CLASSE: '5A', RAPPR_STUD: true, RELIGIONE: 'SI' });
  const a2 = Alunno.fromData({ EMAIL: 'a2', CLASSE: '5A', RIPETENTE: true, RELIGIONE: 'NO' });
  expect(new AlunniInClasseSpec(ClasseId.of('5A')).isSatisfiedBy(a1)).toBe(true);
  expect(new AlunniInClasseSpec(ClasseId.of('3B')).isSatisfiedBy(a1)).toBe(false);
  expect(new AlunniRipetentiSpec().isSatisfiedBy(a2)).toBe(true);
  expect(new AlunniRipetentiSpec().isSatisfiedBy(a1)).toBe(false);
  expect(new AlunniRappresentantiSpec().isSatisfiedBy(a1)).toBe(true);
  expect(new AlunniPerReligioneSpec(ReligioneScelta.ALT).toQueryObject()).toEqual({ RELIGIONE: 'ALT' });
});
