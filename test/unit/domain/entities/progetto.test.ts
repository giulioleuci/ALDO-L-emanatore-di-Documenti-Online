import { Progetto } from '../../../../src/domain/entities/Progetto';
import { TipoProgetto } from '../../../../src/domain/value-objects/enums';
import { COL_PROGETTI } from '../../../../src/config/schema';

describe('Progetto', () => {
  it('exposes ORE via getOre()', () => {
    const progetto = Progetto.fromData({
      [COL_PROGETTI.CLASSE]: '5A',
      [COL_PROGETTI.TIPO]: TipoProgetto.ASL,
      [COL_PROGETTI.NOME]: 'x',
      [COL_PROGETTI.ORE]: 30,
      [COL_PROGETTI.ORE_ASL]: 30
    });
    expect(progetto.getOre()).toBe(30);
  });
});
