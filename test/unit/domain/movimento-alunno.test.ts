import { MovimentoAlunno } from '../../../src/domain/entities/MovimentoAlunno';
import { COL_MOV_ALUNNI } from '../../../src/config/schema';

function movimento(tipo: string) {
  return new MovimentoAlunno({
    [COL_MOV_ALUNNI.STUDENTE]: 'a1@school.it',
    [COL_MOV_ALUNNI.TIPO]: tipo,
    [COL_MOV_ALUNNI.DATA]: '2026-03-01',
    [COL_MOV_ALUNNI.DA]: '4A',
    [COL_MOV_ALUNNI.A]: ''
  });
}

test('isRitirato is true only for TIPO=RITIRATO', () => {
  expect(movimento('RITIRATO').isRitirato()).toBe(true);
  expect(movimento('OUT').isRitirato()).toBe(false);
  expect(movimento('IN').isRitirato()).toBe(false);
  expect(movimento('CAMBIO').isRitirato()).toBe(false);
});

test('isUscita stays true only for TIPO=OUT (trasferimento), not RITIRATO', () => {
  expect(movimento('OUT').isUscita()).toBe(true);
  expect(movimento('RITIRATO').isUscita()).toBe(false);
});
