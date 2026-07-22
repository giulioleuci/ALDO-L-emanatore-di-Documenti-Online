# MASTER.TEST_MODE Email Redirect Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When `MASTER.TEST_MODE` is `true` for the current school year, every outgoing ALDO email is automatically redirected to the Drive owner of the MASTER spreadsheet (To only, CC/BCC suppressed), with zero pipeline changes — reusing `EmailNotificationService`'s existing `enableTestMode`/`disableTestMode` mechanism.

**Architecture:** Add a `getFileOwnerEmail` primitive to GasLibraryFactory's `GoogleApiWrapper` `DriveService` (composing its existing `getFiles`/`owners` metadata fetch — no new Drive API shape), vendor it into ALDO, wrap it in `IDriveFacade`, add `MASTER.TEST_MODE` to the schema/`MasterConfig`, and call `EmailNotificationService.enableTestMode(ownerEmail)` once from `initAldo()` when `annoCorrente.testMode` is true.

**Tech Stack:** TypeScript (ALDO, `ts-jest`), JavaScript ES modules (GasLibraryFactory, Jest), Google Apps Script V8 runtime, Drive Advanced API v2/v3 (`Drive.Files.get`).

## Global Constraints

- Native GAS globals (`DriveApp`, etc.) may only be touched inside `GoogleApiWrapper` (L2) — this plan adds no new native-global usage outside it.
- Never edit `dist/*` or `vendor/gaslibs.Code.js` by hand — `vendor/gaslibs.Code.js` is regenerated only via `npm run refresh:vendor`.
- GasLibraryFactory changes ship first and are vendored in; ALDO code must never call a GasLibraryFactory method that doesn't exist yet in the vendored bundle.
- `EmailNotificationService.enableTestMode`/`disableTestMode` already implement the required redirect semantics (`src/application/services/EmailNotificationService.ts:142-149`) — do not modify `SendEmailStep`/`emailSteps.ts`.
- Follow this repo's existing boolean-column parsing convention exactly: `data[COL_X] === true` (see `src/domain/entities/Alunno.ts:34-36`).

---

## Task 1: GasLibraryFactory — `DriveService.getFileOwnerEmail`

**Files:**
- Modify: `GasLibraryFactory/GoogleApiWrapper/src/services/drive/DriveMetadataService.js`
- Modify: `GasLibraryFactory/GoogleApiWrapper/src/services/DriveService.js:96`
- Modify: `GasLibraryFactory/GoogleApiWrapper/src/services/__tests__/DriveService.test.js`
- Modify: `GasLibraryFactory/DOCS_LIBS/GoogleApiWrapper_docs.md`

**Interfaces:**
- Produces: `DriveService.prototype.getFileOwnerEmail(fileId: string): string | null` — delegated onto every `DriveService` instance exactly like `getFiles`/`searchFiles` already are (`DriveService.js` constructor, `metadataMethods` array).

- [ ] **Step 1: Write the failing test**

Add to `GasLibraryFactory/GoogleApiWrapper/src/services/__tests__/DriveService.test.js`, immediately after the existing `describe('getFiles() Method', ...)` block (after line 452, before the `searchFiles()` describe block):

```js
  // ===================================================================
  // getFileOwnerEmail() METHOD
  // ===================================================================

  describe('getFileOwnerEmail() Method', () => {
    it('returns the first owner email when the file has an owner', () => {
      global.Drive = {
        Files: {
          get: jest.fn().mockImplementation(() => ({
            id: 'fileId1',
            owners: [{ emailAddress: 'owner@school.it', displayName: 'Owner' }]
          }))
        }
      };

      const result = service.getFileOwnerEmail('fileId1');

      expect(result).toBe('owner@school.it');
    });

    it('returns null when the file has no owners (e.g. a Shared Drive file)', () => {
      global.Drive = {
        Files: {
          get: jest.fn().mockImplementation(() => ({ id: 'fileId1', owners: [] }))
        }
      };

      const result = service.getFileOwnerEmail('fileId1');

      expect(result).toBeNull();
    });

    it('goes through getFiles (caching + retry), not a separate Drive.Files.get call shape', () => {
      global.Drive = {
        Files: {
          get: jest.fn().mockImplementation(() => ({
            id: 'fileId1',
            owners: [{ emailAddress: 'owner@school.it' }]
          }))
        }
      };

      service.getFileOwnerEmail('fileId1');

      expect(global.Drive.Files.get).toHaveBeenCalledWith('fileId1', {
        fields: 'id,name,mimeType,parents,modifiedTime,createdTime,webViewLink,size,owners'
      });
    });
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `GasLibraryFactory/`): `npx jest GoogleApiWrapper/src/services/__tests__/DriveService.test.js -t "getFileOwnerEmail"`
Expected: FAIL — `service.getFileOwnerEmail is not a function`

- [ ] **Step 3: Implement `getFileOwnerEmail` in `DriveMetadataService`**

In `GasLibraryFactory/GoogleApiWrapper/src/services/drive/DriveMetadataService.js`, add this method to the `DriveMetadataService` class, immediately after `getFiles` (after line 144, before `searchFiles`):

```js
  /**
   * @description Returns the email address of a Drive file's owner, reusing `getFiles`'
   * caching/retry behaviour (the `owners` field is already part of its default field set).
   * @param {string} fileId Resource ID.
   * @returns {string|null} Owner email, or null when no owner is present (e.g. a Shared Drive file).
   * @throws {ServiceError} On execution failure.
   */
  getFileOwnerEmail(fileId) {
    const metadata = this.getFiles(fileId);
    const owners = metadata && metadata.owners;
    return owners && owners.length > 0 ? owners[0].emailAddress : null;
  }
```

- [ ] **Step 4: Delegate it on `DriveService`**

In `GasLibraryFactory/GoogleApiWrapper/src/services/DriveService.js:96`, change:

```js
    const metadataMethods = ['updateMetadata', 'getFiles', 'searchFiles'];
```

to:

```js
    const metadataMethods = ['updateMetadata', 'getFiles', 'searchFiles', 'getFileOwnerEmail'];
```

- [ ] **Step 5: Run test to verify it passes**

Run (from `GasLibraryFactory/`): `npx jest GoogleApiWrapper/src/services/__tests__/DriveService.test.js`
Expected: PASS (all tests in the file, including the 3 new ones)

- [ ] **Step 6: Document it**

In `GasLibraryFactory/DOCS_LIBS/GoogleApiWrapper_docs.md`, add a new bullet to the end of the `## 🛠️ Casi d'Uso comuni` section (after the existing `DocumentService.createDocument` bullet, before the closing of that section):

```markdown
- `DriveService.getFileOwnerEmail(fileId)` — risolve l'indirizzo email del proprietario Drive di un file (riusa la cache/retry di `getFiles`, che già richiede il campo `owners`). Ritorna `null` se il file non ha un proprietario risolvibile (es. file su Shared Drive).
```

- [ ] **Step 7: Commit**

```bash
cd "GasLibraryFactory" && git add GoogleApiWrapper/src/services/drive/DriveMetadataService.js GoogleApiWrapper/src/services/DriveService.js GoogleApiWrapper/src/services/__tests__/DriveService.test.js DOCS_LIBS/GoogleApiWrapper_docs.md && git commit -m "feat: add DriveService.getFileOwnerEmail"
```

---

## Task 2: Vendor refresh + ambient types + harness verification

**Files:**
- Modify: `vendor/gaslibs.Code.js`, `vendor/CHECKSUM`, `vendor/VERSION` (generated, not hand-edited)
- Modify: `types/gaslibs/index.d.ts:272-299`
- Modify: `test/unit/harness/gaslibs.test.ts:132-148`

**Interfaces:**
- Consumes: Task 1's `DriveService.prototype.getFileOwnerEmail`.
- Produces: ambient TypeScript type `DriveService.getFileOwnerEmail(fileId: string): string | null`, usable from any ALDO `.ts` file without an import (global ambient declaration).

- [ ] **Step 1: Refresh the vendored bundle**

Run (from ALDO root): `npm run refresh:vendor`
Expected output ends with: `vendor: refreshed gaslibs.Code.js (v..., sha256 ...)`

- [ ] **Step 2: Verify the checksum**

Run: `npm run verify:vendor`
Expected: `vendor: checksum OK`

- [ ] **Step 3: Confirm the new method reached the bundle**

Run: `grep -c "getFileOwnerEmail" vendor/gaslibs.Code.js`
Expected: a number `>= 1` (the minified/readable bundle contains the string)

- [ ] **Step 4: Write the failing ambient-type + harness test**

In `test/unit/harness/gaslibs.test.ts`, extend the existing test at line 132 (`'vendored DriveService/PermissionService instances expose the real bound API surface'`) — add one line after line 145 (`expect(typeof drive.searchFiles).toBe('function');`):

```ts
  expect(typeof drive.getFileOwnerEmail).toBe('function');
```

- [ ] **Step 5: Run test to verify it fails (TypeScript compile error first)**

Run: `npx jest --config jest.config.cjs test/unit/harness/gaslibs.test.ts`
Expected: FAIL — `ts-jest` compile error, `Property 'getFileOwnerEmail' does not exist on type 'DriveService'`

- [ ] **Step 6: Add the ambient type**

In `types/gaslibs/index.d.ts`, inside the `class DriveService { ... }` block (lines 272-299), add after `searchFiles` (after line 298, before the closing `}` at line 299):

```ts
    /** Owner email of the Drive file, or null when none is present (e.g. a Shared Drive file). */
    getFileOwnerEmail(fileId: string): string | null;
```

- [ ] **Step 7: Run test to verify it passes**

Run: `npx jest --config jest.config.cjs test/unit/harness/gaslibs.test.ts`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add vendor/gaslibs.Code.js vendor/CHECKSUM vendor/VERSION types/gaslibs/index.d.ts test/unit/harness/gaslibs.test.ts
git commit -m "chore: vendor GasLibraryFactory's getFileOwnerEmail and add its ambient type"
```

---

## Task 3: ALDO `IDriveFacade.getFileOwnerEmail`

**Files:**
- Modify: `src/infrastructure/facades/DriveServiceFacade.ts`
- Modify: `test/fakes/FakeDriveFacade.ts`
- Modify: `test/unit/infrastructure/drive-facade.test.ts`

**Interfaces:**
- Consumes: Task 2's ambient `DriveService.getFileOwnerEmail(fileId: string): string | null`.
- Produces: `IDriveFacade.getFileOwnerEmail(fileId: string): string | null`, implemented by both `DriveServiceFacade` (real) and `FakeDriveFacade` (test double) — every existing `IDriveFacade` consumer/test double must implement this new method or TypeScript compilation fails.

- [ ] **Step 1: Write the failing test**

In `test/unit/infrastructure/drive-facade.test.ts`, add `getFileOwnerEmail: jest.fn()` to the `drive` object literal inside `fakeDrive()` (after line 70, `getFiles: jest.fn(),`):

```ts
    getFiles: jest.fn(),
    getFileOwnerEmail: jest.fn(),
    folders // test-only escape hatch
```

Then add a new test after the `getFileBlob` test (after line 169, before `describe('DriveServiceFacade — copyFile failure', ...)`):

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --config jest.config.cjs test/unit/infrastructure/drive-facade.test.ts`
Expected: FAIL — TypeScript error, `Property 'getFileOwnerEmail' is missing in type ... IDriveFacade` (from `DriveServiceFacade` not yet implementing it), plus the two new tests fail

- [ ] **Step 3: Add `getFileOwnerEmail` to `IDriveFacade` and implement it**

In `src/infrastructure/facades/DriveServiceFacade.ts`, add to the `IDriveFacade` interface (after line 8, `getFileBlob(fileId: string): unknown;`):

```ts
  /** Email of the Drive file's owner, or null if none is present (e.g. a Shared Drive file). */
  getFileOwnerEmail(fileId: string): string | null;
```

Add the implementation to `DriveServiceFacade`, after `getFileBlob` (after line 86, before the closing `}` of the class at line 87):

```ts
  getFileOwnerEmail(fileId: string): string | null {
    return this.drive.getFileOwnerEmail(fileId);
  }
```

- [ ] **Step 4: Implement it on `FakeDriveFacade` too**

In `test/fakes/FakeDriveFacade.ts`, add a public field and method (after line 8, `private seq = 0;`):

```ts
  public ownerEmail: string | null = 'owner@school.it';
```

and add the method after `getFileBlob` (after line 31, before the closing `}` at line 32):

```ts
  getFileOwnerEmail(_fileId: string): string | null {
    return this.ownerEmail;
  }
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx jest --config jest.config.cjs test/unit/infrastructure/drive-facade.test.ts`
Expected: PASS

- [ ] **Step 6: Run the full unit suite to confirm no other `IDriveFacade` consumer broke**

Run: `npm test`
Expected: PASS (all suites — `FakeDriveFacade` is used broadly; this confirms the new interface member didn't break any other test file)

- [ ] **Step 7: Commit**

```bash
git add src/infrastructure/facades/DriveServiceFacade.ts test/fakes/FakeDriveFacade.ts test/unit/infrastructure/drive-facade.test.ts
git commit -m "feat: add IDriveFacade.getFileOwnerEmail"
```

---

## Task 4: `MASTER.TEST_MODE` schema + `MasterConfig.testMode`

**Files:**
- Modify: `src/config/schema.ts:25-31`
- Modify: `src/domain/entities/MasterConfig.ts`
- Modify: `test/unit/infrastructure/master-sheet-repository.test.ts`
- Modify: `SPECS_ALDO/01_SCHEMA_DATABASE.md`

**Interfaces:**
- Produces: `COL_MASTER.TEST_MODE = 'TEST_MODE'`; `MasterConfig.testMode: boolean` (parses `data[COL_MASTER.TEST_MODE] === true`, defaults to `false` when the column is missing/blank).

- [ ] **Step 1: Write the failing test**

In `test/unit/infrastructure/master-sheet-repository.test.ts`, extend the existing test at line 11 (`'MasterConfig: PK, anno VO, supervisore flag (01 §0)'`) — add after line 20 (`expect(m.hasSupervisore()).toBe(true);`):

```ts
  expect(m.testMode).toBe(false);
  expect(
    MasterConfig.fromData({
      ANNO_SCOLASTICO: '2025-2026',
      TEST_MODE: true
    }).testMode
  ).toBe(true);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --config jest.config.cjs test/unit/infrastructure/master-sheet-repository.test.ts`
Expected: FAIL — `m.testMode` is `undefined`, not `false`/`true`

- [ ] **Step 3: Add `TEST_MODE` to the schema**

In `src/config/schema.ts:25-31`, change:

```ts
export const COL_MASTER = {
  ANNO_SCOLASTICO: 'ANNO_SCOLASTICO',
  ID_SPREADSHEET: 'ID_SPREADSHEET',
  ID_CARTELLA_GOOGLE: 'ID_CARTELLA_GOOGLE',
  DIRIGENTE_SCOLASTICO: 'DIRIGENTE_SCOLASTICO',
  SUPERVISORE_EMAIL: 'SUPERVISORE_EMAIL'
} as const;
```

to:

```ts
export const COL_MASTER = {
  ANNO_SCOLASTICO: 'ANNO_SCOLASTICO',
  ID_SPREADSHEET: 'ID_SPREADSHEET',
  ID_CARTELLA_GOOGLE: 'ID_CARTELLA_GOOGLE',
  DIRIGENTE_SCOLASTICO: 'DIRIGENTE_SCOLASTICO',
  SUPERVISORE_EMAIL: 'SUPERVISORE_EMAIL',
  TEST_MODE: 'TEST_MODE'
} as const;
```

- [ ] **Step 4: Add `testMode` to `MasterConfig`**

In `src/domain/entities/MasterConfig.ts`, add the field declaration after line 20 (`public readonly supervisoreEmail: string;`):

```ts
  public readonly testMode: boolean;
```

Add the parsing after line 43 (the closing of the `supervisoreEmail` assignment, before `this.id = this.annoScolasticoRaw || null;` on line 44):

```ts
    this.testMode = data[COL_MASTER.TEST_MODE] === true;
```

Add it to `toData()` (after line 62, `[COL_MASTER.SUPERVISORE_EMAIL]: this.supervisoreEmail`, before the closing `};` on line 63) — note the trailing comma needed on the now-not-last previous line:

```ts
  override toData(): EntityData {
    return {
      [COL_MASTER.ANNO_SCOLASTICO]: this.annoScolasticoRaw,
      [COL_MASTER.ID_SPREADSHEET]: this.idSpreadsheet,
      [COL_MASTER.ID_CARTELLA_GOOGLE]: this.idCartellaRoot,
      [COL_MASTER.DIRIGENTE_SCOLASTICO]: this.dirigente,
      [COL_MASTER.SUPERVISORE_EMAIL]: this.supervisoreEmail,
      [COL_MASTER.TEST_MODE]: this.testMode
    };
  }
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx jest --config jest.config.cjs test/unit/infrastructure/master-sheet-repository.test.ts`
Expected: PASS

- [ ] **Step 6: Document the schema addition**

In `SPECS_ALDO/01_SCHEMA_DATABASE.md`, add a new row to the Master Sheet table (after the `SUPERVISORE_EMAIL` row, inside the table started at line ~11):

```markdown
| `TEST_MODE`             | `VERO`/`FALSO` (booleano) oppure vuoto; default `FALSO`    | Se `VERO`, ogni email inviata dal sistema viene reindirizzata (solo campo A, CC/BCC soppressi) all'indirizzo del proprietario Drive del Master Sheet, invece dei destinatari reali                                                    |
```

- [ ] **Step 7: Commit**

```bash
git add src/config/schema.ts src/domain/entities/MasterConfig.ts test/unit/infrastructure/master-sheet-repository.test.ts SPECS_ALDO/01_SCHEMA_DATABASE.md
git commit -m "feat: add MASTER.TEST_MODE column and MasterConfig.testMode"
```

---

## Task 5: Wire `initAldo()` to auto-enable TEST_MODE

**Files:**
- Modify: `src/config/Bootstrap.ts:1-48` (imports), `:317-341` (`initAldo`)
- Modify: `test/unit/config/bootstrap.test.ts`

**Interfaces:**
- Consumes: Task 3's `IDriveFacade.getFileOwnerEmail`; Task 4's `MasterConfig.testMode`; existing `EmailNotificationService.enableTestMode(email: string): void` (`src/application/services/EmailNotificationService.ts:143-145`).
- Produces: `initAldo()`'s observable behavior — when `annoCorrente.testMode === true`, the resolved container's `emailNotificationService` has test mode enabled with the MASTER file's Drive owner email; throws `ConfigurationError` (never silently sends real emails) if that owner can't be resolved.

- [ ] **Step 1: Write the failing tests**

In `test/unit/config/bootstrap.test.ts`, add the import (after line 32, `import { MasterSheetRepository } ...`):

```ts
import { DriveServiceFacade } from '../../../src/infrastructure/facades/DriveServiceFacade';
```

Add three new tests inside the `describe('initAldo — singleton reuse + missing master id', ...)` block (after the `test.each([null, '', '   '])(...)` block, i.e. after line 317, before the block's closing `});`):

```ts
  test('enables EmailNotificationService test mode with the MASTER file owner email when annoCorrente.testMode is true', () => {
    const restoreDb = mockDatabaseServiceGlobal();
    const restoreFactory = mockServiceFactory();
    const fakeMaster = {
      idSpreadsheet: 'ss1',
      idCartellaRoot: 'root1',
      testMode: true
    } as never;
    const findConfigSpy = jest
      .spyOn(MasterSheetRepository.prototype, 'findConfigAnnoCorrente')
      .mockReturnValue(fakeMaster);
    const ownerSpy = jest
      .spyOn(DriveServiceFacade.prototype, 'getFileOwnerEmail')
      .mockReturnValue('owner@school.it');
    const enableSpy = jest.spyOn(EmailNotificationService.prototype, 'enableTestMode');
    try {
      const props = { get: jest.fn().mockReturnValue('MASTER_ID_1'), set: jest.fn() };
      initAldo(new Date('2026-01-01'), props);
      expect(ownerSpy).toHaveBeenCalledWith('MASTER_ID_1');
      expect(enableSpy).toHaveBeenCalledWith('owner@school.it');
    } finally {
      enableSpy.mockRestore();
      ownerSpy.mockRestore();
      findConfigSpy.mockRestore();
      restoreFactory();
      restoreDb();
    }
  });

  test('does not enable test mode when annoCorrente.testMode is false', () => {
    const restoreDb = mockDatabaseServiceGlobal();
    const restoreFactory = mockServiceFactory();
    const fakeMaster = { idSpreadsheet: 'ss1', idCartellaRoot: 'root1', testMode: false } as never;
    const findConfigSpy = jest
      .spyOn(MasterSheetRepository.prototype, 'findConfigAnnoCorrente')
      .mockReturnValue(fakeMaster);
    const ownerSpy = jest.spyOn(DriveServiceFacade.prototype, 'getFileOwnerEmail');
    const enableSpy = jest.spyOn(EmailNotificationService.prototype, 'enableTestMode');
    try {
      const props = { get: jest.fn().mockReturnValue('MASTER_ID_1'), set: jest.fn() };
      initAldo(new Date('2026-01-01'), props);
      expect(ownerSpy).not.toHaveBeenCalled();
      expect(enableSpy).not.toHaveBeenCalled();
    } finally {
      enableSpy.mockRestore();
      ownerSpy.mockRestore();
      findConfigSpy.mockRestore();
      restoreFactory();
      restoreDb();
    }
  });

  test('throws ConfigurationError (without caching a broken container) when testMode is true and the owner cannot be resolved', () => {
    const restoreDb = mockDatabaseServiceGlobal();
    const restoreFactory = mockServiceFactory();
    const fakeMaster = { idSpreadsheet: 'ss1', idCartellaRoot: 'root1', testMode: true } as never;
    const findConfigSpy = jest
      .spyOn(MasterSheetRepository.prototype, 'findConfigAnnoCorrente')
      .mockReturnValue(fakeMaster);
    const ownerSpy = jest
      .spyOn(DriveServiceFacade.prototype, 'getFileOwnerEmail')
      .mockReturnValue(null);
    try {
      const props = { get: jest.fn().mockReturnValue('MASTER_ID_1'), set: jest.fn() };
      expect(() => initAldo(new Date('2026-01-01'), props)).toThrow(ConfigurationError);
      // Not cached: a retry with a working owner must succeed, not return a stale broken instance.
      ownerSpy.mockReturnValue('owner@school.it');
      const enableSpy = jest.spyOn(EmailNotificationService.prototype, 'enableTestMode');
      const c = initAldo(new Date('2026-01-01'), props);
      expect(enableSpy).toHaveBeenCalledWith('owner@school.it');
      expect(c).toBeDefined();
      enableSpy.mockRestore();
    } finally {
      ownerSpy.mockRestore();
      findConfigSpy.mockRestore();
      restoreFactory();
      restoreDb();
    }
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest --config jest.config.cjs test/unit/config/bootstrap.test.ts -t "testMode"`
Expected: FAIL — `ownerSpy`/`enableSpy` never called (the wiring doesn't exist yet); the third test's `initAldo` call doesn't throw

- [ ] **Step 3: Implement the wiring in `Bootstrap.ts`**

In `src/config/Bootstrap.ts`, replace the tail of `initAldo()` (lines 316-341, from the blank line before `runtime = buildAldoContainer({` through the function's closing `}`):

```ts

  const driveFacade = new DriveServiceFacade(
    ServiceFactory.getDriveService(),
    ServiceFactory.getPermissionService(),
    annoCorrente.idCartellaRoot
  );

  const container = buildAldoContainer({
    db,
    drive: driveFacade,
    gmail: new GmailServiceFacade(ServiceFactory.getMailService()),
    templates: new TemplateEngineFacade(),
    expressionEngine: new ExpressionEngineFacade(),
    importEngine,
    spreadsheets: spreadsheetService,
    documents: documentService,
    monitor: new ProcessMonitorFacade(
      new ProcessMonitorService(
        logger,
        ServiceFactory.getCacheService(),
        ServiceFactory.getPropertiesService()
      )
    ),
    now,
    logger
  });

  if (annoCorrente.testMode) {
    let ownerEmail: string | null;
    try {
      ownerEmail = driveFacade.getFileOwnerEmail(masterId);
    } catch (err) {
      throw new ConfigurationError(
        `TEST_MODE attivo ma impossibile risolvere il proprietario del Master Sheet ${masterId}: ${(err as Error).message}`
      );
    }
    if (ownerEmail === null) {
      throw new ConfigurationError(
        `TEST_MODE attivo ma il Master Sheet ${masterId} non ha un proprietario Drive risolvibile`
      );
    }
    container
      .get<EmailNotificationService>('emailNotificationService')
      .enableTestMode(ownerEmail);
  }

  runtime = container;
  return runtime;
}
```

Note the deliberate ordering: `runtime` (the module-level cache checked by `if (runtime !== null) return runtime;` at the top of `initAldo()`) is only assigned on the **last** line, after the TEST_MODE hook has succeeded — a thrown `ConfigurationError` from the hook leaves `runtime` at `null`, so a later retry re-runs `initAldo()` from scratch instead of ever returning a container whose TEST_MODE wiring silently failed.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest --config jest.config.cjs test/unit/config/bootstrap.test.ts`
Expected: PASS (all tests in the file)

- [ ] **Step 5: Run the full unit suite**

Run: `npm test`
Expected: PASS

- [ ] **Step 6: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add src/config/Bootstrap.ts test/unit/config/bootstrap.test.ts
git commit -m "feat: auto-enable email TEST_MODE from MASTER.TEST_MODE in initAldo"
```

---

## Self-Review Notes

- **Spec coverage:** schema (Task 4), GasLibraryFactory extension (Task 1), vendor pull + ambient type (Task 2), `IDriveFacade` wrap (Task 3), Bootstrap wiring incl. error handling (Task 5), docs (Tasks 1 + 4) — every section of `2026-07-21-test-mode-email-redirect-design.md` maps to a task. The design's "not creating `11_PIPELINE_EMAIL.md`" note needs no task (it's a decision not to act).
- **Placeholder scan:** none — every step has literal code, exact file:line anchors, and exact run commands with expected output.
- **Type consistency:** `getFileOwnerEmail(fileId: string): string | null` is identical across the ambient type (Task 2), `IDriveFacade`/`DriveServiceFacade`/`FakeDriveFacade` (Task 3), and its two call sites in `Bootstrap.ts` (Task 5).
