import { DriveServiceFacade } from '../../../src/infrastructure/facades/DriveServiceFacade';
import { AlberoCartelle } from '../../../src/infrastructure/services/AlberoCartelle';
import { FakeDatabase } from '../../fakes/FakeDatabase';

/**
 * A DriveService/PermissionService-shaped double matching the REAL vendored
 * bound API (14 §4, verified in harness/gaslibs.test.ts) — not the invented
 * findFolderByPath/copyFile/setPermission/trashFile/countFiles surface the
 * facade used to assume, which does not exist on the library.
 */
function fakeDrive() {
  const folders = new Map<string, { id: string; name: string; parents?: string[] }>(); // id -> metadata
  let seq = 0;
  const nextId = (): string => `id_${++seq}`;

  const drive = {
    searchFiles: jest.fn((query: string) => {
      // query shape: "'<parentId>' in parents and name = '<name>' and mimeType='...folder' and trashed=false"
      const parentMatch = /'([^']*)' in parents/.exec(query);
      const nameMatch = /name\s*=\s*'([^']*)'/.exec(query);
      const parent = parentMatch?.[1] ?? '';
      const name = nameMatch?.[1];
      return [...folders.values()].filter(
        (f) => (f.parents?.[0] ?? '') === parent && (name === undefined || f.name === name)
      );
    }),
    createFolder: jest.fn(
      (
        folderName: string,
        parentFolderId: string | null,
        options: { returnExistingIfFound?: boolean } = {}
      ) => {
        if (options.returnExistingIfFound === true) {
          const existing = [...folders.values()].find(
            (f) => f.name === folderName && (f.parents?.[0] ?? '') === (parentFolderId ?? '')
          );
          if (existing !== undefined) return existing;
        }
        const id = nextId();
        const folder = {
          id,
          name: folderName,
          parents: parentFolderId !== null ? [parentFolderId] : []
        };
        folders.set(id, folder);
        return folder;
      }
    ),
    copyFiles: jest.fn(
      (requests: Array<{ fileId: string; name?: string; destinationFolder?: string }>) => ({
        successful: requests.map((r) => ({
          id: r.fileId,
          status: 200,
          data: {
            id: nextId(),
            name: r.name ?? '',
            parents: r.destinationFolder !== undefined ? [r.destinationFolder] : []
          }
        })),
        failed: []
      })
    ),
    deleteFiles: jest.fn((fileIds: string | string[]) => ({
      successful: (Array.isArray(fileIds) ? fileIds : [fileIds]).map((id) => ({
        id,
        status: 204,
        data: null
      })),
      failed: []
    })),
    getFileByIdStandard: jest.fn(() => ({ getBlob: () => 'BLOB' })),
    getFiles: jest.fn(),
    getFileOwnerEmail: jest.fn(),
    folders // test-only escape hatch
  };
  const perms = {
    shareWithUsers: jest.fn(
      (fileIds: string | string[], permissions: Array<{ role: string; email: string }>) => ({
        successful: (Array.isArray(fileIds) ? fileIds : [fileIds]).flatMap((id) =>
          permissions.map((p) => ({ fileId: id, permission: p, statusCode: 200 }))
        ),
        failed: []
      })
    ),
    removeAccess: jest.fn()
  };
  return { drive, perms };
}

const ROOT = 'root_folder_id';

describe('folder status through the real vendored DriveService', () => {
  const globals = globalThis as unknown as { Drive?: unknown };
  const originalDrive = globals.Drive;

  afterEach(() => {
    if (originalDrive === undefined) delete globals.Drive;
    else globals.Drive = originalDrive;
  });

  function realFacade(get: () => unknown) {
    globals.Drive = {
      Files: { get, list: () => ({ files: [] }), create: () => ({ id: 'replacement_folder' }) }
    };
    const values = new Map<string, string>();
    const cache = {
      get: (key: string) => values.get(key) ?? null,
      put: (key: string, value: string) => values.set(key, value),
      remove: (key: string) => values.delete(key)
    };
    const drive = Reflect.construct(DriveService, [
      new LoggerService(), cache, new UtilsService(),
      { executeWithRetry: (operation: () => unknown) => operation() }
    ]) as DriveService;
    return { drive, facade: new DriveServiceFacade(drive, {} as PermissionService, ROOT) };
  }

  test.each([false, true])('refetches incomplete cached metadata before returning trashed=%s', (trashed) => {
    let metadata: Record<string, unknown> = { id: 'folder_1', name: 'Verbali' };
    const get = jest.fn(() => metadata);
    const { drive, facade } = realFacade(get);
    drive.getFiles('folder_1', { fields: 'id,name' });
    metadata = { id: 'folder_1', trashed };

    expect(facade.isFolderTrashed('folder_1')).toBe(trashed);
    expect(get).toHaveBeenLastCalledWith('folder_1', { fields: 'id,trashed' });
    expect(get).toHaveBeenCalledTimes(2);
  });

  test('a confirmed 404 marks a logged folder as missing', () => {
    const { facade } = realFacade(() => { throw Object.assign(new Error('Not found'), { code: 404 }); });
    expect(facade.isFolderTrashed('folder_1')).toBe(true);
  });

  test.each([403, 429, 503])('propagates lookup error %s and preserves LOG_FOLD', (code) => {
    const failure = Object.assign(new Error('Drive lookup failed'), { code });
    const { facade } = realFacade(() => { throw failure; });
    const logged = { ID: 'folder_1', PATH: 'Verbali', LINK: 'existing-link', CLASSI: '5A' };
    const db = new FakeDatabase({ LOG_FOLD: [logged] });
    const albero = new AlberoCartelle(facade, db);

    expect(() => albero.findOrCreate('Verbali', { classi: '3B' })).toThrow(failure);
    expect(db.table('LOG_FOLD').findAll()).toEqual([logged]);
  });

  test.each([null, { id: 'folder_1' }])('rejects an unconfirmed folder status: %j', (metadata) => {
    const { facade } = realFacade(() => metadata);
    expect(() => facade.isFolderTrashed('folder_1')).toThrow(/metadati.*folder_1/i);
  });
});

test('createFolder creates nested path segments under the SGSA root and returns the leaf id', () => {
  const { drive, perms } = fakeDrive();
  const facade = new DriveServiceFacade(drive as never, perms as never, ROOT);
  const leafId = facade.createFolder('Verbali/2025-2026/5A');
  expect(drive.createFolder).toHaveBeenCalledTimes(3); // Verbali, 2025-2026, 5A
  expect(drive.createFolder.mock.calls[0]).toEqual([
    'Verbali',
    ROOT,
    { returnExistingIfFound: true }
  ]);
  const secondResult = drive.createFolder.mock.results[1]!.value as { id: string };
  const thirdResult = drive.createFolder.mock.results[2]!.value as { id: string };
  expect(drive.createFolder.mock.calls[2]![1]).toBe(secondResult.id);
  expect(leafId).toBe(thirdResult.id);
});

test('createFolder is idempotent: creating the same path twice reuses intermediate + leaf segments', () => {
  const { drive, perms } = fakeDrive();
  const facade = new DriveServiceFacade(drive as never, perms as never, ROOT);
  const first = facade.createFolder('Verbali/5A');
  const second = facade.createFolder('Verbali/5A');
  expect(second).toBe(first);
  expect(drive.folders.size).toBe(2); // Verbali + 5A, not duplicated
});

test('findFolderByPath walks segments via searchFiles and returns null on the first missing segment', () => {
  const { drive, perms } = fakeDrive();
  const facade = new DriveServiceFacade(drive as never, perms as never, ROOT);
  const created = facade.createFolder('Verbali/5A');
  expect(facade.findFolderByPath('Verbali/5A')).toBe(created);
  expect(facade.findFolderByPath('Verbali/9Z')).toBeNull();
  expect(facade.findFolderByPath('Assente')).toBeNull();
});

test('findFileByName searches by name+parent, excluding folders and trashed files', () => {
  const { drive, perms } = fakeDrive();
  drive.searchFiles.mockImplementation((query: string) => {
    if (query.includes("'FOLDER_1' in parents") && query.includes("name = 'Verbale template'")) {
      return [{ id: 'tmpl_file_1', name: 'Verbale template', mimeType: 'application/vnd.google-apps.document' }];
    }
    return [];
  });
  const facade = new DriveServiceFacade(drive as never, perms as never, ROOT);
  expect(facade.findFileByName('FOLDER_1', 'Verbale template')).toBe('tmpl_file_1');
  expect(facade.findFileByName('FOLDER_1', 'Does not exist')).toBeNull();
  expect(drive.searchFiles).toHaveBeenCalledWith(
    "'FOLDER_1' in parents and name = 'Verbale template' and trashed=false",
    { maxResults: 1 }
  );
});

test('copyFile delegates to copyFiles and returns the new file id', () => {
  const { drive, perms } = fakeDrive();
  const facade = new DriveServiceFacade(drive as never, perms as never, ROOT);
  const fileId = facade.copyFile('tmpl_1', 'Verbale 5A', 'folder_1');
  expect(drive.copyFiles).toHaveBeenCalledWith(
    [{ fileId: 'tmpl_1', name: 'Verbale 5A', destinationFolder: 'folder_1' }],
    {}
  );
  expect(fileId).toMatch(/^id_/);
});

test('setPermissions groups grants by targetId+permesso into one shareWithUsers call per target/role pair, deduping emails but never merging targets', () => {
  const { drive, perms } = fakeDrive();
  const facade = new DriveServiceFacade(drive as never, perms as never, ROOT);
  facade.setPermissions([
    { targetId: 'file_1', email: 'rossi@school.it', permesso: 'SCRITTURA' },
    { targetId: 'file_1', email: 'rossi@school.it', permesso: 'SCRITTURA' }, // dup: still one email in the call
    { targetId: 'folder_1', email: 'rossi@school.it', permesso: 'SCRITTURA' }, // same email+role, different target: separate call, never merged with file_1
    { targetId: 'folder_1', email: 'bianchi@school.it', permesso: 'LETTURA' }
  ]);
  expect(perms.shareWithUsers).toHaveBeenCalledTimes(3);
  expect(perms.shareWithUsers).toHaveBeenCalledWith(
    ['file_1'],
    [{ type: 'user', role: 'writer', email: 'rossi@school.it' }],
    { sendNotificationEmail: false }
  );
  expect(perms.shareWithUsers).toHaveBeenCalledWith(
    ['folder_1'],
    [{ type: 'user', role: 'writer', email: 'rossi@school.it' }],
    { sendNotificationEmail: false }
  );
  expect(perms.shareWithUsers).toHaveBeenCalledWith(
    ['folder_1'],
    [{ type: 'user', role: 'reader', email: 'bianchi@school.it' }],
    { sendNotificationEmail: false }
  );
});

test('setPermissions never lets a file-only grantee leak onto the folder (or vice versa) when both use the same permesso', () => {
  const { drive, perms } = fakeDrive();
  const facade = new DriveServiceFacade(drive as never, perms as never, ROOT);
  facade.setPermissions([
    { targetId: 'file_1', email: 'file-only@school.it', permesso: 'LETTURA' },
    { targetId: 'folder_1', email: 'folder-only@school.it', permesso: 'LETTURA' }
  ]);
  const fileCall = perms.shareWithUsers.mock.calls.find((c: unknown[]) =>
    (c[0] as string[]).includes('file_1')
  );
  const folderCall = perms.shareWithUsers.mock.calls.find((c: unknown[]) =>
    (c[0] as string[]).includes('folder_1')
  );
  expect(fileCall![0]).toEqual(['file_1']);
  expect(fileCall![1]).toEqual([{ type: 'user', role: 'reader', email: 'file-only@school.it' }]);
  expect(folderCall![0]).toEqual(['folder_1']);
  expect(folderCall![1]).toEqual([
    { type: 'user', role: 'reader', email: 'folder-only@school.it' }
  ]);
});

test('setPermissions reports a Drive rejection (e.g. on a folder) after still attempting every other target', () => {
  const { drive, perms } = fakeDrive();
  perms.shareWithUsers.mockImplementation((fileIds: string | string[]) => {
    const id = Array.isArray(fileIds) ? fileIds[0] : fileIds;
    return id === 'folder_1'
      ? { successful: [], failed: [{ fileId: id, error: new Error('ruolo non valido'), statusCode: 400 }] }
      : { successful: [{ fileId: id, permission: {}, statusCode: 200 }], failed: [] };
  });
  const facade = new DriveServiceFacade(drive as never, perms as never, ROOT);
  expect(() =>
    facade.setPermissions([
      { targetId: 'folder_1', email: 'a@school.it', permesso: 'COMMENTO' },
      { targetId: 'file_1', email: 'a@school.it', permesso: 'LETTURA' }
    ])
  ).toThrow(/folder_1 \(commenter\): ruolo non valido/);
  expect(perms.shareWithUsers).toHaveBeenCalledTimes(2);
});

test('setPermissions is a no-op when there is nothing to grant', () => {
  const { drive, perms } = fakeDrive();
  const facade = new DriveServiceFacade(drive as never, perms as never, ROOT);
  facade.setPermissions([]);
  expect(perms.shareWithUsers).not.toHaveBeenCalled();
});

test('deleteFile trashes (not permanent delete) via deleteFiles', () => {
  const { drive, perms } = fakeDrive();
  const facade = new DriveServiceFacade(drive as never, perms as never, ROOT);
  facade.deleteFile('file_1');
  expect(drive.deleteFiles).toHaveBeenCalledWith(['file_1'], { permanently: false });
});

test('getFileBlob returns the native Blob via getFileByIdStandard (11 §13)', () => {
  const { drive, perms } = fakeDrive();
  const facade = new DriveServiceFacade(drive as never, perms as never, ROOT);
  expect(facade.getFileBlob('file_1')).toBe('BLOB');
  expect(drive.getFileByIdStandard).toHaveBeenCalledWith('file_1');
});

test('getFileOwnerEmail delegates directly to DriveService.getFileOwnerEmail', () => {
  const { drive, perms } = fakeDrive();
  drive.getFileOwnerEmail.mockReturnValue('owner@school.it');
  const facade = new DriveServiceFacade(drive as never, perms as never, ROOT);
  expect(facade.getFileOwnerEmail('file_1')).toBe('owner@school.it');
  expect(drive.getFileOwnerEmail).toHaveBeenCalledWith('file_1');
});

test('getFileOwnerEmail passes through null when the file has no owner', () => {
  const { drive, perms } = fakeDrive();
  drive.getFileOwnerEmail.mockReturnValue(null);
  const facade = new DriveServiceFacade(drive as never, perms as never, ROOT);
  expect(facade.getFileOwnerEmail('file_1')).toBeNull();
});

test('getFileText reads the body text via DocumentService.openStandard (E2E scenario 10)', () => {
  const { drive, perms } = fakeDrive();
  const getText = jest.fn(() => 'Report Complesso — nessun placeholder');
  const documents = { openStandard: jest.fn(() => ({ getBody: () => ({ getText }) })) };
  const facade = new DriveServiceFacade(drive as never, perms as never, ROOT, documents as never);
  expect(facade.getFileText('doc_1')).toBe('Report Complesso — nessun placeholder');
  expect(documents.openStandard).toHaveBeenCalledWith('doc_1');
  expect(getText).toHaveBeenCalled();
});

test('getFileText throws a clear error when no DocumentService was configured', () => {
  const { drive, perms } = fakeDrive();
  const facade = new DriveServiceFacade(drive as never, perms as never, ROOT);
  expect(() => facade.getFileText('doc_1')).toThrow(/nessun DocumentService configurato/);
});

describe('DriveServiceFacade — copyFile failure', () => {
  test('throws with the underlying error message when the copy fails', () => {
    const { perms } = fakeDrive();
    const drive = {
      copyFiles: jest
        .fn()
        .mockReturnValue({ successful: [], failed: [{ error: { message: 'quota exceeded' } }] })
    };
    const facade = new DriveServiceFacade(drive as never, perms as never, ROOT);
    expect(() => facade.copyFile('TPL', 'name', 'FOLDER')).toThrow(
      'Copia file TPL fallita: quota exceeded'
    );
  });

  test('throws with a fallback message when no failure detail is available', () => {
    const { perms } = fakeDrive();
    const drive = { copyFiles: jest.fn().mockReturnValue({ successful: [], failed: [] }) };
    const facade = new DriveServiceFacade(drive as never, perms as never, ROOT);
    expect(() => facade.copyFile('TPL', 'name', 'FOLDER')).toThrow(
      'Copia file TPL fallita: errore sconosciuto'
    );
  });
});

describe('countFilesInFolder', () => {
  it('counts non-trashed, non-folder files via searchFiles', () => {
    const drive = { searchFiles: jest.fn().mockReturnValue([{ id: 'a' }, { id: 'b' }, { id: 'c' }]) };
    const facade = new DriveServiceFacade(drive as never, {} as never, 'root');

    const count = facade.countFilesInFolder('folder123');

    expect(count).toBe(3);
    expect(drive.searchFiles).toHaveBeenCalledWith(
      expect.stringContaining("'folder123' in parents")
    );
    expect(drive.searchFiles).toHaveBeenCalledWith(expect.stringContaining('trashed=false'));
  });
});

describe('DriveServiceFacade — permission listing and role changes', () => {
  test('listPermissions maps the library shape onto DrivePermission', () => {
    const { drive } = fakeDrive();
    const permissions = {
      getPermissions: jest.fn(() => [
        { id: 'p1', emailAddress: 'a@x.it', role: 'writer', type: 'user' },
        { id: 'p2', role: 'writer', type: 'anyone' }
      ]),
      changeRolesByPermissionId: jest.fn(() => ({ successful: [], failed: [] }))
    };
    const facade = new DriveServiceFacade(drive as never, permissions as never, ROOT);

    expect(facade.listPermissions('f1')).toEqual([
      { id: 'p1', email: 'a@x.it', role: 'writer', tipo: 'user' },
      { id: 'p2', email: null, role: 'writer', tipo: 'anyone' }
    ]);
    expect(permissions.getPermissions).toHaveBeenCalledWith('f1');
  });

  test('changePermissionRoles returns only the failures', () => {
    const { drive } = fakeDrive();
    const permissions = {
      getPermissions: jest.fn(() => []),
      changeRolesByPermissionId: jest.fn(() => ({
        successful: [{ fileId: 'f1', permissionId: 'p1' }],
        failed: [{ fileId: 'f1', permissionId: 'p2', error: new Error('nope') }]
      }))
    };
    const facade = new DriveServiceFacade(drive as never, permissions as never, ROOT);

    const failures = facade.changePermissionRoles('f1', [
      { permissionId: 'p1', role: 'reader' },
      { permissionId: 'p2', role: 'reader' }
    ]);

    expect(permissions.changeRolesByPermissionId).toHaveBeenCalledWith('f1', [
      { permissionId: 'p1', newRole: 'reader' },
      { permissionId: 'p2', newRole: 'reader' }
    ]);
    expect(failures).toEqual([{ permissionId: 'p2', errore: 'nope' }]);
  });

  test('changePermissionRoles with no changes performs no API call', () => {
    const { drive } = fakeDrive();
    const permissions = {
      getPermissions: jest.fn(() => []),
      changeRolesByPermissionId: jest.fn()
    };
    const facade = new DriveServiceFacade(drive as never, permissions as never, ROOT);
    expect(facade.changePermissionRoles('f1', [])).toEqual([]);
    expect(permissions.changeRolesByPermissionId).not.toHaveBeenCalled();
  });

  test('removePermissions delegates to removeAccess by permission id and returns only the failures', () => {
    const { drive } = fakeDrive();
    const permissions = {
      getPermissions: jest.fn(() => []),
      removeAccess: jest.fn(() => ({
        successful: [{ fileId: 'f1', permissionId: 'p1', statusCode: 204 }],
        failed: [{ fileId: 'f1', permissionId: 'p2', error: new Error('nope'), statusCode: 500 }]
      }))
    };
    const facade = new DriveServiceFacade(drive as never, permissions as never, ROOT);

    const failures = facade.removePermissions('f1', ['p1', 'p2']);

    expect(permissions.removeAccess).toHaveBeenCalledWith('f1', ['p1', 'p2']);
    expect(failures).toEqual([{ permissionId: 'p2', errore: 'nope' }]);
  });

  test('removePermissions with no permission ids performs no API call', () => {
    const { drive } = fakeDrive();
    const permissions = { getPermissions: jest.fn(() => []), removeAccess: jest.fn() };
    const facade = new DriveServiceFacade(drive as never, permissions as never, ROOT);
    expect(facade.removePermissions('f1', [])).toEqual([]);
    expect(permissions.removeAccess).not.toHaveBeenCalled();
  });
});
