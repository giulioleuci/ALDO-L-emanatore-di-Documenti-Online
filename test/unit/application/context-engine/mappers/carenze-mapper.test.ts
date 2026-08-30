import { buildElencoCarenzeVm, curriculumArray } from '../../../../../src/application/context-engine/mappers/carenzeMapper';
import { Carenza } from '../../../../../src/domain/entities/Carenza';
import { Alunno } from '../../../../../src/domain/entities/Alunno';
import { Materia } from '../../../../../src/domain/entities/Materia';
import { COL_ALUNNI, COL_MATERIE } from '../../../../../src/config/schema';

const materie = {
  findByIdCached: (id: { value: string }) => id.value === 'MATE' ? Materia.fromData({ [COL_MATERIE.ID]: 'MATE', [COL_MATERIE.NOME]: 'Matematica', [COL_MATERIE.SINTESI]: 'Mate' }) : null
};

test('buildElencoCarenzeVm emits a sorted canonical collection envelope', () => {
  const carenza = new Carenza({ STUDENTE: 'a@x.it', PROGRESSIVO: 1, MATE: 5 });
  expect(buildElencoCarenzeVm([carenza], ['MATE'], materie as never)).toEqual({
    elenco: [{ materiaSigla: 'MATE', materiaNome: 'Matematica', materiaNomeSintetico: 'Mate', voto: '5', descrizione: 'Matematica: 5' }],
    hasElenco: true, numero: 1, elencoDescrizione: 'Matematica: 5'
  });
});

test('curriculumArray adds compact names, capitalization and collection metadata', () => {
  const alunno = Alunno.fromData({ [COL_ALUNNI.EMAIL]: 'a@x.it', [COL_ALUNNI.CURRICULUM]: JSON.stringify({ MATE: ['avanzato'] }) });
  expect(curriculumArray(alunno, materie as never)).toEqual([{ materiaId: 'MATE', materiaSigla: 'MATE', materiaNome: 'Matematica', materiaNomeSintetico: 'Mate', specifiche: [{ nome: 'avanzato', nomeCapitalizzato: 'Avanzato' }], hasSpecifiche: true, specificheDescrizione: 'avanzato' }]);
});
