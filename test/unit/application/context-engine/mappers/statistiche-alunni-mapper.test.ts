import { computeStatisticheAlunni } from '../../../../../src/application/context-engine/mappers/statisticheAlunniMapper';
import { Alunno } from '../../../../../src/domain/entities/Alunno';
import { COL_ALUNNI } from '../../../../../src/config/schema';
import { TipoPiano } from '../../../../../src/domain/value-objects/enums';

describe('computeStatisticheAlunni', () => {
  it('counts the canonical student statistics fields', () => {
    const marco = Alunno.fromData({
      [COL_ALUNNI.EMAIL]: 'marco@x.it',
      [COL_ALUNNI.RIPETENTE]: true
    });
    const anna = Alunno.fromData({
      [COL_ALUNNI.EMAIL]: 'anna@x.it',
      [COL_ALUNNI.RAPPR_STUD]: true
    });
    const alunni = {
      getPiani: (a: typeof marco) =>
        a.id === 'marco@x.it' ? [{ isBES: () => true, tipo: TipoPiano.PDP_DSA }] : []
    };
    const stats = computeStatisticheAlunni([marco, anna], alunni as never);
    expect(stats).toEqual({
      totale: 2,
      conPiani: 1,
      conBes: 1,
      conDsa: 1,
      ripetenti: 1,
      rappresentanti: 1
    });
  });
});
