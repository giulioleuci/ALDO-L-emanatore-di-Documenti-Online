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
  piani: Record<(typeof TIPI_PIANO)[number], string>;
}
