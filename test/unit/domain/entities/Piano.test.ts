import { Piano } from '../../../../src/domain/entities/Piano';
import { COL_PIANI } from '../../../../src/config/schema';
import { TipoPiano } from '../../../../src/domain/value-objects/enums';

describe('Piano.getParametri', () => {
  it('returns {} when PARAMETRI is null', () => {
    const piano = new Piano({
      [COL_PIANI.STUDENTE]: 'a@example.com',
      [COL_PIANI.TIPO]: TipoPiano.PDP_DSA,
      [COL_PIANI.PARAMETRI]: null
    });

    expect(piano.getParametri()).toEqual({});
  });

  it('returns {} when PARAMETRI is a blank string (Sheets blank-cell read)', () => {
    const piano = new Piano({
      [COL_PIANI.STUDENTE]: 'a@example.com',
      [COL_PIANI.TIPO]: TipoPiano.PDP_DSA,
      [COL_PIANI.PARAMETRI]: ''
    });

    expect(piano.getParametri()).toEqual({});
  });

  it('parses valid JSON', () => {
    const piano = new Piano({
      [COL_PIANI.STUDENTE]: 'a@example.com',
      [COL_PIANI.TIPO]: TipoPiano.PFP,
      [COL_PIANI.PARAMETRI]: '{"durata": "annuale"}'
    });

    expect(piano.getParametri()).toEqual({ durata: 'annuale' });
  });
});
