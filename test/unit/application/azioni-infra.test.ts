import { creaHandlersInfra } from '../../../src/application/pipelines/azioniInfra';
import { FakeDatabase } from '../../fakes/FakeDatabase';
import { fixtureTables } from '../../fixtures/tables';
import { FakeDriveFacade } from '../../fakes/FakeDriveFacade';
import { Email } from '../../../src/domain/value-objects/Email';
import type { Cdu } from '../../../src/application/context-engine/Cdu';

const logger = new LoggerService();
const cdu = {} as Cdu;

function db(): FakeDatabase {
  const tables = fixtureTables();
  tables['LOG_DOCS'] = [
    { ID: 'file_1', ID_GEN: 'CD1', TIPO: 'VERBALE', SOTTOTIPO: '', CLASSI: '5A,5B', UTENTI: '', MATERIE: '', PATH: 'Verbali/5', STATO: 'GENERATO' },
    { ID: 'file_2', ID_GEN: 'CD1', TIPO: 'PIANO', SOTTOTIPO: 'PEI', CLASSI: '1A', UTENTI: 'a1@school.it', MATERIE: '', PATH: 'Piani/1', STATO: 'GENERATO' }
  ];
  tables['LOG_FOLD'] = [
    { ID: 'fold_1', ID_GEN: 'CD1', TIPO: 'CARTELLA_CLASSE', NOME: '5A', PATH: '2026-2027/5A', CLASSI: '5A', UTENTI: '', MATERIE: '' }
  ];
  return new FakeDatabase(tables);
}

const roles = { risolvi: () => [Email.of('coord@school.it')] };

test('AGGIORNA_PERMESSI grants only the missing ACLs on the selected LOG_DOCS rows', () => {
  const drive = new FakeDriveFacade();
  drive.permissionsPerFile.set('file_1', [
    { id: 'p1', email: 'coord@school.it', role: 'reader', tipo: 'user' }
  ]);
  const handlers = creaHandlersInfra({ db: db(), drive, roles, cdu, logger });
  const n = handlers['AGGIORNA_PERMESSI']!(
    { tipo: 'AGGIORNA_PERMESSI', su: 'LOG_DOCS', ruolo: 'COORDINATORI', permesso: 'LETTURA' },
    { CLASSI: '5A' }
  );
  // file_1 already aligned -> no write at all; only file_2 is out of scope (CLASSI 1A).
  expect(n).toBe(0);
  expect(drive.permissions).toEqual([]);
  expect(drive.roleChanges).toEqual([]);
});

test('AGGIORNA_PERMESSI adds a missing grant and role-changes a mismatched one', () => {
  const drive = new FakeDriveFacade();
  drive.permissionsPerFile.set('file_1', [
    { id: 'p1', email: 'coord@school.it', role: 'reader', tipo: 'user' }
  ]);
  drive.permissionsPerFile.set('file_2', []);
  const handlers = creaHandlersInfra({ db: db(), drive, roles, cdu, logger });
  const n = handlers['AGGIORNA_PERMESSI']!(
    { tipo: 'AGGIORNA_PERMESSI', su: 'LOG_DOCS', ruolo: 'COORDINATORI', permesso: 'SCRITTURA' },
    {}
  );
  expect(n).toBe(2);
  expect(drive.roleChanges).toEqual([{ fileId: 'file_1', permissionId: 'p1', role: 'writer' }]);
  expect(drive.permissions).toEqual([
    { fileId: 'file_2', email: 'coord@school.it', permesso: 'SCRITTURA' }
  ]);
});

test('AGGIORNA_PERMESSI selects folders from LOG_FOLD by CLASSI containment and PATH prefix', () => {
  const drive = new FakeDriveFacade();
  const handlers = creaHandlersInfra({ db: db(), drive, roles, cdu, logger });
  handlers['AGGIORNA_PERMESSI']!(
    { tipo: 'AGGIORNA_PERMESSI', su: 'LOG_FOLD', emails: ['x@school.it'], permesso: 'LETTURA' },
    { CLASSI: '5A', PATH: '2026-2027/' }
  );
  expect(drive.permissions).toEqual([{ fileId: 'fold_1', email: 'x@school.it', permesso: 'LETTURA' }]);
});

test('AGGIORNA_PERMESSI never touches owner/organizer permissions', () => {
  const drive = new FakeDriveFacade();
  drive.permissionsPerFile.set('file_1', [
    { id: 'p1', email: 'coord@school.it', role: 'owner', tipo: 'user' }
  ]);
  const handlers = creaHandlersInfra({ db: db(), drive, roles, cdu, logger });
  const n = handlers['AGGIORNA_PERMESSI']!(
    { tipo: 'AGGIORNA_PERMESSI', su: 'LOG_DOCS', ruolo: 'COORDINATORI', permesso: 'LETTURA' },
    { CLASSI: '5A' }
  );
  expect(n).toBe(0);
  expect(drive.roleChanges).toEqual([]);
});

test('RIDUCI_PERMESSI downgrades only what is above the threshold', () => {
  const drive = new FakeDriveFacade();
  drive.permissionsPerFile.set('file_1', [
    { id: 'p1', email: 'a@school.it', role: 'writer', tipo: 'user' },
    { id: 'p2', email: 'b@school.it', role: 'reader', tipo: 'user' },
    { id: 'p3', email: 'c@school.it', role: 'commenter', tipo: 'user' },
    { id: 'p4', email: 'd@school.it', role: 'owner', tipo: 'user' }
  ]);
  const handlers = creaHandlersInfra({ db: db(), drive, roles, cdu, logger });
  const n = handlers['RIDUCI_PERMESSI']!(
    { tipo: 'RIDUCI_PERMESSI', su: 'LOG_DOCS' },
    { ID: 'file_1' }
  );
  expect(n).toBe(2);
  expect(drive.roleChanges).toEqual([
    { fileId: 'file_1', permissionId: 'p1', role: 'reader' },
    { fileId: 'file_1', permissionId: 'p3', role: 'reader' }
  ]);
});

test('RIDUCI_PERMESSI honours an explicit soglia and is a no-op when already aligned', () => {
  const drive = new FakeDriveFacade();
  drive.permissionsPerFile.set('file_1', [
    { id: 'p1', email: 'a@school.it', role: 'commenter', tipo: 'user' }
  ]);
  const handlers = creaHandlersInfra({ db: db(), drive, roles, cdu, logger });
  expect(
    handlers['RIDUCI_PERMESSI']!(
      { tipo: 'RIDUCI_PERMESSI', su: 'LOG_DOCS', soglia: 'COMMENTO' },
      { ID: 'file_1' }
    )
  ).toBe(0);
  expect(drive.roleChanges).toEqual([]);
});

test('RIDUCI_PERMESSI reports a failed downgrade without counting it', () => {
  const drive = new FakeDriveFacade();
  drive.permissionsPerFile.set('file_1', [
    { id: 'p1', email: 'a@school.it', role: 'writer', tipo: 'user' }
  ]);
  drive.permissionFailures.set('p1', 'Drive rifiuta');
  const handlers = creaHandlersInfra({ db: db(), drive, roles, cdu, logger });
  expect(
    handlers['RIDUCI_PERMESSI']!({ tipo: 'RIDUCI_PERMESSI', su: 'LOG_DOCS' }, { ID: 'file_1' })
  ).toBe(0);
});

test('AGGIORNA_PERMESSI isolates a Drive failure on one target and keeps grants already computed for others', () => {
  const drive = new FakeDriveFacade();
  drive.throwOnListPermissions.add('file_1');
  const warn = jest.spyOn(LoggerService.prototype, 'warn').mockImplementation(() => {});
  const handlers = creaHandlersInfra({ db: db(), drive, roles, cdu, logger });
  // No criteri: matches every LOG_DOCS row (file_1 and file_2) — file_1's
  // listPermissions throws, file_2 must still get its grant.
  const n = handlers['AGGIORNA_PERMESSI']!(
    { tipo: 'AGGIORNA_PERMESSI', su: 'LOG_DOCS', emails: ['x@school.it'], permesso: 'LETTURA' },
    {}
  );
  expect(n).toBe(1);
  expect(drive.permissions).toEqual([{ fileId: 'file_2', email: 'x@school.it', permesso: 'LETTURA' }]);
  expect(warn).toHaveBeenCalledWith(expect.stringContaining('file_1'));
  warn.mockRestore();
});

test('RIDUCI_PERMESSI isolates a Drive failure on one target and keeps declassifying the others', () => {
  const drive = new FakeDriveFacade();
  drive.permissionsPerFile.set('file_2', [{ id: 'p9', email: 'z@school.it', role: 'writer', tipo: 'user' }]);
  drive.throwOnListPermissions.add('file_1');
  const warn = jest.spyOn(LoggerService.prototype, 'warn').mockImplementation(() => {});
  const handlers = creaHandlersInfra({ db: db(), drive, roles, cdu, logger });
  const n = handlers['RIDUCI_PERMESSI']!({ tipo: 'RIDUCI_PERMESSI', su: 'LOG_DOCS' }, {});
  expect(n).toBe(1);
  expect(drive.roleChanges).toEqual([{ fileId: 'file_2', permissionId: 'p9', role: 'reader' }]);
  expect(warn).toHaveBeenCalledWith(expect.stringContaining('file_1'));
  warn.mockRestore();
});

test('VALIDA_DB delegates to the validator with the requested table subset', () => {
  const drive = new FakeDriveFacade();
  const calls: Array<string[] | undefined> = [];
  const validator = {
    esegui: (tabelle?: string[]) => {
      calls.push(tabelle);
      return { violazioni: [{}, {}], nome: 'Validazione DB - 2026-2027' };
    }
  };
  const handlers = creaHandlersInfra({ db: db(), drive, roles, cdu, logger, validator });
  expect(handlers['VALIDA_DB']!({ tipo: 'VALIDA_DB', tabelle: ['CLASSI'] }, {})).toBe(2);
  expect(calls).toEqual([['CLASSI']]);
});

test('VALIDA_DB is warned and skipped when no validator is wired', () => {
  const warn = jest.spyOn(LoggerService.prototype, 'warn').mockImplementation(() => {});
  const handlers = creaHandlersInfra({ db: db(), drive: new FakeDriveFacade(), roles, cdu, logger });
  expect(handlers['VALIDA_DB']!({ tipo: 'VALIDA_DB' }, {})).toBe(0);
  expect(warn).toHaveBeenCalledWith(expect.stringContaining('VALIDA_DB'));
  warn.mockRestore();
});
