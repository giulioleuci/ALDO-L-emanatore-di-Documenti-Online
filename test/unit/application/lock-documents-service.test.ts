import { LockDocumentsService } from '../../../src/application/services/LockDocumentsService';
import { FakeDriveFacade } from '../../fakes/FakeDriveFacade';
import { LogDocumento } from '../../../src/domain/entities/LogDocumento';
import type { ILogDocumentoRepository } from '../../../src/domain/repositories/ILogDocumentoRepository';

function logDocs(ids: string[]): ILogDocumentoRepository {
  const docs = ids.map((id) => new LogDocumento({ ID: id, ID_GEN: 'G', TIPO: 'T', NOME: id }));
  return { findAll: () => docs, findByClasse: () => [], findByUtente: () => [] };
}

function drive(): FakeDriveFacade {
  const facade = new FakeDriveFacade();
  facade.permissionsPerFile.set('f1', [
    { id: 'p1', email: 'a@x.it', role: 'writer', tipo: 'user' },
    { id: 'p2', email: 'b@x.it', role: 'reader', tipo: 'user' },
    { id: 'p3', email: 'owner@x.it', role: 'owner', tipo: 'user' },
    { id: 'p4', email: null, role: 'writer', tipo: 'anyone' }
  ]);
  facade.permissionsPerFile.set('f2', [{ id: 'q1', email: 'c@x.it', role: 'reader', tipo: 'user' }]);
  return facade;
}

test('downgrades every writer, including link-wide grants, and leaves owners alone', () => {
  const facade = drive();
  const esito = new LockDocumentsService({ logDocs: logDocs(['f1', 'f2']), drive: facade }).bloccaTutti();

  expect(facade.roleChanges).toEqual([
    { fileId: 'f1', permissionId: 'p1', role: 'reader' },
    { fileId: 'f1', permissionId: 'p4', role: 'reader' }
  ]);
  expect(esito).toEqual({
    totaleDocumenti: 2,
    documentiModificati: 1,
    permessiDeclassati: 2,
    falliti: []
  });
});

test('a per-permission failure is reported without aborting the run', () => {
  const facade = drive();
  facade.permissionFailures.set('p1', 'quota');
  const esito = new LockDocumentsService({ logDocs: logDocs(['f1', 'f2']), drive: facade }).bloccaTutti();

  expect(esito.permessiDeclassati).toBe(1);
  expect(esito.falliti).toEqual([{ fileId: 'f1', permissionId: 'p1', errore: 'quota' }]);
});

test('a file whose permissions cannot be read is reported and the run continues', () => {
  const facade = drive();
  facade.listPermissions = (fileId: string) => {
    if (fileId === 'f1') throw new Error('File not found');
    return [];
  };
  const esito = new LockDocumentsService({ logDocs: logDocs(['f1', 'f2']), drive: facade }).bloccaTutti();

  expect(esito.totaleDocumenti).toBe(2);
  expect(esito.falliti).toEqual([{ fileId: 'f1', permissionId: null, errore: 'File not found' }]);
});

test('rows without a Drive file id are skipped', () => {
  const facade = drive();
  const docs = { findAll: () => [new LogDocumento({ NOME: 'senza id' })], findByClasse: () => [], findByUtente: () => [] };
  const esito = new LockDocumentsService({ logDocs: docs, drive: facade }).bloccaTutti();
  expect(esito).toEqual({ totaleDocumenti: 1, documentiModificati: 0, permessiDeclassati: 0, falliti: [] });
});
