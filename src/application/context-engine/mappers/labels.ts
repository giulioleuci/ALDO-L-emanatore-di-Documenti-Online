import { TipoPiano, ReligioneScelta, TipoProgetto } from '../../../domain/value-objects/enums';

export const TIPO_PIANO_LABELS: Record<TipoPiano, string> = {
  [TipoPiano.PDP_DSA]: 'PDP (DSA)',
  [TipoPiano.PDP_BES]: 'PDP (BES)',
  [TipoPiano.PDP_STRANIERI]: 'PDP (STRANIERI)',
  [TipoPiano.PEI]: 'PEI',
  [TipoPiano.PFP]: 'PFP'
};

export function tipoPianoLabel(tipo: TipoPiano): string {
  return TIPO_PIANO_LABELS[tipo];
}

export const RELIGIONE_LABELS: Record<ReligioneScelta, string> = {
  [ReligioneScelta.IRC]: 'Religione cattolica',
  [ReligioneScelta.ALT]: 'Attività alternativa',
  [ReligioneScelta.NO]: 'Non si avvale'
};

export function religioneLabel(religione: ReligioneScelta): string {
  return RELIGIONE_LABELS[religione];
}

export const TIPO_PROGETTO_LABELS: Record<TipoProgetto, string> = {
  [TipoProgetto.ASL]: 'PCTO/ASL',
  [TipoProgetto.ORIENTAMENTO]: 'Orientamento',
  [TipoProgetto.ALTRO]: 'Altro'
};

export function tipoProgettoLabel(tipo: TipoProgetto): string {
  return TIPO_PROGETTO_LABELS[tipo];
}
