import { tipoPianoLabel, religioneLabel, tipoProgettoLabel } from '../../../../../src/application/context-engine/mappers/labels';
import { TipoPiano, ReligioneScelta, TipoProgetto } from '../../../../../src/domain/value-objects/enums';

describe('labels', () => {
  it('maps every TipoPiano to a readable label', () => {
    expect(tipoPianoLabel(TipoPiano.PDP_DSA)).toBe('PDP DSA');
    expect(tipoPianoLabel(TipoPiano.PEI)).toBe('PEI');
    expect(tipoPianoLabel(TipoPiano.PFP)).toBe('PFP');
  });

  it('maps every ReligioneScelta to a readable label', () => {
    expect(religioneLabel(ReligioneScelta.IRC)).toBe('Religione cattolica');
    expect(religioneLabel(ReligioneScelta.ALT)).toBe('Attività alternativa');
    expect(religioneLabel(ReligioneScelta.NO)).toBe('Non si avvale');
  });

  it('maps every TipoProgetto to a readable label', () => {
    expect(tipoProgettoLabel(TipoProgetto.ASL)).toBe('PCTO/ASL');
    expect(tipoProgettoLabel(TipoProgetto.ORIENTAMENTO)).toBe('Orientamento');
    expect(tipoProgettoLabel(TipoProgetto.ALTRO)).toBe('Altro');
  });
});
