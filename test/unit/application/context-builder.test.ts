import { ContextBuilder } from '../../../src/application/context/ContextBuilder';
import { ClasseRepository } from '../../../src/infrastructure/repositories/ClasseRepository';
import { FakeDatabase } from '../../../test/fakes/FakeDatabase';
import { fixtureTables } from '../../../test/fixtures/tables';
import { ClasseId } from '../../../src/domain/value-objects/ClasseId';

function builder(): ContextBuilder {
  const repo = new ClasseRepository(new FakeDatabase(fixtureTables()));
  return new ContextBuilder(repo, new Date('2026-07-01T09:00:00Z'));
}

test('CDU focus.classe.anagrafica matches 02 paths', () => {
  const cdu = builder().build(ClasseId.of('5A'));
  expect(cdu.focus.classe.anagrafica.nome).toBe('5A');
  expect(cdu.focus.classe.anagrafica.anno).toBe(5);
});

test('CDU meta.date.oggi.breve is DD/MM/YYYY (02)', () => {
  const cdu = builder().build(ClasseId.of('5A'));
  expect(cdu.meta.date.oggi.breve).toBe('01/07/2026');
  expect(cdu.meta.parametriInput.target).toBe('5A');
});

test('CDU exposes live CdC under tech', () => {
  const cdu = builder().build(ClasseId.of('5A'));
  expect(cdu.tech.consiglioDiClasse.materie().map((m) => m.value).sort()).toEqual(['FISI', 'MATE']);
});
