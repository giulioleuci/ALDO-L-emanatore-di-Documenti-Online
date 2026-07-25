import { ContextBuilder } from '../../../../src/application/context-engine/ContextBuilder';
import { ClasseProvider } from '../../../../src/application/context-engine/providers/ClasseProvider';
import { ConsiglioClasseProvider } from '../../../../src/application/context-engine/providers/ConsiglioClasseProvider';
import { makeOptions } from '../../../../src/application/context-engine/Recipe';
import type { BuildParams, Recipe } from '../../../../src/application/context-engine/Recipe';
import type { DocenteCdcVM } from '../../../../src/application/context-engine/Cdu';
import { ClasseRepository } from '../../../../src/infrastructure/repositories/ClasseRepository';
import { MateriaRepository } from '../../../../src/infrastructure/repositories/MateriaRepository';
import { CattedraResolver } from '../../../../src/application/services/CattedraResolver';
import { FakeDatabase } from '../../../fakes/FakeDatabase';
import { fixtureTables } from '../../../fixtures/tables';

function cdc(target: string): DocenteCdcVM[] {
  const db = new FakeDatabase(fixtureTables());
  const classi = new ClasseRepository(db);
  const b = new ContextBuilder();
  b.registerProvider('class', new ClasseProvider(classi));
  b.registerProvider(
    'consiglio',
    new ConsiglioClasseProvider(classi, new MateriaRepository(db), new CattedraResolver(db))
  );
  const params: BuildParams = {
    target,
    tipoTarget: 'classe',
    now: new Date('2026-07-01T09:00:00Z')
  };
  const recipe: Recipe = { providers: ['class', 'consiglio'], options: makeOptions() };
  return b.build(params, recipe).focus.classe!.consiglioDiClasse!;
}
const byEmail = (list: DocenteCdcVM[], email: string) =>
  list.find((d) => d.anagrafica.email === email)!;

test('CDC of a standard class: one VM per subject teacher, sorted by surname (02 §4.1)', () => {
  const list = cdc('5A');
  expect(list.map((d) => d.anagrafica.email)).toEqual(['bianchi@school.it', 'rossi@school.it']);
  expect(list[list.length - 1]!.flags.isNotLast).toBe(false);
  expect(list[0]!.flags.isNotLast).toBe(true);
});

test('CDC coordinatore VM: materie, roles and descrizione', () => {
  const rossi = byEmail(cdc('5A'), 'rossi@school.it');
  expect(rossi.anagrafica).toEqual({
    nome: 'MARIO',
    cognome: 'ROSSI',
    email: 'rossi@school.it',
    genere: 'M',
    appellativo: 'Prof.'
  });
  expect(rossi.materie).toEqual([
    { sigla: 'MATE', nome: 'Matematica', colore: '', specificita: null }
  ]);
  expect(rossi.ruoli).toEqual({
    isCoordinatore: true,
    isTutorAsl: true,
    isTutorOrientamento: false,
    descrizione: ['Coordinatore', 'Tutor ASL', 'Docente']
  });
  expect(rossi.stato).toEqual({ isSupplente: false, sostituisce: null });
  expect(rossi.tipoArticolazione).toBeNull();
  expect(rossi.isITP).toBe(false);
});

test('CDC of an articulated parent: tipoArticolazione by partner membership (09 §9)', () => {
  const list = cdc('1F');
  expect(list.map((d) => d.anagrafica.email)).toEqual([
    'bianchi@school.it',
    'rossi@school.it',
    'verdi@school.it'
  ]);
  expect(byEmail(list, 'rossi@school.it').tipoArticolazione).toBe('COMUNE'); // MATE in both partners
  expect(byEmail(list, 'bianchi@school.it').tipoArticolazione).toBe('SEPARATO_PRIMO'); // FISI in 1F-LSO only
  expect(byEmail(list, 'verdi@school.it').tipoArticolazione).toBe('SEPARATO_SECONDO'); // FISI in 1F-LSS only
});
