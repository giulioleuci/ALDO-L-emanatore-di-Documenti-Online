import type { IArtifactFactory } from '../../../src/onlinetests/E2eTemplateProvisioner';
import type { E2eTemplateIds } from '../../../src/onlinetests/data/SharedTestDatabaseBuilder';

/** Minimal artifact seam for builder tests; only ASL source sheets are exercised. */
export function testArtifactFactory(): IArtifactFactory {
  let sequence = 0;
  return {
    createDocument(): string {
      throw new Error('document creation is not used by SharedTestDatabaseBuilder');
    },
    createSheet(): string {
      sequence += 1;
      return `builder_test_artifact_${sequence}`;
    }
  };
}

/** Artifact seam that only exercises sheet creation, sequencing plain `artifact_N` ids. */
export function recordingArtifacts(): IArtifactFactory {
  let sequence = 0;
  return {
    createDocument(): string {
      throw new Error('document creation is not used by this fixture');
    },
    createSheet(): string {
      sequence += 1;
      return `artifact_${sequence}`;
    }
  };
}

export const TEMPLATE_IDS: E2eTemplateIds = {
  verbale: 'tmpl_verbale',
  condotta: 'tmpl_condotta',
  riepilogo: 'tmpl_riepilogo',
  aslImportSheet: 'tmpl_asl_import',
  aslImportPolicySheet: 'tmpl_asl_import_policy',
  aslImportNoHeaderSheet: 'tmpl_asl_import_noheader',
  carenzeImportTimestampSheet: 'tmpl_carenze_import_timestamp',
  docComplesso: 'tmpl_doc_complesso',
  docArticolata: 'tmpl_doc_articolata',
  cdcRiepilogo: 'tmpl_cdc_riepilogo',
  sheetPermessi: 'tmpl_sheet_permessi',
  pianoLavoro: 'tmpl_piano_lavoro',
  staticAttachment: 'tmpl_attachment',
  tabelleImportate: 'tmpl_tabelle_importate',
  tabellaSorgenteDati: 'tmpl_tabella_sorgente_dati',
  tabellaSorgenteVuota: 'tmpl_tabella_sorgente_vuota',
  storico: 'tmpl_storico',
  dotted: 'tmpl_dotted',
  storicoEmail: 'tmpl_storico_email',
  piani: {
    PDP_DSA: 'tmpl_pdp_dsa',
    PDP_BES: 'tmpl_pdp_bes',
    PDP_STRANIERI: 'tmpl_pdp_stranieri',
    PEI: 'tmpl_pei',
    PFP: 'tmpl_pfp'
  }
};
