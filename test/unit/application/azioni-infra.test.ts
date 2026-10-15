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

test('AGGIORNA_PERMESSI continues with the next target after one target fails', () => {
  const drive = new FakeDriveFacade();
  drive.throwOnListPermissions.add('file_1');
  const handlers = creaHandlersInfra({ db: db(), drive, roles, cdu, logger });
  // No criteri: matches every LOG_DOCS row (file_1 and file_2) — file_1's
  // listPermissions throws, file_2 must still get its grant.
  const n = handlers['AGGIORNA_PERMESSI']!(
    { tipo: 'AGGIORNA_PERMESSI', su: 'LOG_DOCS', emails: ['x@school.it'], permesso: 'LETTURA' },
    {}
  );
  expect(n).toBe(1);
  expect(drive.permissions).toEqual([{ fileId: 'file_2', email: 'x@school.it', permesso: 'LETTURA' }]);
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

test('REVOCA_PERMESSI removes ACLs for emails no longer in the resolved ruolo, leaving expected ones untouched', () => {
  const drive = new FakeDriveFacade();
  drive.permissionsPerFile.set('file_1', [
    { id: 'p1', email: 'coord@school.it', role: 'reader', tipo: 'user' },
    { id: 'p2', email: 'ex-supplente@school.it', role: 'writer', tipo: 'user' }
  ]);
  const handlers = creaHandlersInfra({ db: db(), drive, roles, cdu, logger });
  const n = handlers['REVOCA_PERMESSI']!(
    { tipo: 'REVOCA_PERMESSI', su: 'LOG_DOCS', ruolo: 'COORDINATORI' },
    { ID: 'file_1' }
  );
  expect(n).toBe(1);
  expect(drive.removed).toEqual([{ fileId: 'file_1', permissionId: 'p2' }]);
});

test('REVOCA_PERMESSI never touches owner/organizer permissions', () => {
  const drive = new FakeDriveFacade();
  drive.permissionsPerFile.set('file_1', [
    { id: 'p1', email: 'ds@school.it', role: 'owner', tipo: 'user' }
  ]);
  const handlers = creaHandlersInfra({ db: db(), drive, roles, cdu, logger });
  const n = handlers['REVOCA_PERMESSI']!(
    { tipo: 'REVOCA_PERMESSI', su: 'LOG_DOCS', ruolo: 'COORDINATORI' },
    { ID: 'file_1' }
  );
  expect(n).toBe(0);
  expect(drive.removed).toEqual([]);
});

test('REVOCA_PERMESSI is a safe no-op when the resolved roster is empty, never wiping every grant', () => {
  const drive = new FakeDriveFacade();
  drive.permissionsPerFile.set('file_1', [
    { id: 'p1', email: 'a@school.it', role: 'reader', tipo: 'user' }
  ]);
  const noRoles = { risolvi: () => [] };
  const handlers = creaHandlersInfra({ db: db(), drive, roles: noRoles, cdu, logger });
  const n = handlers['REVOCA_PERMESSI']!(
    { tipo: 'REVOCA_PERMESSI', su: 'LOG_DOCS', ruolo: 'COORDINATORI' },
    { ID: 'file_1' }
  );
  expect(n).toBe(0);
  expect(drive.removed).toEqual([]);
});

test('REVOCA_PERMESSI isolates a Drive failure on one target and keeps revoking the others', () => {
  const drive = new FakeDriveFacade();
  drive.permissionsPerFile.set('file_2', [
    { id: 'p9', email: 'ex@school.it', role: 'reader', tipo: 'user' }
  ]);
  drive.throwOnListPermissions.add('file_1');
  const warn = jest.spyOn(LoggerService.prototype, 'warn').mockImplementation(() => {});
  const handlers = creaHandlersInfra({ db: db(), drive, roles, cdu, logger });
  const n = handlers['REVOCA_PERMESSI']!(
    { tipo: 'REVOCA_PERMESSI', su: 'LOG_DOCS', ruolo: 'COORDINATORI' },
    {}
  );
  expect(n).toBe(1);
  expect(drive.removed).toEqual([{ fileId: 'file_2', permissionId: 'p9' }]);
  expect(warn).toHaveBeenCalledWith(expect.stringContaining('file_1'));
  warn.mockRestore();
});

test('REVOCA_PERMESSI reports a failed removal without counting it', () => {
  const drive = new FakeDriveFacade();
  drive.permissionsPerFile.set('file_1', [
    { id: 'p1', email: 'ex@school.it', role: 'reader', tipo: 'user' }
  ]);
  drive.permissionFailures.set('p1', 'Drive rifiuta');
  const handlers = creaHandlersInfra({ db: db(), drive, roles, cdu, logger });
  const n = handlers['REVOCA_PERMESSI']!(
    { tipo: 'REVOCA_PERMESSI', su: 'LOG_DOCS', ruolo: 'COORDINATORI' },
    { ID: 'file_1' }
  );
  expect(n).toBe(0);
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

describe('AGGIORNA_PERMESSI su cartelle selezionate per CONF_DOC generatore (target)', () => {
  function dbVerbali(): FakeDatabase {
    const tables = fixtureTables();
    tables['LOG_DOCS'] = [
      { ID: 'f5A', ID_GEN: 'VERBALI_CDC_OTTOBRE', TIPO: 'VERBALE', SOTTOTIPO: '', CLASSI: '5A', UTENTI: '', MATERIE: '', PATH: 'Verbali/5A', STATO: 'GENERATO' },
      { ID: 'f5B', ID_GEN: 'VERBALI_CDC_OTTOBRE', TIPO: 'VERBALE', SOTTOTIPO: '', CLASSI: '5B', UTENTI: '', MATERIE: '', PATH: 'Verbali/5B', STATO: 'GENERATO' },
      { ID: 'fSet', ID_GEN: 'VERBALI_CDC_SETTEMBRE', TIPO: 'VERBALE', SOTTOTIPO: '', CLASSI: '4A', UTENTI: '', MATERIE: '', PATH: 'Verbali/4A', STATO: 'GENERATO' }
    ];
    // Verbali/5A was first created by another CONF_DOC (ID_GEN keeps the first generator);
    // LOG_FOLD.CLASSI is empty because REGISTRA_FOLD was not configured.
    tables['LOG_FOLD'] = [
      { ID: 'fold5A', ID_GEN: 'VERBALI_CDC_SETTEMBRE', TIPO: 'VERBALE', NOME: '5A', PATH: 'Verbali/5A', CLASSI: '', UTENTI: '', MATERIE: '' },
      { ID: 'fold5B', ID_GEN: 'VERBALI_CDC_OTTOBRE', TIPO: 'VERBALE', NOME: '5B', PATH: 'Verbali/5B', CLASSI: '', UTENTI: '', MATERIE: '' },
      { ID: 'fold4A', ID_GEN: 'VERBALI_CDC_SETTEMBRE', TIPO: 'VERBALE', NOME: '4A', PATH: 'Verbali/4A', CLASSI: '', UTENTI: '', MATERIE: '' }
    ];
    return new FakeDatabase(tables);
  }

  test('selects every folder holding documents of the target CONF_DOC, even when LOG_FOLD.ID_GEN is another CONF_DOC', () => {
    const drive = new FakeDriveFacade();
    const handlers = creaHandlersInfra({ db: dbVerbali(), drive, roles, cdu, logger });
    handlers['AGGIORNA_PERMESSI']!(
      { tipo: 'AGGIORNA_PERMESSI', su: 'LOG_FOLD', target: 'VERBALI_CDC_OTTOBRE', ruolo: 'CDC', permesso: 'LETTURA' },
      {}
    );
    expect(drive.permissions.map((p) => p.fileId).sort()).toEqual(['fold5A', 'fold5B']);
  });

  test('criteri narrow the target CONF_DOC documents (CLASSI) and so the folders, without needing LOG_FOLD.CLASSI', () => {
    const drive = new FakeDriveFacade();
    const handlers = creaHandlersInfra({ db: dbVerbali(), drive, roles, cdu, logger });
    handlers['AGGIORNA_PERMESSI']!(
      { tipo: 'AGGIORNA_PERMESSI', su: 'LOG_FOLD', target: 'VERBALI_CDC_OTTOBRE', ruolo: 'CDC', permesso: 'LETTURA' },
      { CLASSI: '5B' }
    );
    expect(drive.permissions.map((p) => p.fileId)).toEqual(['fold5B']);
  });

  test('REVOCA_PERMESSI and RIDUCI_PERMESSI honour target on folders too', () => {
    const drive = new FakeDriveFacade();
    drive.permissionsPerFile.set('fold5B', [
      { id: 'p1', email: 'out@school.it', role: 'writer', tipo: 'user' }
    ]);
    const handlers = creaHandlersInfra({ db: dbVerbali(), drive, roles, cdu, logger });
    handlers['RIDUCI_PERMESSI']!(
      { tipo: 'RIDUCI_PERMESSI', su: 'LOG_FOLD', target: 'VERBALI_CDC_OTTOBRE' },
      { CLASSI: '5B' }
    );
    expect(drive.roleChanges).toEqual([{ fileId: 'fold5B', permissionId: 'p1', role: 'reader' }]);
  });

  test('target on LOG_DOCS restricts to documents generated by that CONF_DOC', () => {
    const drive = new FakeDriveFacade();
    const handlers = creaHandlersInfra({ db: dbVerbali(), drive, roles, cdu, logger });
    handlers['AGGIORNA_PERMESSI']!(
      { tipo: 'AGGIORNA_PERMESSI', su: 'LOG_DOCS', target: 'VERBALI_CDC_SETTEMBRE', ruolo: 'CDC', permesso: 'LETTURA' },
      {}
    );
    expect(drive.permissions.map((p) => p.fileId)).toEqual(['fSet']);
  });

  test('profondita never mixes historical LOG_DOCS ids into a folder selection', () => {
    const drive = new FakeDriveFacade();
    const storico = { idsMatching: jest.fn(() => ['old_file']) } as never;
    const handlers = creaHandlersInfra({ db: dbVerbali(), drive, roles, cdu, logger, storico });
    handlers['AGGIORNA_PERMESSI']!(
      { tipo: 'AGGIORNA_PERMESSI', su: 'LOG_FOLD', target: 'VERBALI_CDC_OTTOBRE', ruolo: 'CDC', permesso: 'LETTURA', profondita: 2 },
      {}
    );
    expect(drive.permissions.map((p) => p.fileId)).not.toContain('old_file');
  });
});

describe('RIALLINEA_PERMESSI_DA_CONF (file e cartelle secondo CONF_DOC.PERMESSI)', () => {
  const engine = { evaluateBoolean: (expr: string) => expr !== 'false' } as never;
  const rolesByName = {
    risolvi: (ruolo: string) =>
      (ruolo === 'COORD' ? ['coord@school.it'] : ruolo === 'CDC' ? ['cdc1@school.it', 'cdc2@school.it'] : []).map((e) =>
        Email.of(e)
      )
  };

  function dbConf(permessi: unknown): FakeDatabase {
    const tables = fixtureTables();
    tables['CONF_DOC'] = [
      { ID: 'VERBALI', PERMESSI: permessi === null ? '' : JSON.stringify(permessi) },
      { ID: 'ALTRO', PERMESSI: JSON.stringify({ folder: [{ ruolo: 'COORD', permesso: 'SCRITTURA' }] }) }
    ];
    tables['LOG_DOCS'] = [
      { ID: 'v5A', ID_GEN: 'VERBALI', CLASSI: '5A', PATH: 'Verbali/5A' },
      { ID: 'a5A', ID_GEN: 'ALTRO', CLASSI: '5A', PATH: 'Verbali/5A' },
      { ID: 'v5B', ID_GEN: 'VERBALI', CLASSI: '5B', PATH: 'Verbali/5B' }
    ];
    tables['LOG_FOLD'] = [
      { ID: 'fold5A', ID_GEN: 'VERBALI', PATH: 'Verbali/5A' },
      { ID: 'fold5B', ID_GEN: 'VERBALI', PATH: 'Verbali/5B' }
    ];
    return new FakeDatabase(tables);
  }
  const permessi = {
    file: [{ ruolo: 'COORD', permesso: 'SCRITTURA' }],
    folder: [{ ruolo: 'CDC', permesso: 'LETTURA' }]
  };
  const azione = { tipo: 'RIALLINEA_PERMESSI_DA_CONF', target: 'VERBALI' };

  test('grants file ACL on the document and folder ACL on its folder', () => {
    const drive = new FakeDriveFacade();
    const h = creaHandlersInfra({ db: dbConf(permessi), drive, roles: rolesByName, cdu, engine, logger });
    const n = h['RIALLINEA_PERMESSI_DA_CONF']!(azione, { CLASSI: '5A' });
    expect(n).toBe(3);
    expect(drive.permissions).toEqual(
      expect.arrayContaining([
        { fileId: 'v5A', email: 'coord@school.it', permesso: 'SCRITTURA' },
        { fileId: 'fold5A', email: 'cdc1@school.it', permesso: 'LETTURA' },
        { fileId: 'fold5A', email: 'cdc2@school.it', permesso: 'LETTURA' }
      ])
    );
    expect(drive.permissions.some((p) => p.fileId === 'v5B' || p.fileId === 'fold5B')).toBe(false);
  });

  test('is idempotent: already aligned ACLs cause no writes; a mismatched role is changed', () => {
    const drive = new FakeDriveFacade();
    drive.permissionsPerFile.set('v5A', [{ id: 'p1', email: 'coord@school.it', role: 'reader', tipo: 'user' }]);
    drive.permissionsPerFile.set('fold5A', [
      { id: 'p2', email: 'cdc1@school.it', role: 'reader', tipo: 'user' },
      { id: 'p3', email: 'cdc2@school.it', role: 'reader', tipo: 'user' }
    ]);
    const h = creaHandlersInfra({ db: dbConf(permessi), drive, roles: rolesByName, cdu, engine, logger });
    const n = h['RIALLINEA_PERMESSI_DA_CONF']!(azione, { CLASSI: '5A' });
    expect(n).toBe(1);
    expect(drive.roleChanges).toEqual([{ fileId: 'v5A', permissionId: 'p1', role: 'writer' }]);
    expect(drive.permissions).toEqual([]);
  });

  test('skips an entry whose condizione is false', () => {
    const drive = new FakeDriveFacade();
    const conf = { file: [], folder: [{ ruolo: 'CDC', permesso: 'LETTURA', condizione: 'false' }] };
    const h = creaHandlersInfra({ db: dbConf(conf), drive, roles: rolesByName, cdu, engine, logger });
    expect(h['RIALLINEA_PERMESSI_DA_CONF']!(azione, { CLASSI: '5A' })).toBe(0);
    expect(drive.permissions).toEqual([]);
  });

  test('a folder shared by documents of two CONF_DOC gets the union, highest permesso wins', () => {
    const drive = new FakeDriveFacade();
    const h = creaHandlersInfra({ db: dbConf(permessi), drive, roles: rolesByName, cdu, engine, logger });
    h['RIALLINEA_PERMESSI_DA_CONF']!({ tipo: 'RIALLINEA_PERMESSI_DA_CONF' }, { CLASSI: '5A' });
    const fold = drive.permissions.filter((p) => p.fileId === 'fold5A');
    expect(fold).toEqual(
      expect.arrayContaining([
        { fileId: 'fold5A', email: 'cdc1@school.it', permesso: 'LETTURA' },
        { fileId: 'fold5A', email: 'coord@school.it', permesso: 'SCRITTURA' }
      ])
    );
    expect(fold).toHaveLength(3);
  });

  test('revoca removes non-owner ACLs outside the prescribed set, never owners', () => {
    const drive = new FakeDriveFacade();
    drive.permissionsPerFile.set('fold5A', [
      { id: 'p1', email: 'cdc1@school.it', role: 'reader', tipo: 'user' },
      { id: 'p2', email: 'cdc2@school.it', role: 'reader', tipo: 'user' },
      { id: 'p3', email: 'uscito@school.it', role: 'reader', tipo: 'user' },
      { id: 'p4', email: 'owner@school.it', role: 'owner', tipo: 'user' }
    ]);
    const h = creaHandlersInfra({ db: dbConf(permessi), drive, roles: rolesByName, cdu, engine, logger });
    h['RIALLINEA_PERMESSI_DA_CONF']!({ ...azione, revoca: true }, { CLASSI: '5A' });
    expect(drive.removed).toEqual([{ fileId: 'fold5A', permissionId: 'p3' }]);
  });

  test('revoca never revokes everyone when the prescribed set resolves empty', () => {
    const drive = new FakeDriveFacade();
    drive.permissionsPerFile.set('fold5A', [{ id: 'p1', email: 'x@school.it', role: 'reader', tipo: 'user' }]);
    const conf = { folder: [{ ruolo: 'NESSUNO', permesso: 'LETTURA' }] };
    const h = creaHandlersInfra({ db: dbConf(conf), drive, roles: rolesByName, cdu, engine, logger });
    h['RIALLINEA_PERMESSI_DA_CONF']!({ ...azione, revoca: true }, { CLASSI: '5A' });
    expect(drive.removed).toEqual([]);
  });

  test('a document whose CONF_DOC has no PERMESSI is skipped without failing the others', () => {
    const drive = new FakeDriveFacade();
    const h = creaHandlersInfra({ db: dbConf(null), drive, roles: rolesByName, cdu, engine, logger });
    expect(h['RIALLINEA_PERMESSI_DA_CONF']!(azione, {})).toBe(0);
  });

  test('without an expression engine the action is skipped', () => {
    const drive = new FakeDriveFacade();
    const h = creaHandlersInfra({ db: dbConf(permessi), drive, roles: rolesByName, cdu, logger });
    expect(h['RIALLINEA_PERMESSI_DA_CONF']!(azione, {})).toBe(0);
  });
});
