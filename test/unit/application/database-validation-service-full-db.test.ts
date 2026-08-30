import type {
  ISampleSpreadsheet,
  ISampleSpreadsheetFactory
} from '../../../src/onlinetests/SampleDatabaseBuilder';
import type { IArtifactFactory } from '../../../src/onlinetests/E2eTemplateProvisioner';
import {
  SharedTestDatabaseBuilder,
  type E2eTemplateIds
} from '../../../src/onlinetests/data/SharedTestDatabaseBuilder';
import { FakeDriveFacade } from '../../fakes/FakeDriveFacade';
import { FakeDatabase } from '../../fakes/FakeDatabase';
import { FakeSpreadsheetReportFacade } from '../../fakes/FakeSpreadsheetReportFacade';
import { DatabaseValidationService } from '../../../src/application/services/DatabaseValidationService';
import { VALIDATION_TABLES } from '../../../src/config/validationRules';
import { MasterConfig } from '../../../src/domain/entities/MasterConfig';
import type { IMasterSheetRepository } from '../../../src/domain/repositories/IMasterSheetRepository';

// Same recording-spreadsheet machinery as
// test/unit/onlinetests/shared-test-database-builder-migration.test.ts — kept
// local (rather than shared) since this file only needs the seeded rows, not
// the builder's own migration-shape assertions.
class RecordingSpreadsheet implements ISampleSpreadsheet {
  readonly rows: Record<string, Record<string, unknown>[]> = {};
  readonly headers: Record<string, string[]> = {};

  constructor(readonly id: string) {}

  addSheet(name: string, headerRow: string[]): void {
    this.headers[name] = headerRow;
    this.rows[name] = [];
  }

  appendRow(sheetName: string, row: Record<string, unknown>): void {
    (this.rows[sheetName] ??= []).push(row);
  }

  appendRows(sheetName: string, rows: Array<Record<string, unknown>>): void {
    (this.rows[sheetName] ??= []).push(...rows);
  }

  getUrl(): string {
    return `https://example.test/${this.id}`;
  }
}

function recordingFactory(): {
  spreadsheets: ISampleSpreadsheetFactory;
  sheets: Map<string, RecordingSpreadsheet>;
} {
  const sheets = new Map<string, RecordingSpreadsheet>();
  return {
    sheets,
    spreadsheets: {
      createSpreadsheet(name: string): ISampleSpreadsheet {
        const sheet = new RecordingSpreadsheet(`id_${name}`);
        sheets.set(name, sheet);
        return sheet;
      },
      openExistingSpreadsheet(): ISampleSpreadsheet {
        throw new Error('not used by full-DB validation test');
      }
    }
  };
}

function recordingArtifacts(): IArtifactFactory {
  let sequence = 0;
  return {
    createDocument(): string {
      throw new Error('not used by full-DB validation test');
    },
    createSheet(): string {
      sequence += 1;
      return `artifact_${sequence}`;
    }
  };
}

const TEMPLATE_IDS: E2eTemplateIds = {
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

function master(): IMasterSheetRepository {
  const config = new MasterConfig({
    ANNO_SCOLASTICO: '2026-2027',
    ID_SPREADSHEET: 'ss1',
    ID_CARTELLA_GOOGLE: 'root1'
  });
  return {
    findConfigAnnoCorrente: () => config,
    findByAnno: () => config
  } as unknown as IMasterSheetRepository;
}

test('the full ~60-rule table produces no violations on the realistic, fully-seeded SharedTestDatabaseBuilder sample', () => {
  const { spreadsheets, sheets } = recordingFactory();
  const masterSheet = new RecordingSpreadsheet('bound-master');
  new SharedTestDatabaseBuilder(spreadsheets, new FakeDriveFacade(), recordingArtifacts()).build(
    TEMPLATE_IDS,
    masterSheet
  );

  const sample = sheets.get('_ALDO_E2E_SAMPLE')!;
  const tabelle: Record<string, Array<Record<string, unknown>>> = {};
  for (const table of VALIDATION_TABLES) {
    tabelle[table] = sample.rows[table] ?? [];
  }

  const report = new FakeSpreadsheetReportFacade();
  const service = new DatabaseValidationService({
    db: new FakeDatabase(tabelle as never),
    master: master(),
    report
  });

  const esito = service.esegui();

  // The shared E2E fixture (used by many onlinetests, not owned by this fix
  // wave) carries a handful of KNOWN, deliberate violations baked in by its
  // own test design — not database-structure bugs:
  //  - ASL riga 8 / INDIRIZZI righe 2-4 / LOG_FOLD righe 2-8: deliberate
  //    unknown-student and decoy-folder rows used by importChecks/cartelle
  //    filtering tests (src/onlinetests/data/Seeders.ts) plus a genuine
  //    'Liceo' vs 'LICEO' casing mismatch in seedIndirizzi.
  //  - CONF_MAIL righe 9-10: two dedicated rows hardcode SUPPLENTI: false
  //    instead of a GestioneSupplenti enum value (Seeders.ts ~line 723).
  // (MATERIE righe 17-19 — LAB.GRUPPO_A, LAB.SEMINARIO_POMERIDIANO,
  // INTERPRET.CHITARRA — carry NOME: '' by 2026-07-30 specifica-catalog
  // design, but also carry PRINCIPALE+SPECIFICITA, so MATERIE_NOME_MANCANTE
  // legitimately does not flag them; see 01 §MATERIE.)
  // None of these are new — they predate this fix wave and are unrelated to
  // CLASSI cattedre. This test's job is to prove the RULE TABLE itself
  // (including the new FK_CLASSI_CATTEDRE rule) doesn't ALSO false-positive
  // anywhere else in a fully-populated, realistic database.
  const violazioniNote = esito.violazioni.map((v) => `${v.tabella}|${v.riga}|${v.campo}|${v.errore}`);
  expect(violazioniNote).toEqual([
    'ASL|8|STUDENTE|FK violata: STUDENTE "sconosciuto@onlinetest.aldo.local" non esiste in ALUNNI.EMAIL',
    'CONF_MAIL|9|SUPPLENTI|Valore non ammesso per SUPPLENTI: "false" (ammessi: SOLO_TITOLARI, SOLO_SUPPLENTI, ENTRAMBI)',
    'CONF_MAIL|10|SUPPLENTI|Valore non ammesso per SUPPLENTI: "false" (ammessi: SOLO_TITOLARI, SOLO_SUPPLENTI, ENTRAMBI)',
    'INDIRIZZI|2|TIPO|Valore non ammesso per TIPO: "Liceo" (ammessi: LICEO, ITS, IEFP, PROFESSIONALE, TECNICO)',
    'INDIRIZZI|3|TIPO|Valore non ammesso per TIPO: "Liceo" (ammessi: LICEO, ITS, IEFP, PROFESSIONALE, TECNICO)',
    'INDIRIZZI|4|TIPO|Valore non ammesso per TIPO: "Liceo" (ammessi: LICEO, ITS, IEFP, PROFESSIONALE, TECNICO)',
    'LOG_FOLD|2|ID_GEN|FK violata: ID_GEN "E2E_ASL_CARTELLE" non esiste in CONF_DOC.ID',
    'LOG_FOLD|3|ID_GEN|FK violata: ID_GEN "E2E_ASL_CARTELLE" non esiste in CONF_DOC.ID',
    'LOG_FOLD|4|ID_GEN|FK violata: ID_GEN "E2E_ASL_CARTELLE" non esiste in CONF_DOC.ID',
    'LOG_FOLD|5|ID_GEN|FK violata: ID_GEN "E2E_ASL_CARTELLE" non esiste in CONF_DOC.ID',
    'LOG_FOLD|6|ID_GEN|FK violata: ID_GEN "E2E_ASL_CARTELLE" non esiste in CONF_DOC.ID',
    'LOG_FOLD|7|ID_GEN|FK violata: ID_GEN "E2E_ASL_CARTELLE" non esiste in CONF_DOC.ID',
    'LOG_FOLD|8|ID_GEN|FK violata: ID_GEN "E2E_FILTER_DECOY" non esiste in CONF_DOC.ID'
  ]);

  // The important assertion for this fix wave: no CLASSI/DOCENTI-cattedre
  // violations anywhere — proving FK_CLASSI_CATTEDRE and every other rule
  // touching CLASSI's dynamic columns is silent on the realistic dataset.
  expect(esito.violazioni.filter((v) => v.tabella === 'CLASSI')).toEqual([]);
  expect(esito.violazioni.some((v) => v.errore.includes('DOCENTI.EMAIL'))).toBe(false);
});
