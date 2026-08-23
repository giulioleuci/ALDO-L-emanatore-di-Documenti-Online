import { presenteTuttoAnno } from '../../../src/application/storico/presenza';
import { MovimentoAlunno } from '../../../src/domain/entities/MovimentoAlunno';
import { COL_MOV_ALUNNI } from '../../../src/config/schema';

function movimento(tipo: string): MovimentoAlunno {
  return new MovimentoAlunno({
    [COL_MOV_ALUNNI.STUDENTE]: 'a1@school.it',
    [COL_MOV_ALUNNI.TIPO]: tipo,
    [COL_MOV_ALUNNI.DATA]: '2026-01-10',
    [COL_MOV_ALUNNI.DA]: '4A',
    [COL_MOV_ALUNNI.A]: '4B'
  });
}

test('true when there is no movement at all (5.2)', () => {
  expect(presenteTuttoAnno([])).toBe(true);
});

test('true when the only movements are OUT/RITIRATO (exit does not affect mid-year presence)', () => {
  expect(presenteTuttoAnno([movimento('OUT'), movimento('RITIRATO')])).toBe(true);
});

test('false when an IN movement is present (5.2)', () => {
  expect(presenteTuttoAnno([movimento('IN')])).toBe(false);
});

test('false when a CAMBIO movement is present (5.2)', () => {
  expect(presenteTuttoAnno([movimento('CAMBIO')])).toBe(false);
});
