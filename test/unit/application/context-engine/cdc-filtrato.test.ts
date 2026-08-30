import { composeContextBuilder } from '../../../../src/config/ApplicationComposition';
import { recipe } from '../../../../src/application/context-engine/Recipe';
import type { DocenteCdcVM } from '../../../../src/application/context-engine/Cdu';
import { FakeDatabase } from '../../../fakes/FakeDatabase';
import { fixtureTables, teachingSlotFixtureTables } from '../../../fixtures/tables';
import type { Row } from '../../../../src/infrastructure/db/Database';
import { MasterSheetRepository } from '../../../../src/infrastructure/repositories/MasterSheetRepository';
import { AldoTeachingAssignmentResolver } from '../../../../src/infrastructure/role-resolution/AldoTeachingAssignmentResolver';
import {
  materieDistinteConsiglioFiltrato,
  studentCouncilFilterOperations
} from '../../../../src/application/context-engine/TeachingCouncilProjection';

// IRC teacher distinct from any subject teacher of 5A, so religion filtering is observable.
function tablesWithIrc(): Record<string, Row[]> {
  const t = fixtureTables();
  const cinqueA = (t['CLASSI'] as Row[]).find((r) => r['ID'] === '5A')!;
  cinqueA['IRC'] = 'verdi@school.it';
  return t;
}

function filtrato(target: string): DocenteCdcVM[] {
  const cdu = composeContextBuilder(new FakeDatabase(tablesWithIrc())).build(
    { target, tipoTarget: 'alunno', now: new Date('2026-07-01T09:00:00Z') },
    recipe('ALUNNO_COMPLETO')
  );
  return cdu.focus.alunno!.consiglio!.elenco;
}

test('Task 6 declares religion and curriculum decisions directly as projection expressions', () => {
  expect(studentCouncilFilterOperations).toEqual([
    {
      type: 'filter',
      expression:
        '(slot.materia != "IRC" && slot.materia != "ALT") || (slot.materia == "IRC" && studentReligion == "IRC") || (slot.materia == "ALT" && studentReligion == "ALT")'
    },
    {
      type: 'filter',
      expression:
        'slot.hasSpecificity == false || slot.specifica match studentSpecificityPattern'
    }
  ]);
});

// 5A: MATE's effective holder is bianchi (VARIAZIONI_CATTEDRA, decorsa since
// 2025-10-01, `now` here is 2026-07-01); FISI's nominal holder is also
// bianchi -> rossi holds no subject in 5A and drops out of every filtered list below.
test('CDCFilterAlunno: religione SI includes the IRC teacher (14 §1.3)', () => {
  expect(filtrato('a1@school.it').map((d) => d.email)).toEqual([
    'bianchi@school.it',
    'verdi@school.it'
  ]);
});

test('CDCFilterAlunno: religione NO excludes the IRC teacher (14 §1.3)', () => {
  // a2 chose NO → the IRC-only teacher (verdi) is dropped; the effective subject
  // teacher (bianchi) remains.
  expect(filtrato('a2@school.it').map((d) => d.email)).toEqual(['bianchi@school.it']);
});

test('CDCFilterAlunno: religione ALT excludes IRC (no ALT teacher configured)', () => {
  expect(filtrato('a3@school.it').map((d) => d.email)).toEqual(['bianchi@school.it']);
});

test('Task 6 filters arbitrary specificities into their accepted composite catalog rows', () => {
  const tables = teachingSlotFixtureTables();
  const alunno = tables.ALUNNI!.find((row) => row.EMAIL === 'a1@school.it')!;
  alunno.CURRICULUM = JSON.stringify({
    LAB: ['GRUPPO_A'],
    INTERPRET: ['CHITARRA']
  });
  const db = new FakeDatabase(tables);
  const teachingAssignments = new AldoTeachingAssignmentResolver(db);
  const resolveConsiglio = jest.spyOn(teachingAssignments, 'resolveConsiglio');
  const cdu = composeContextBuilder(
    db,
    new MasterSheetRepository(db),
    teachingAssignments
  ).build(
    {
      target: 'a1@school.it',
      tipoTarget: 'alunno',
      now: new Date('2026-02-15')
    },
    recipe('ALUNNO_COMPLETO')
  );
  const consiglio = cdu.focus.alunno!.consiglio!.elenco;

  expect(resolveConsiglio).toHaveBeenCalledWith(
    expect.objectContaining({ id: '5A' }),
    new Date('2026-02-15'),
    expect.objectContaining({ includeReligioneAlt: true })
  );
  expect(consiglio.map((row) => row.email)).toEqual(
    expect.arrayContaining([
      'main@school.test',
      'itp@school.test',
      'specific-a@school.test',
      'guitar@school.test',
      'irc@school.test'
    ])
  );
  expect(consiglio.map((row) => row.email)).not.toContain('specific-b@school.test');
  expect(
    consiglio
      .flatMap((row) => row.materie)
      .map((materia) => [materia.sigla, materia.specificita])
  ).toEqual(
    expect.arrayContaining([
      ['LAB.GRUPPO_A', null],
      ['INTERPRET.CHITARRA', null]
    ])
  );

  expect(materieDistinteConsiglioFiltrato(consiglio)).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ sigla: 'LAB.GRUPPO_A' }),
      expect.objectContaining({ sigla: 'INTERPRET.CHITARRA' })
    ])
  );
});

describe('materieDistinteConsiglioFiltrato', () => {
  function docente(materie: Array<{ sigla: string; nome: string }>): DocenteCdcVM {
    return { materie } as unknown as DocenteCdcVM;
  }

  test('dedupes materie shared by multiple docenti and sorts by sigla', () => {
    const result = materieDistinteConsiglioFiltrato([
      docente([{ sigla: 'MAT', nome: 'Matematica' }]),
      docente([
        { sigla: 'ITA', nome: 'Italiano' },
        { sigla: 'MAT', nome: 'Matematica' }
      ])
    ]);
    expect(result.map((m) => m.sigla)).toEqual(['ITA', 'MAT']);
    expect(result[0]).toEqual({ sigla: 'ITA', nome: 'Italiano' });
  });

  test('returns an empty array when the filtered CdC is empty', () => {
    expect(materieDistinteConsiglioFiltrato([])).toEqual([]);
  });
});
