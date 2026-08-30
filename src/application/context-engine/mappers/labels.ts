import { TipoPiano, ReligioneScelta, TipoProgetto, StatoDocumento } from '../../../domain/value-objects/enums';

const TIPO_PIANO_LABELS: Record<TipoPiano, string> = {
  [TipoPiano.PDP_DSA]: 'PDP (DSA)',
  [TipoPiano.PDP_BES]: 'PDP (BES)',
  [TipoPiano.PDP_STRANIERI]: 'PDP (STRANIERI)',
  [TipoPiano.PEI]: 'PEI',
  [TipoPiano.PFP]: 'PFP'
};

export function tipoPianoLabel(tipo: TipoPiano): string {
  return TIPO_PIANO_LABELS[tipo];
}

const RELIGIONE_LABELS: Record<ReligioneScelta, string> = {
  [ReligioneScelta.IRC]: 'Religione cattolica',
  [ReligioneScelta.ALT]: 'Attività alternativa',
  [ReligioneScelta.NO]: 'Non si avvale'
};

export function religioneLabel(religione: ReligioneScelta): string {
  return RELIGIONE_LABELS[religione];
}

const TIPO_PROGETTO_LABELS: Record<TipoProgetto, 'FSL' | 'Orientamento' | 'Altro'> = {
  [TipoProgetto.ASL]: 'FSL',
  [TipoProgetto.ORIENTAMENTO]: 'Orientamento',
  [TipoProgetto.ALTRO]: 'Altro'
};

export function tipoProgettoLabel(tipo: TipoProgetto): 'FSL' | 'Orientamento' | 'Altro' {
  return TIPO_PROGETTO_LABELS[tipo];
}

const STATO_DOCUMENTO_LABELS: Record<StatoDocumento, string> = {
  [StatoDocumento.GENERATO]: 'Generato',
  [StatoDocumento.VERBALIZZATO]: 'Verbalizzato',
  [StatoDocumento.NOTIFICATO]: 'Notificato',
  [StatoDocumento.ARCHIVIATO]: 'Archiviato'
};

export function statoDocumentoLabel(stato: StatoDocumento): string {
  return STATO_DOCUMENTO_LABELS[stato];
}

/** Canonical `IndirizzoVM.tipoLabel` mapping — the one place every provider that builds an indirizzo VM sources it from. */
export function indirizzoTipoLabel(tipo: string): string {
  return tipo === 'LICEO' ? 'Liceo' : tipo === 'TECNICO' ? 'Tecnico' : tipo === 'ITS' ? 'ITS' : tipo;
}
