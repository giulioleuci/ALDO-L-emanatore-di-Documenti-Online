export const TIPI_PIANO = ['PDP_DSA', 'PDP_BES', 'PDP_STRANIERI', 'PEI', 'PFP'] as const;

export interface E2eTemplateIds {
  verbale: string;
  condotta: string;
  riepilogo: string;
  aslImportSheet: string;
  docComplesso: string;
  docArticolata: string;
  cdcRiepilogo: string;
  sheetPermessi: string;
  pianoLavoro: string;
  staticAttachment: string;
  tabelleImportate: string;
  tabellaSorgenteDati: string;
  tabellaSorgenteVuota: string;
  storico: string;
  dotted: string;
  storicoEmail: string;
  piani: Record<(typeof TIPI_PIANO)[number], string>;
}
