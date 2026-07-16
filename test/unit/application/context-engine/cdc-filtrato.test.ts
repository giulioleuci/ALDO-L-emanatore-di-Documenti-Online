import { ContextEngineFactory } from '../../../../src/application/context-engine/ContextEngineFactory';
import { recipe } from '../../../../src/application/context-engine/Recipe';
import type { DocenteCdcVM } from '../../../../src/application/context-engine/Cdu';
import { FakeDatabase } from '../../../fakes/FakeDatabase';
import { fixtureTables } from '../../../fixtures/tables';
import type { Row } from '../../../../src/infrastructure/db/Database';

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

test('CDCFilterAlunno: religione SI includes the IRC teacher (14 §1.3)', () => {
  expect(filtrato('a1@school.it').map((d) => d.anagrafica.email)).toEqual([
    'bianchi@school.it',
    'rossi@school.it',
    'verdi@school.it'
  ]);
});

test('CDCFilterAlunno: religione NO excludes the IRC teacher (14 §1.3)', () => {
  // a2 chose NO → the IRC-only teacher (verdi) is dropped; subject teachers remain.
  expect(filtrato('a2@school.it').map((d) => d.anagrafica.email)).toEqual([
    'bianchi@school.it',
    'rossi@school.it'
  ]);
});

test('CDCFilterAlunno: religione ALT excludes IRC (no ALT teacher configured)', () => {
  expect(filtrato('a3@school.it').map((d) => d.anagrafica.email)).toEqual([
    'bianchi@school.it',
    'rossi@school.it'
  ]);
});
