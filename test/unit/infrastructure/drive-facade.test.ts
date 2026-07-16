import { DriveServiceFacade } from '../../../src/infrastructure/facades/DriveServiceFacade';

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

test('setPermission maps PermessoACL to the Drive v3 role and shares via PermissionService', () => {
  const { drive, perms } = fakeDrive();
  const facade = new DriveServiceFacade(drive as never, perms as never, ROOT);
  facade.setPermission('file_1', 'rossi@school.it', 'SCRITTURA');
  expect(perms.shareWithUsers).toHaveBeenCalledWith(
    ['file_1'],
    [{ type: 'user', role: 'writer', email: 'rossi@school.it' }],
    {}
  );
  facade.setPermission('file_1', 'bianchi@school.it', 'LETTURA');
  expect(perms.shareWithUsers).toHaveBeenLastCalledWith(
    ['file_1'],
    [{ type: 'user', role: 'reader', email: 'bianchi@school.it' }],
    {}
  );
  facade.setPermission('file_1', 'verdi@school.it', 'COMMENTO');
  expect(perms.shareWithUsers).toHaveBeenLastCalledWith(
    ['file_1'],
    [{ type: 'user', role: 'commenter', email: 'verdi@school.it' }],
    {}
  );
});

test('deleteFile trashes (not permanent delete) via deleteFiles', () => {
  const { drive, perms } = fakeDrive();
  const facade = new DriveServiceFacade(drive as never, perms as never, ROOT);
  facade.deleteFile('file_1');
  expect(drive.deleteFiles).toHaveBeenCalledWith(['file_1'], { permanently: false });
});

test('countFilesInFolder counts non-trashed children via searchFiles', () => {
  const { drive, perms } = fakeDrive();
  drive.searchFiles.mockReturnValueOnce([
    { id: 'a', name: 'a', mimeType: 'x' },
    { id: 'b', name: 'b', mimeType: 'x' }
  ]);
  const facade = new DriveServiceFacade(drive as never, perms as never, ROOT);
  expect(facade.countFilesInFolder('folder_1')).toBe(2);
});

test('getFileBlob returns the native Blob via getFileByIdStandard (11 §13)', () => {
  const { drive, perms } = fakeDrive();
  const facade = new DriveServiceFacade(drive as never, perms as never, ROOT);
  expect(facade.getFileBlob('file_1')).toBe('BLOB');
  expect(drive.getFileByIdStandard).toHaveBeenCalledWith('file_1');
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

describe('DriveServiceFacade — setPermission default role', () => {
  test('defaults to reader for an unrecognized permesso value', () => {
    const { drive } = fakeDrive();
    const perms = { shareWithUsers: jest.fn() };
    const facade = new DriveServiceFacade(drive as never, perms as never, ROOT);
    facade.setPermission('FILE1', 'a@b.com', 'RUOLO_INESISTENTE');
    expect(perms.shareWithUsers).toHaveBeenCalledWith(
      ['FILE1'],
      [{ type: 'user', role: 'reader', email: 'a@b.com' }],
      {}
    );
  });
});
