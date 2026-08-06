import { ContextBuilder } from '../../../../src/application/context-engine/ContextBuilder';
import { SchoolProvider } from '../../../../src/application/context-engine/providers/SchoolProvider';
import { ClasseProvider } from '../../../../src/application/context-engine/providers/ClasseProvider';
import { AlunnoProvider } from '../../../../src/application/context-engine/providers/AlunnoProvider';
import { CarenzeProvider } from '../../../../src/application/context-engine/providers/CarenzeProvider';
import { PianiProvider } from '../../../../src/application/context-engine/providers/PianiProvider';
import { makeOptions } from '../../../../src/application/context-engine/Recipe';
import type { BuildParams, Recipe } from '../../../../src/application/context-engine/Recipe';
import type { Cdu } from '../../../../src/application/context-engine/Cdu';
import { MasterSheetRepository } from '../../../../src/infrastructure/repositories/MasterSheetRepository';
import { RuoloSpecialeRepository } from '../../../../src/infrastructure/repositories/RuoloSpecialeRepository';
import { DocenteRepository } from '../../../../src/infrastructure/repositories/DocenteRepository';
import { ClasseRepository } from '../../../../src/infrastructure/repositories/ClasseRepository';
import { AlunnoRepository } from '../../../../src/infrastructure/repositories/AlunnoRepository';
import { MateriaRepository } from '../../../../src/infrastructure/repositories/MateriaRepository';
import { OreASLRepository } from '../../../../src/infrastructure/repositories/OreASLRepository';
import { FakeDatabase } from '../../../fakes/FakeDatabase';
import { fixtureTables } from '../../../fixtures/tables';
import type { Row } from '../../../../src/infrastructure/db/Database';

function build(target: string, tables = fixtureTables()): Cdu {
  const db = new FakeDatabase(tables);
  const classi = new ClasseRepository(db);
  const alunni = new AlunnoRepository(db);
  const materie = new MateriaRepository(db);
  const oreAsl = new OreASLRepository(db);
  const b = new ContextBuilder();
  b.registerProvider(
    'school',
    new SchoolProvider(
      new MasterSheetRepository(db),
      new RuoloSpecialeRepository(db),
      new DocenteRepository(db)
    )
  );
  b.registerProvider('class', new ClasseProvider(classi, alunni));
  b.registerProvider('student', new AlunnoProvider(alunni, classi, oreAsl, materie));
  b.registerProvider('carenze', new CarenzeProvider(alunni, materie));
  b.registerProvider('piani', new PianiProvider(alunni));
  const params: BuildParams = {
    target,
    tipoTarget: 'alunno',
    now: new Date('2026-07-01T09:00:00Z')
  };
  const recipe: Recipe = {
    providers: ['school', 'class', 'student', 'carenze', 'piani'],
    options: makeOptions()
  };
  return b.build(params, recipe);
}

test('AlunnoProvider: anagrafica/status/curriculum/classe + ASL hours (02 §4.2)', () => {
  const a = build('a1@school.it').focus.alunno!;
  expect(a.anagrafica).toEqual({ nomeCompleto: 'VERDI ANNA', email: 'a1@school.it' });
  expect(a.status).toEqual({
    religione: 'IRC',
    isBes: true,
    isRipetente: false,
    isRappresentante: true
  });
  expect(a.curriculum).toEqual([
    {
      materiaId: 'INTERP',
      materiaSigla: 'INTERP',
      materiaNome: 'INTERP',
      specifiche: [{ nome: 'CHITARRA' }, { nome: 'PIANO' }]
    }
  ]);
  expect(a.classe).toEqual({
    nome: '5A',
    indirizzoSigla: 'SCIENTIFICO',
    indirizzoNome: 'Liceo scientifico'
  });
  expect(a.didattica.asl).toEqual({ oreCumulate: 100, oreAnnoCorrente: 60 });
});

test('AlunnoProvider: empty-string CURRICULUM cell (not null) does not crash JSON.parse (regression)', () => {
  const tables = fixtureTables();
  (tables['ALUNNI'] as Row[]).find((r) => r['EMAIL'] === 'a3@school.it')!['CURRICULUM'] = '';
  const a = build('a3@school.it', tables).focus.alunno!;
  expect(a.curriculum).toEqual([]);
});

test('CarenzeProvider: dettaglio flattened from CARENZE (02 §4.2)', () => {
  const c = build('a1@school.it').focus.alunno!.didattica.carenze;
  expect(c).toEqual({
    numero: 3,
    hasCarenze: true,
    dettaglio: [
      { materia: 'MATE', voto: '5' },
      { materia: 'MATE', voto: '4.5' },
      { materia: 'FISI', voto: 'Studio scarso' }
    ]
  });
});

test('PianiProvider: items + isBes update of the status placeholder (09 §4 note)', () => {
  const a = build('a1@school.it').focus.alunno!;
  expect(a.didattica.piani).toEqual({
    hasPiani: true,
    hasBes: true,
    items: [{ tipo: 'PEI', isBes: true, link: '', parametriGenerazione: { gravita: 'media' } }]
  });
  expect(a.status.isBes).toBe(true);
});

test('a non-BES student (PFP): isBes stays false, class resolved for alunno target', () => {
  const a = build('a3@school.it').focus.alunno!;
  expect(a.status.isBes).toBe(false);
  expect(a.didattica.piani.items).toEqual([
    { tipo: 'PFP', isBes: false, link: '', parametriGenerazione: {} }
  ]);
  expect(a.classe.nome).toBe('5A');
});
