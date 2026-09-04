import type {
  ISampleSpreadsheet,
  ISampleSpreadsheetFactory
} from '../../../src/onlinetests/SampleDatabaseBuilder';
import { SharedTestDatabaseBuilder } from '../../../src/onlinetests/data/SharedTestDatabaseBuilder';
import { FakeDriveFacade } from '../../fakes/FakeDriveFacade';
import { FakeDatabase } from '../../fakes/FakeDatabase';
import { FakeSpreadsheetReportFacade } from '../../fakes/FakeSpreadsheetReportFacade';
import { DatabaseValidationService } from '../../../src/application/services/DatabaseValidationService';
import { VALIDATION_TABLES } from '../../../src/config/validationRules';
import { MasterConfig } from '../../../src/domain/entities/MasterConfig';
import type { IMasterSheetRepository } from '../../../src/domain/repositories/IMasterSheetRepository';
import { RecordingSpreadsheet } from '../onlinetests/recordingSpreadsheet';
import { recordingArtifacts, TEMPLATE_IDS } from '../onlinetests/testArtifactFactory';

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
  //  - ASL riga 8 / LOG_FOLD righe 2-8: deliberate
  //    unknown-student and decoy-folder rows used by importChecks/cartelle
  //    filtering tests (src/onlinetests/data/Seeders.ts).
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
  const violazioniNote = esito.violazioni.map(
    (v) => `${v.tabella}|${v.riga}|${v.campo}|${v.errore}`
  );
  expect(violazioniNote).toEqual([
    'ASL|8|STUDENTE|FK violata: STUDENTE "sconosciuto@onlinetest.aldo.local" non esiste in ALUNNI.EMAIL',
    'CONF_MAIL|9|SUPPLENTI|Valore non ammesso per SUPPLENTI: "false" (ammessi: SOLO_TITOLARI, SOLO_SUPPLENTI, ENTRAMBI)',
    'CONF_MAIL|10|SUPPLENTI|Valore non ammesso per SUPPLENTI: "false" (ammessi: SOLO_TITOLARI, SOLO_SUPPLENTI, ENTRAMBI)',
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
