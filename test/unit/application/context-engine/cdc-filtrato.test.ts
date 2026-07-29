import { ContextEngineFactory } from '../../../../src/application/context-engine/ContextEngineFactory';
import { recipe } from '../../../../src/application/context-engine/Recipe';
import type { DocenteCdcVM } from '../../../../src/application/context-engine/Cdu';
import { FakeDatabase } from '../../../fakes/FakeDatabase';
import { fixtureTables, teachingSlotFixtureTables } from '../../../fixtures/tables';
import type { Row } from '../../../../src/infrastructure/db/Database';
import { MasterSheetRepository } from '../../../../src/infrastructure/repositories/MasterSheetRepository';
import { AldoTeachingAssignmentResolver } from '../../../../src/infrastructure/role-resolution/AldoTeachingAssignmentResolver';

// IRC teacher distinct from any subject teacher of 5A, so religion filtering is observable.
function tablesWithIrc(): Record<string, Row[]> {
  const t = fixtureTables();
  const cinqueA = (t['CLASSI'] as Row[]).find((r) => r['ID'] === '5A')!;
  cinqueA['IRC'] = 'verdi@school.it';
  return t;
}

function filtrato(target: string): DocenteCdcVM[] {
  const cdu = ContextEngineFactory.create(new FakeDatabase(tablesWithIrc())).build(
    { target, tipoTarget: 'alunno', now: new Date('2026-07-01T09:00:00Z') },
    recipe('ALUNNO_COMPLETO')
  );
  return cdu.focus.alunno!.consiglioDiClasseFiltrato!;
}

// 5A: MATE's effective holder is bianchi (VARIAZIONI_CATTEDRA, decorsa since
// 2025-10-01, `now` here is 2026-07-01); FISI's nominal holder is also
// bianchi -> rossi holds no subject in 5A and drops out of every filtered list below.
test('CDCFilterAlunno: religione SI includes the IRC teacher (14 §1.3)', () => {
  expect(filtrato('a1@school.it').map((d) => d.anagrafica.email)).toEqual([
    'bianchi@school.it',
    'verdi@school.it'
  ]);
});

test('CDCFilterAlunno: religione NO excludes the IRC teacher (14 §1.3)', () => {
  // a2 chose NO → the IRC-only teacher (verdi) is dropped; the effective subject
  // teacher (bianchi) remains.
  expect(filtrato('a2@school.it').map((d) => d.anagrafica.email)).toEqual(['bianchi@school.it']);
});

test('CDCFilterAlunno: religione ALT excludes IRC (no ALT teacher configured)', () => {
  expect(filtrato('a3@school.it').map((d) => d.anagrafica.email)).toEqual(['bianchi@school.it']);
});

test('wired GLF resolver preserves specificity and filters it by student curriculum', () => {
  const tables = teachingSlotFixtureTables();
  const alunno = tables.ALUNNI!.find((row) => row.EMAIL === 'a1@school.it')!;
  alunno.CURRICULUM = JSON.stringify({
    LAB: ['GRUPPO_A'],
    INTERPRET: ['CHITARRA']
  });
  const db = new FakeDatabase(tables);
  const cdu = ContextEngineFactory.create(
    db,
    new MasterSheetRepository(db),
    new AldoTeachingAssignmentResolver(db)
  ).build(
    {
      target: 'a1@school.it',
      tipoTarget: 'alunno',
      now: new Date('2026-02-15')
    },
    recipe('ALUNNO_COMPLETO')
  );
  const consiglio = cdu.focus.alunno!.consiglioDiClasseFiltrato!;

  const gruppoA = consiglio.find(
    (row) => row.anagrafica.email === 'specific-a@school.test'
  )!;
  expect(gruppoA.materie).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        sigla: 'LAB',
        specificita: 'GRUPPO_A'
      })
    ])
  );
  const chitarra = consiglio.find(
    (row) => row.anagrafica.email === 'guitar@school.test'
  )!;
  expect(chitarra.materie).toEqual([
    expect.objectContaining({
      sigla: 'INTERPRET',
      specificita: 'CHITARRA'
    })
  ]);
  expect(
    consiglio.some((row) => row.anagrafica.email === 'specific-b@school.test')
  ).toBe(false);
});
