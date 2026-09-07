import { DatabaseValidationService } from '../../../src/application/services/DatabaseValidationService';
import { SheetDbAdapter } from '../../../src/infrastructure/db/SheetDbAdapter';
import { FakeDatabase } from '../../fakes/FakeDatabase';
import { FakeSpreadsheetReportFacade } from '../../fakes/FakeSpreadsheetReportFacade';
import { MasterConfig } from '../../../src/domain/entities/MasterConfig';
import type { IMasterSheetRepository } from '../../../src/domain/repositories/IMasterSheetRepository';

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

function tabelleValide(): Record<string, Array<Record<string, unknown>>> {
  return {
    INDIRIZZI: [{ ID: 'LS', NOME: 'Scientifico', NOME_SINTETICO: 'LS', TIPO: 'LICEO' }],
    MATERIE: [{ ID: 'MAT', NOME: 'Matematica', LS: '1' }],
    DOCENTI: [{ EMAIL: 'p@x.it', COGNOME: 'Rossi', NOME: 'Mario', ITP: false }],
    CLASSI: [{ ID: '1A', ANNO: '1', INDIRIZZO: 'LS', MAT: 'p@x.it' }],
    ALUNNI: [{ EMAIL: 'a@x.it', CLASSE: '1A' }]
  };
}

function servizio(tabelle: Record<string, Array<Record<string, unknown>>>): {
  service: DatabaseValidationService;
  report: FakeSpreadsheetReportFacade;
} {
  const report = new FakeSpreadsheetReportFacade();
  const service = new DatabaseValidationService({
    db: new FakeDatabase(tabelle as never),
    master: master(),
    report
  });
  return { service, report };
}

test('a clean database produces no violations and a TUTTO OK report', () => {
  const { service, report } = servizio(tabelleValide());
  const esito = service.esegui();
  expect(esito.violazioni).toEqual([]);
  expect(esito.nome).toBe('Validazione DB - 2026-2027');
  expect(report.reports[0]!.folderId).toBe('root1');
  expect(report.reports[0]!.righe).toEqual([
    ['TABELLA', 'RIGA', 'CAMPO', 'VALORE', 'ERRORE'],
    ['TUTTO OK - Nessun errore rilevato', '', '', '', '']
  ]);
});

test('a broken FK is reported with the sheet row number (index + 2)', () => {
  const tabelle = tabelleValide();
  tabelle['ALUNNI'] = [{ EMAIL: 'a@x.it', CLASSE: '1A' }, { EMAIL: 'b@x.it', CLASSE: '99X' }];
  const { service, report } = servizio(tabelle);
  const esito = service.esegui();
  const violazione = esito.violazioni.find((v) => v.tabella === 'ALUNNI' && v.campo === 'CLASSE');
  expect(violazione).toEqual({
    tabella: 'ALUNNI',
    riga: 3,
    campo: 'CLASSE',
    valore: '99X',
    errore: 'FK violata: CLASSE "99X" non esiste in CLASSI.ID'
  });
  expect(report.reports[0]!.righe[0]).toEqual(['TABELLA', 'RIGA', 'CAMPO', 'VALORE', 'ERRORE']);
  expect(report.reports[0]!.righe).toContainEqual([
    'ALUNNI', '3', 'CLASSE', '99X', 'FK violata: CLASSE "99X" non esiste in CLASSI.ID'
  ]);
});

test('real table reads report physical row 3 after whitespace-only row 2', () => {
  const records = tabelleValide();
  records['ALUNNI'] = [{ EMAIL: ' ', CLASSE: '\t' }, { EMAIL: 'b@x.it', CLASSE: '99X' }];
  const tables: Record<string, TableService> = {};
  for (const [name, rows] of Object.entries(records)) {
    const header = Object.keys(rows[0]!);
    const raw = [header, ...rows.map((row) => header.map((column) => row[column]))];
    tables[name] = new TableService(
      name, 'ss1', { getRanges: () => raw }, new LoggerService(), new UtilsService(), raw
    );
  }
  const db = new SheetDbAdapter({
    tables, save() {}, beginTransaction() {}, commit() {}, rollback() {}
  });
  const report = new FakeSpreadsheetReportFacade();
  const service = new DatabaseValidationService({ db, master: master(), report });

  expect(db.table('ALUNNI').findAll()).toEqual([{ EMAIL: 'b@x.it', CLASSE: '99X' }]);
  expect(service.esegui().violazioni).toEqual([{
    tabella: 'ALUNNI', riga: 3, campo: 'CLASSE', valore: '99X',
    errore: 'FK violata: CLASSE "99X" non esiste in CLASSI.ID'
  }]);
  expect(report.reports[0]!.righe).toContainEqual([
    'ALUNNI', '3', 'CLASSE', '99X', 'FK violata: CLASSE "99X" non esiste in CLASSI.ID'
  ]);
  expect(db.table('ALUNNI').findAll()).toEqual([{ EMAIL: 'b@x.it', CLASSE: '99X' }]);
});

test('an ITP column assigned to a non-ITP docente is reported', () => {
  const tabelle = tabelleValide();
  tabelle['MATERIE'] = [{ ID: 'MAT', NOME: 'Matematica', LS: '1' }, { ID: 'INF', NOME: 'Informatica' }];
  tabelle['CLASSI'] = [{ ID: '1A', ANNO: '1', INDIRIZZO: 'LS', MAT: 'p@x.it', 'INF.itp': 'p@x.it' }];
  const { service } = servizio(tabelle);
  expect(service.esegui().violazioni.map((v) => v.errore)).toContain(
    'Colonna ITP INF.itp: il docente "p@x.it" non ha DOCENTI.ITP = true'
  );
});

test('a curriculum subject with no CLASSI column is reported (Feature 4)', () => {
  const tabelle = tabelleValide();
  tabelle['MATERIE'] = [
    { ID: 'MAT', NOME: 'Matematica', LS: '1' },
    { ID: 'ITA', NOME: 'Italiano', LS: '1,2' }
  ];
  const { service } = servizio(tabelle);
  expect(service.esegui().violazioni.map((v) => v.errore)).toContain(
    "Materia \"ITA\" obbligatoria per l'indirizzo LS anno 1: colonna assente in CLASSI"
  );
});

test('violations are ordered by table then row', () => {
  const tabelle = tabelleValide();
  tabelle['ALUNNI'] = [{ EMAIL: '', CLASSE: '99X' }];
  const { service } = servizio(tabelle);
  const righe = service.esegui().violazioni.filter((v) => v.tabella === 'ALUNNI');
  expect(righe.map((v) => v.riga)).toEqual([2, 2]);
  expect(righe.map((v) => v.campo).sort()).toEqual(['CLASSE', 'EMAIL']);
});
