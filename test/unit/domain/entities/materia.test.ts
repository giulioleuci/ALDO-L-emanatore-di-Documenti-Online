import { Materia } from '../../../../src/domain/entities/Materia';
import { COL_MATERIE } from '../../../../src/config/schema';

test('Materia.nome reconstructs "PRINCIPALE (SPECIFICITA)" when NOME is blank and both are present', () => {
  const materia = new Materia({
    [COL_MATERIE.ID]: 'INTERPRET.CHITARRA',
    [COL_MATERIE.NOME]: '',
    [COL_MATERIE.PRINCIPALE]: 'Interpretazione ed esecuzione',
    [COL_MATERIE.SPECIFICITA]: 'Chitarra'
  });

  expect(materia.nome).toBe('Interpretazione ed esecuzione (Chitarra)');
  expect(materia.principale).toBe('Interpretazione ed esecuzione');
  expect(materia.specificita).toBe('Chitarra');
});

test('Materia.nome keeps the explicit NOME cell when non-blank, even with PRINCIPALE/SPECIFICITA set', () => {
  const materia = new Materia({
    [COL_MATERIE.ID]: 'INTERPRET.FLAUTO',
    [COL_MATERIE.NOME]: 'Interpretazione (flauto dolce)',
    [COL_MATERIE.PRINCIPALE]: 'Interpretazione ed esecuzione',
    [COL_MATERIE.SPECIFICITA]: 'Flauto'
  });

  expect(materia.nome).toBe('Interpretazione (flauto dolce)');
});

test('Materia.nome behaves as a plain field for non-specific rows (no PRINCIPALE/SPECIFICITA)', () => {
  const materia = new Materia({
    [COL_MATERIE.ID]: 'MAT',
    [COL_MATERIE.NOME]: 'Matematica'
  });

  expect(materia.nome).toBe('Matematica');
  expect(materia.principale).toBeNull();
  expect(materia.specificita).toBeNull();
});

test('Materia.toData() round-trips the raw NOME cell, not the computed fallback', () => {
  const materia = new Materia({
    [COL_MATERIE.ID]: 'INTERPRET.CHITARRA',
    [COL_MATERIE.NOME]: '',
    [COL_MATERIE.PRINCIPALE]: 'Interpretazione ed esecuzione',
    [COL_MATERIE.SPECIFICITA]: 'Chitarra'
  });

  const data = materia.toData();
  expect(data[COL_MATERIE.NOME]).toBe('');
  expect(data[COL_MATERIE.PRINCIPALE]).toBe('Interpretazione ed esecuzione');
  expect(data[COL_MATERIE.SPECIFICITA]).toBe('Chitarra');
});
