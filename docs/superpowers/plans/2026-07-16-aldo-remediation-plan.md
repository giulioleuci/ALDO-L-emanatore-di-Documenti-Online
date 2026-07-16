# ALDO Remediation (analysis_1–analysis_5 findings) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close every actionable finding from `analysis_1_linkage_errors.md` through `analysis_5_code_review.md` — one broken type declaration, one missing PII-redaction wrap, two documented-but-unformalized bypass exceptions, a missing error boundary, an architectural layering inversion, a 13-repository DIP gap, two GasLibraryFactory-owned defensive-coding gaps, and 24 confirmed-dead methods — without breaking any live caller in either the ALDO or GasLibraryFactory codebase graphs.

**Architecture:** ALDO (`/home/giulio/Desktop/ALDO implementing`) and GasLibraryFactory (`/home/giulio/Desktop/ALDO implementing/GasLibraryFactory`) are two separate git repositories. Fixes that belong to a library-owned defect are made in GasLibraryFactory first, then pulled into ALDO via `npm run refresh:vendor`. Every task that deletes, moves, or rewires a symbol re-verifies the current call graph live via `codebase-memory-mcp` immediately before acting — the `analysis_*.md` reports are a snapshot of HEAD `a0803d5` and may have drifted.

**Tech Stack:** TypeScript (ALDO `src/`, Jest/ts-jest), JavaScript ESM (GasLibraryFactory, Jest, Webpack, Babel→Chrome80), `codebase-memory-mcp` knowledge graph (`search_graph`, `get_code_snippet`, `trace_path`, `query_graph`, `index_repository`), `manage_adr`.

## Global Constraints

- **Two-repo discipline.** Commits in `GasLibraryFactory/` are separate git commits in that nested repo; commits in ALDO proper (everything outside `GasLibraryFactory/`) are separate commits in the outer repo. Never mix staged files from both in one commit. After every GasLibraryFactory commit that ALDO consumes, run `npm run refresh:vendor && npm run verify:vendor` from the ALDO root before touching ALDO source, per this repo's documented pipeline (`CLAUDE.md` → Commands).
- **Live graph re-verification before any deletion/move/rewire.** Analysis reports are a point-in-time snapshot; before deleting or relocating any symbol, re-run `search_graph`/`get_code_snippet` (and `grep` as a cheap cross-check) for that exact symbol. If a live caller now exists that the report didn't have, stop and re-triage — do not delete blindly.
- **Re-index after structural batches.** After each phase that changes call/import edges in a given repo (relocations, interface extraction, deletions, GasLibraryFactory service additions), re-run `mcp__codebase-memory-mcp__index_repository`:
  - ALDO combined graph: `{"project_name": "home-giulio-Desktop-ALDO-implementing", "root_path": "/home/giulio/Desktop/ALDO implementing"}`
  - GasLibraryFactory-only graph: `{"project_name": "home-giulio-Desktop-ALDO-implementing-GasLibraryFactory", "root_path": "/home/giulio/Desktop/ALDO implementing/GasLibraryFactory"}`
- **Never edit `dist/*` or `vendor/*` by hand.** `vendor/gaslibs.Code.js` is regenerated only by `npm run refresh:vendor`.
- **GAS V8 constraints hold in both repos.** Synchronous code only; no Node-only or unsupported browser APIs (per both `CLAUDE.md` files).
- **Native GAS globals** (`DriveApp`, `SpreadsheetApp`, `DocumentApp`, `PropertiesService`, `CacheService`, `UrlFetchApp`, `Utilities`, `Session`, `ScriptApp`, `LockService`, `MailApp`, `GmailApp`) may only be touched inside `GoogleApiWrapper` (GasLibraryFactory) or the already-sanctioned `GasOnlineTestFramework`/`src/onlinetests/**` exceptions — never introduce a new one.
- **Commands:**
  - ALDO: `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:integration`, `npm run test:build`.
  - GasLibraryFactory: `npm test` (run from `GasLibraryFactory/`; 4,306 tests must stay green), `npx eslint . --quiet`.
- **User decisions already made for this plan** (do not re-litigate):
  1. `ActiveUserFacade` → extend `GoogleApiWrapper` with a new `UserService.getActiveUserEmail()` rather than keep the raw `Session` call.
  2. `GasSampleSpreadsheetFactory` → upstream the generic add-sheet/append-row/reset logic into `GasOnlineTestFramework` rather than just documenting the exception.
  3. The three dead `.equals()` VOs (`DipartimentoId`, `Email`, `IndirizzoId`) → **keep** the methods and refactor their one inline-comparison call site each to use `.equals()`, standardizing the convention codebase-wide.

---

## Phase 1 — Linkage fix (`analysis_1_linkage_errors.md`, Finding 1)

### Task 1: Fix `ServiceFactory.getUtilitiesService()`/`getUtils()` misdeclaration and the wrong call in `Bootstrap.ts`

**Files:**
- Modify: `src/config/Bootstrap.ts:347`
- Modify: `types/gaslibs/index.d.ts:908-922`
- Test: `test/unit/config/bootstrap.test.ts` (create if it doesn't already cover `creaJobRunner`)

**Interfaces:**
- Consumes: ambient global `ServiceFactory` (declared in `types/gaslibs/index.d.ts`, backed at runtime by `GasLibraryFactory/GoogleApiWrapper/src/internal/core/ServiceFactory.js`, already exports both `getUtilitiesService()` → `UtilitiesService` and `getUtils()` → `UtilsService` — this is an ALDO-only type-declaration fix, no GasLibraryFactory change needed).
- Produces: `creaJobRunner(): JobRunnerService` now passes a real `UtilsService` (CoreUtilsLib) to `JobRunnerService`'s constructor, matching what it actually expects.

- [ ] **Step 1: Confirm the current live callers of `creaJobRunner` and `ServiceFactory.getUtilitiesService()` haven't changed**

Run:
```bash
cd "/home/giulio/Desktop/ALDO implementing"
grep -rn "ServiceFactory.getUtilitiesService()\|ServiceFactory.getUtils()" src/
```
Use `mcp__codebase-memory-mcp__search_graph` with `name_pattern: "creaJobRunner"` on project `home-giulio-Desktop-ALDO-implementing` and confirm `Bootstrap.ts:347` is still the only call site of `getUtilitiesService()`, matching `analysis_1_linkage_errors.md` Finding 1. If a second call site now exists, audit it the same way before proceeding.

- [ ] **Step 2: Fix the type declaration in `types/gaslibs/index.d.ts`**

Change (lines 908-922):
```ts
  class ServiceFactory {
    static configure(config?: Record<string, unknown>): void;
    static reset(resetConfig?: boolean): void;
    static getLogger(): LoggerService;
    static getUtilitiesService(): UtilsService;
    static getDriveService(): DriveService;
```
to:
```ts
  class ServiceFactory {
    static configure(config?: Record<string, unknown>): void;
    static reset(resetConfig?: boolean): void;
    static getLogger(): LoggerService;
    /** GoogleApiWrapper's own native-API wrapper (sleep, getUuid, formatDate w/ timezone, ...) — NOT the CoreUtilsLib UtilsService below. */
    static getUtilitiesService(): UtilitiesService;
    /** CoreUtilsLib's foundational UtilsService (formatDate w/ tokens, formatISODate, isValidEmail, ...). */
    static getUtils(): UtilsService;
    static getDriveService(): DriveService;
```
`UtilitiesService` is not yet declared as an ambient global in this file — add it directly above the `ServiceFactory` class declaration (still inside the same `declare global { ... }` block, `types/gaslibs/index.d.ts`):
```ts
  /** GoogleApiWrapper's native Utilities API wrapper (ref GoogleApiWrapper/src/services/UtilitiesService.js). */
  class UtilitiesService {
    constructor(logger?: LoggerService, exceptionService?: unknown);
    sleep(milliseconds: number): void;
    getUuid(): string;
    formatDate(date: Date, timeZone: string, format: string): string;
  }
```
(Only the members ALDO could plausibly reach through `ServiceFactory.getUtilitiesService()` need declaring here — the ambient `.d.ts` is a consumer-facing contract, not a full mirror of the library.)

- [ ] **Step 3: Fix the call site in `src/config/Bootstrap.ts:347`**

Change:
```ts
export function creaJobRunner(): JobRunnerService {
  return new JobRunnerService(
    ServiceFactory.getLogger(),
    ServiceFactory.getUtilitiesService(),
    new JobDefinitionRegistry(ServiceFactory.getLogger())
  );
}
```
to:
```ts
export function creaJobRunner(): JobRunnerService {
  return new JobRunnerService(
    ServiceFactory.getLogger(),
    ServiceFactory.getUtils(),
    new JobDefinitionRegistry(ServiceFactory.getLogger())
  );
}
```

- [ ] **Step 4: Typecheck and run the affected test suite**

Run:
```bash
npm run typecheck
npx jest --config jest.config.cjs -t "creaJobRunner"
npm test
```
Expected: PASS, 0 typecheck errors. If no existing test exercises `creaJobRunner`, add one asserting the constructed `JobRunnerService` was built with the object `ServiceFactory.getUtils()` returns (spy on `ServiceFactory.getUtils`/`getUtilitiesService` and assert only `getUtils` was called for this wiring).

- [ ] **Step 5: Commit**

```bash
git add src/config/Bootstrap.ts types/gaslibs/index.d.ts test/unit/config/bootstrap.test.ts
git commit -m "fix: wire creaJobRunner to ServiceFactory.getUtils(), correct getUtilitiesService() return type

Bootstrap.ts was calling getUtilitiesService() (GoogleApiWrapper's native-API
wrapper) where JobRunnerService expects a CoreUtilsLib UtilsService; the
misdeclared .d.ts return type let this compile. Fixes analysis_1_linkage_errors.md
Finding 1.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XsipfWZ5MdGjUugChgMLeh"
```

---

## Phase 2 — PII redaction gap (`analysis_2_bypass_and_reimplementations.md`, §3)

### Task 2: Declare `PiiRedactor` as an ambient global and wrap the 4 raw-email log call sites

**Files:**
- Modify: `types/gaslibs/index.d.ts` (add `PiiRedactor` — currently undeclared, even though the class is already flattened onto `global` at runtime by `GasLibraryFactory/src/index.js`)
- Modify: `src/application/services/EmailRetryService.ts:65-67, 74-78`
- Modify: `src/infrastructure/steps/emailSteps.ts:394` (path will change to `src/application/pipelines/emailSteps.ts` if Phase 6 runs first — apply this fix wherever the file currently lives at execution time)
- Modify: `src/application/services/EmailNotificationService.ts:354`
- Test: `test/unit/application/email-retry-service.test.ts`, `test/unit/infrastructure/email-steps.test.ts` (or its relocated path), `test/unit/application/email-notification-service.test.ts`

**Interfaces:**
- Consumes: ambient global `PiiRedactor.redact(message: string): string` (backed by `GasLibraryFactory/CoreUtilsLib/src/internal/PiiRedactor.js`, exported from `CoreUtilsLib/index.js`, flattened onto `global` — no import needed, same pattern as `LoggerService`/`UtilsService`).

- [ ] **Step 1: Confirm the 4 call sites are still current**

```bash
grep -n "nuovo tentativo fallito\|Invio email permanentemente fallito\|SendEmail: invio fallito\|PER_CARENZA: alunno" \
  src/application/services/EmailRetryService.ts \
  src/infrastructure/steps/emailSteps.ts \
  src/application/services/EmailNotificationService.ts
```
If `src/infrastructure/steps/emailSteps.ts` doesn't exist (Phase 6 already ran), re-run the grep against `src/application/pipelines/emailSteps.ts`.

- [ ] **Step 2: Declare `PiiRedactor` in `types/gaslibs/index.d.ts`**

Add inside the existing `declare global { ... }` block, near `HtmlSanitizer` (both are CoreUtilsLib static string-processing utilities):
```ts
  /** CoreUtilsLib PII-safe logging helper (ref CoreUtilsLib/src/internal/PiiRedactor.js). */
  class PiiRedactor {
    static redact(message: string): string;
    static redactEmails(message: string, label?: string): string;
    static containsPii(message: string): boolean;
  }
```

- [ ] **Step 3: Wrap `EmailRetryService.ts`'s two call sites**

Change (lines 65-67):
```ts
        this.logger.warn(
          `EmailRetry: nuovo tentativo fallito per ${first.pattern} → ${first.destinatariRaw} (${run.errors.join('; ')})`
        );
```
to:
```ts
        this.logger.warn(
          PiiRedactor.redact(
            `EmailRetry: nuovo tentativo fallito per ${first.pattern} → ${first.destinatariRaw} (${run.errors.join('; ')})`
          )
        );
```
Change (lines 74-78, `registraPermanente`):
```ts
  private registraPermanente(record: LogEmail, tentativi: number): void {
    const msg =
      `Invio email permanentemente fallito dopo ${tentativi} tentativi: ` +
      `pattern ${record.pattern}, destinatari ${record.destinatariRaw} (${record.errore})`;
    this.logger.error(`EmailRetry: ${msg}`);
```
to:
```ts
  private registraPermanente(record: LogEmail, tentativi: number): void {
    const msg =
      `Invio email permanentemente fallito dopo ${tentativi} tentativi: ` +
      `pattern ${record.pattern}, destinatari ${record.destinatariRaw} (${record.errore})`;
    this.logger.error(`EmailRetry: ${PiiRedactor.redact(msg)}`);
```
(The `htmlBody: `<p>${escapeHtml(msg)}</p>`` line just below stays unredacted deliberately — it's the admin notification email body, whose entire purpose is to show the supervisore the failing recipients; only the *log* call is redacted.)

- [ ] **Step 4: Wrap `emailSteps.ts`'s call site**

Change (`SendEmailStep`):
```ts
        this.logger.error(`SendEmail: invio fallito a ${to.join(',')}: ${msg}`);
```
to:
```ts
        this.logger.error(PiiRedactor.redact(`SendEmail: invio fallito a ${to.join(',')}: ${msg}`));
```

- [ ] **Step 5: Wrap `EmailNotificationService.ts`'s call site**

Change (`targetsPerCarenza`):
```ts
        this.logger.warn(`PER_CARENZA: alunno ${carenza.studente} non trovato — carenza saltata`);
```
to:
```ts
        this.logger.warn(PiiRedactor.redact(`PER_CARENZA: alunno ${carenza.studente} non trovato — carenza saltata`));
```

- [ ] **Step 6: Add/extend unit tests asserting redaction**

For each of the 3 modified files, add a test that triggers the failure path with an email-bearing message and asserts the mock logger was called with a string containing `[EMAIL_REDACTED]` and not the raw address. Example for `EmailRetryService.ts` (append to `test/unit/application/email-retry-service.test.ts`):
```ts
test('retryFailed redacts the recipient email in the warn log on a failed re-send', () => {
  const logger = { warn: jest.fn(), error: jest.fn() } as unknown as LoggerService;
  // ... existing fixture wiring that makes emailService.sendPattern return { sent: 0, errors: ['boom'] }
  const service = new EmailRetryService(logMail, emailService, gmail, master, { logger });
  service.retryFailed();
  expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('[EMAIL_REDACTED]'));
  expect(logger.warn).not.toHaveBeenCalledWith(expect.stringContaining('@'));
});
```
Mirror this shape (mock/spy the injected `LoggerService`, assert on the redacted marker and the absence of `@`) in the `emailSteps`/`EmailNotificationService` test files for their respective call sites.

- [ ] **Step 7: Run tests and lint**

```bash
npm run typecheck
npx jest --config jest.config.cjs email-retry-service email-steps email-notification-service
npm run lint
```
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add types/gaslibs/index.d.ts src/application/services/EmailRetryService.ts src/infrastructure/steps/emailSteps.ts src/application/services/EmailNotificationService.ts test/unit/application/email-retry-service.test.ts test/unit/infrastructure/email-steps.test.ts test/unit/application/email-notification-service.test.ts
git commit -m "fix: redact PII before logging failed-send/carenza-lookup messages

CoreUtilsLib already exposes PiiRedactor for exactly this case; four call
sites were interpolating raw student/parent emails into logger.warn/error
instead of reaching for it. Fixes analysis_2_bypass_and_reimplementations.md §3.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XsipfWZ5MdGjUugChgMLeh"
```

---

## Phase 3 — `ActiveUserFacade` → new `GoogleApiWrapper.UserService` (`analysis_2` §1a, user decision: extend the library)

### Task 3: Add `UserService` to GoogleApiWrapper (GasLibraryFactory repo)

**Files (GasLibraryFactory repo):**
- Create: `GasLibraryFactory/GoogleApiWrapper/src/services/UserService.js`
- Create: `GasLibraryFactory/GoogleApiWrapper/src/services/__tests__/UserService.test.js`
- Modify: `GasLibraryFactory/GoogleApiWrapper/src/internal/core/ServiceFactory.js`
- Modify: `GasLibraryFactory/GoogleApiWrapper/src/internal/core/__tests__/ServiceFactory.test.js`
- Modify: `GasLibraryFactory/GoogleApiWrapper/index.js`

**Interfaces:**
- Produces: `UserService.getActiveUserEmail(): string` and `ServiceFactory.getUserService(): UserService`, exported from the `GoogleApiWrapper` package public surface.

- [ ] **Step 1: Verify no existing `UserService`/session wrapper was added since the audit**

```bash
cd "/home/giulio/Desktop/ALDO implementing/GasLibraryFactory"
grep -rn "class UserService\|getActiveUserEmail\|Session.getActiveUser" GoogleApiWrapper/ --include=*.js | grep -v __tests__
```
Use `mcp__codebase-memory-mcp__search_graph` (`name_pattern: "UserService"`, project `home-giulio-Desktop-ALDO-implementing-GasLibraryFactory`) to confirm no such class exists yet.

- [ ] **Step 2: Write the failing test**

Create `GasLibraryFactory/GoogleApiWrapper/src/services/__tests__/UserService.test.js`:
```js
import { UserService } from '../UserService';

describe('UserService', () => {
  let mockLogger;

  beforeEach(() => {
    mockLogger = { debug: jest.fn(), error: jest.fn() };
  });

  test('getActiveUserEmail returns the email from the native Session global', () => {
    global.Session = {
      getActiveUser: jest.fn(() => ({ getEmail: () => 'docente@scuola.it' }))
    };
    const service = new UserService(mockLogger);
    expect(service.getActiveUserEmail()).toBe('docente@scuola.it');
    expect(global.Session.getActiveUser).toHaveBeenCalled();
  });

  test('getActiveUserEmail logs and rethrows on native failure', () => {
    global.Session = {
      getActiveUser: jest.fn(() => {
        throw new Error('no active user');
      })
    };
    const service = new UserService(mockLogger);
    expect(() => service.getActiveUserEmail()).toThrow('no active user');
    expect(mockLogger.error).toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

```bash
npx jest GoogleApiWrapper/src/services/__tests__/UserService.test.js
```
Expected: FAIL — `Cannot find module '../UserService'`.

- [ ] **Step 4: Implement `UserService`**

Create `GasLibraryFactory/GoogleApiWrapper/src/services/UserService.js`:
```js
/**
 * @file GoogleApiWrapper/src/services/UserService.js
 * @description Facade for Google Apps Script's Session API (running-user identity).
 */

/**
 * @class UserService
 * @description Lightweight facade for the native GAS `Session` global — the L2
 * boundary for running-user identity lookups, so no other library or consumer
 * needs to touch `Session` directly.
 *
 * @property {LoggerService} _logger Diagnostic logger.
 */
export class UserService {
  /**
   * @param {LoggerService} [logger=console] Diagnostic logger.
   */
  constructor(logger = console) {
    this._logger = logger || console;
  }

  /**
   * @description Returns the email address of the user running the current script execution.
   * @returns {string}
   */
  getActiveUserEmail() {
    try {
      const email = global.Session.getActiveUser().getEmail();
      this._logger.debug('Resolved active user email');
      return email;
    } catch (error) {
      this._logger.error(`Error resolving active user email: ${error.message}`);
      throw error;
    }
  }
}
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
npx jest GoogleApiWrapper/src/services/__tests__/UserService.test.js
```
Expected: PASS.

- [ ] **Step 6: Wire `UserService` into `ServiceFactory`**

In `GasLibraryFactory/GoogleApiWrapper/src/internal/core/ServiceFactory.js`, add the import alongside the other service imports:
```js
import { UiService } from '../../services/UiService.js';
import { UserService } from '../../services/UserService.js';
```
Add the factory method after `getUiService()`:
```js
  /**
   * @static
   * @description Creates a new UserService instance with injected shared dependencies.
   * @returns {UserService}
   */
  static getUserService() {
    return new UserService(ServiceFactory.getLogger());
  }
```

- [ ] **Step 7: Extend `ServiceFactory.test.js` and confirm it passes**

Add a test to `GasLibraryFactory/GoogleApiWrapper/src/internal/core/__tests__/ServiceFactory.test.js` following the file's existing per-`getXService` test pattern:
```js
test('getUserService returns a UserService wired with the shared logger', () => {
  const service = ServiceFactory.getUserService();
  expect(service).toBeInstanceOf(UserService);
});
```
(Add `import { UserService } from '../../../services/UserService';` at the top alongside the file's other service imports — check the existing import block first for the exact relative path convention already used for sibling services in that file.)

```bash
npx jest GoogleApiWrapper/src/internal/core/__tests__/ServiceFactory.test.js
```
Expected: PASS.

- [ ] **Step 8: Export `UserService` from the package public surface**

In `GasLibraryFactory/GoogleApiWrapper/index.js`, add next to the other service exports (near `export { UiService } from './src/services/UiService';`):
```js
export { UserService } from './src/services/UserService';
```

- [ ] **Step 9: Run the full GasLibraryFactory test suite and lint**

```bash
cd "/home/giulio/Desktop/ALDO implementing/GasLibraryFactory"
npm test
npx eslint . --quiet
```
Expected: all 4,306+ tests PASS, lint exits 0 (confirms `global.Session` access stays inside `GoogleApiWrapper`, the sanctioned L2 boundary).

- [ ] **Step 10: Commit (GasLibraryFactory repo)**

```bash
cd "/home/giulio/Desktop/ALDO implementing/GasLibraryFactory"
git add GoogleApiWrapper/src/services/UserService.js GoogleApiWrapper/src/services/__tests__/UserService.test.js GoogleApiWrapper/src/internal/core/ServiceFactory.js GoogleApiWrapper/src/internal/core/__tests__/ServiceFactory.test.js GoogleApiWrapper/index.js
git commit -m "feat(GoogleApiWrapper): add UserService wrapping Session.getActiveUser()

Closes the one remaining native-GAS call ALDO's ActiveUserFacade had to make
directly (no wrapped equivalent existed). ref analysis_2_bypass_and_reimplementations.md §1a.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XsipfWZ5MdGjUugChgMLeh"
```

### Task 4: Consume the new `UserService` from ALDO's `ActiveUserFacade`

**Files (ALDO repo):**
- Modify: `vendor/gaslibs.Code.js` (regenerated, not hand-edited)
- Modify: `types/gaslibs/index.d.ts`
- Modify: `src/infrastructure/facades/ActiveUserFacade.ts`
- Test: `test/unit/infrastructure/active-user-facade.test.ts` (create — none exists today)

- [ ] **Step 1: Refresh the vendored library bundle**

```bash
cd "/home/giulio/Desktop/ALDO implementing"
npm run refresh:vendor
npm run verify:vendor
```
Expected: PASS, `vendor/gaslibs.Code.js` now contains the new `UserService` class and `ServiceFactory.getUserService`.

- [ ] **Step 2: Declare `UserService` and `ServiceFactory.getUserService()` in `types/gaslibs/index.d.ts`**

Add near the `UtilitiesService` declaration added in Phase 1 (both are simple GoogleApiWrapper service wrappers):
```ts
  /** GoogleApiWrapper facade over the native Session global (ref GoogleApiWrapper/src/services/UserService.js). */
  class UserService {
    constructor(logger?: LoggerService);
    getActiveUserEmail(): string;
  }
```
Add the factory method to the `ServiceFactory` class declaration (edited in Phase 1):
```ts
    static getPermissionService(): PermissionService;
    static getUserService(): UserService;
```

- [ ] **Step 3: Write the failing test**

Create `test/unit/infrastructure/active-user-facade.test.ts`:
```ts
import { SessionActiveUserFacade } from '../../../src/infrastructure/facades/ActiveUserFacade';

describe('SessionActiveUserFacade', () => {
  test('getEmail delegates to ServiceFactory.getUserService().getActiveUserEmail()', () => {
    const getActiveUserEmail = jest.fn(() => 'preside@scuola.it');
    (global as unknown as { ServiceFactory: unknown }).ServiceFactory = {
      getUserService: () => ({ getActiveUserEmail })
    };
    const facade = new SessionActiveUserFacade();
    expect(facade.getEmail()).toBe('preside@scuola.it');
    expect(getActiveUserEmail).toHaveBeenCalled();
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

```bash
npx jest --config jest.config.cjs active-user-facade
```
Expected: FAIL (facade still calls `Session.getActiveUser()` directly, and the test's fake `ServiceFactory` global is never touched).

- [ ] **Step 5: Update `ActiveUserFacade.ts`**

Change:
```ts
/**
 * Running-user identity port (11 §15, `src/onlinetests/checks/pipelineChecks.ts` doc comment).
 * `GoogleApiWrapper`/`ServiceFactory` exposes no wrapped equivalent of `Session.getActiveUser()`
 * (no `UserService`/`getSession*` factory method — see `types/gaslibs/index.d.ts`), so this facade
 * IS the L2 boundary for that one native call, exactly like every other file in this directory.
 */
export interface IActiveUserFacade {
  getEmail(): string;
}

export class SessionActiveUserFacade implements IActiveUserFacade {
  getEmail(): string {
    return Session.getActiveUser().getEmail();
  }
}
```
to:
```ts
/** Running-user identity port (11 §15, `src/onlinetests/checks/pipelineChecks.ts` doc comment). */
export interface IActiveUserFacade {
  getEmail(): string;
}

export class SessionActiveUserFacade implements IActiveUserFacade {
  getEmail(): string {
    return ServiceFactory.getUserService().getActiveUserEmail();
  }
}
```

- [ ] **Step 6: Run the test to verify it passes, then the full suite**

```bash
npm run typecheck
npx jest --config jest.config.cjs active-user-facade
npm test
npm run lint
```
Expected: PASS. `npm run lint` confirms `Session` no longer appears as a raw global reference anywhere in `src/`.

- [ ] **Step 7: Commit (ALDO repo)**

```bash
git add vendor/gaslibs.Code.js types/gaslibs/index.d.ts src/infrastructure/facades/ActiveUserFacade.ts test/unit/infrastructure/active-user-facade.test.ts
git commit -m "fix: route ActiveUserFacade through the new GoogleApiWrapper.UserService

Closes the last native Session.getActiveUser() call in ALDO src/. ref
analysis_2_bypass_and_reimplementations.md §1a.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XsipfWZ5MdGjUugChgMLeh"
```

---

## Phase 4 — Upstream `GasSampleSpreadsheetFactory` into `GasOnlineTestFramework` (`analysis_2` §1b, user decision: upstream)

### Task 5: Add a generic `SampleSpreadsheetBuilder` to GasOnlineTestFramework (GasLibraryFactory repo)

**Files (GasLibraryFactory repo):**
- Create: `GasLibraryFactory/GasOnlineTestFramework/src/SampleSpreadsheetBuilder.js`
- Create: `GasLibraryFactory/GasOnlineTestFramework/__tests__/SampleSpreadsheetBuilder.test.js`
- Modify: `GasLibraryFactory/GasOnlineTestFramework/src/TestContext.js`
- Modify: `GasLibraryFactory/GasOnlineTestFramework/__tests__/TestContext.test.js`
- Modify: `GasLibraryFactory/GasOnlineTestFramework/index.js`

**Interfaces:**
- Produces: `SampleSpreadsheetBuilder` (`{ id: string, addSheet(name, headerRow), appendRow(sheetName, row), getUrl() }`) and `TestContext.buildSampleSpreadsheet(name, parentFolder?): SampleSpreadsheetBuilder`.

- [ ] **Step 1: Verify current state**

```bash
cd "/home/giulio/Desktop/ALDO implementing/GasLibraryFactory"
grep -n "buildSampleSpreadsheet\|class SampleSpreadsheetBuilder" GasOnlineTestFramework/src/*.js
```
Expected: no hits (confirms this hasn't already been added).

- [ ] **Step 2: Write the failing test**

Create `GasLibraryFactory/GasOnlineTestFramework/__tests__/SampleSpreadsheetBuilder.test.js`:
```js
import { SampleSpreadsheetBuilder } from '../src/SampleSpreadsheetBuilder.js';

function makeSheet(name, header) {
  const values = [header];
  return {
    name,
    getRange: jest.fn(() => ({
      setValues: jest.fn((rows) => values.push(...rows)),
      getValues: jest.fn(() => [values[0]])
    })),
    getLastColumn: jest.fn(() => header.length),
    appendRow: jest.fn((row) => values.push(row))
  };
}

function makeSpreadsheet(defaultSheetName = 'Sheet1') {
  const sheets = { [defaultSheetName]: makeSheet(defaultSheetName, []) };
  return {
    getId: () => 'ss-1',
    getName: () => 'Test SS',
    getUrl: () => 'https://sheets/ss-1',
    getSheets: jest.fn(() => Object.values(sheets)),
    insertSheet: jest.fn((name) => {
      sheets[name] = makeSheet(name, []);
      return sheets[name];
    }),
    getSheetByName: jest.fn((name) => sheets[name] || null),
    deleteSheet: jest.fn((sheet) => {
      delete sheets[sheet.name];
    })
  };
}

test('addSheet creates the sheet, sets the header row, and drops the placeholder default sheet once', () => {
  const ss = makeSpreadsheet();
  const builder = new SampleSpreadsheetBuilder(ss);
  builder.addSheet('ALUNNI', ['ID', 'NOME']);
  expect(ss.insertSheet).toHaveBeenCalledWith('ALUNNI');
  expect(ss.deleteSheet).toHaveBeenCalledTimes(1);
  builder.addSheet('CLASSI', ['ID']);
  expect(ss.deleteSheet).toHaveBeenCalledTimes(1); // not called again
});

test('appendRow maps a keyed row onto the sheet header order', () => {
  const ss = makeSpreadsheet();
  const builder = new SampleSpreadsheetBuilder(ss);
  builder.addSheet('ALUNNI', ['ID', 'NOME']);
  builder.appendRow('ALUNNI', { NOME: 'Rossi', ID: 'a1' });
  const sheet = ss.getSheetByName('ALUNNI');
  expect(sheet.appendRow).toHaveBeenCalledWith(['a1', 'Rossi']);
});

test('appendRow throws for a missing sheet', () => {
  const builder = new SampleSpreadsheetBuilder(makeSpreadsheet());
  expect(() => builder.appendRow('NOPE', {})).toThrow(/NOPE/);
});

test('getUrl delegates to the underlying spreadsheet', () => {
  const builder = new SampleSpreadsheetBuilder(makeSpreadsheet());
  expect(builder.getUrl()).toBe('https://sheets/ss-1');
});
```

- [ ] **Step 3: Run the test to verify it fails**

```bash
npx jest GasOnlineTestFramework/__tests__/SampleSpreadsheetBuilder.test.js
```
Expected: FAIL — module not found.

- [ ] **Step 4: Implement `SampleSpreadsheetBuilder`**

Create `GasLibraryFactory/GasOnlineTestFramework/src/SampleSpreadsheetBuilder.js`:
```js
/**
 * @file GasOnlineTestFramework/src/SampleSpreadsheetBuilder.js
 * @description Generic add-sheet/append-row/reset helper for building throwaway
 * sample spreadsheets inside online tests, on top of a live Spreadsheet handle
 * (typically obtained via TestContext.buildSampleSpreadsheet).
 */

/**
 * @class SampleSpreadsheetBuilder
 * @description Wraps a live Spreadsheet handle with add-sheet/append-row
 * operations, so library consumers building sample test data never call
 * `SpreadsheetApp`/`Sheet` natives directly.
 */
export class SampleSpreadsheetBuilder {
  /**
   * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} spreadsheet Live spreadsheet handle.
   */
  constructor(spreadsheet) {
    this.spreadsheet = spreadsheet;
    this.id = spreadsheet.getId();
    this.defaultSheet = spreadsheet.getSheets()[0] || null;
  }

  /**
   * @description Creates a new sheet with the given header row, dropping the
   * spreadsheet's auto-created placeholder sheet the first time this is called.
   * @param {string} name Sheet name.
   * @param {string[]} headerRow Header cell values.
   */
  addSheet(name, headerRow) {
    const sheet = this.spreadsheet.insertSheet(name);
    if (headerRow.length > 0) {
      sheet.getRange(1, 1, 1, headerRow.length).setValues([headerRow]);
    }
    if (this.defaultSheet !== null) {
      this.spreadsheet.deleteSheet(this.defaultSheet);
      this.defaultSheet = null;
    }
  }

  /**
   * @description Appends a row to a named sheet, matching values to that sheet's header order.
   * @param {string} sheetName Target sheet name.
   * @param {Object<string, *>} row Values keyed by header name.
   * @throws {Error} If the named sheet does not exist.
   */
  appendRow(sheetName, row) {
    const sheet = this.spreadsheet.getSheetByName(sheetName);
    if (sheet === null) {
      throw new Error(`Sheet "${sheetName}" not found in spreadsheet "${this.spreadsheet.getName()}".`);
    }
    const headerRow = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0] || [];
    const values = headerRow.map((header) => (row[String(header)] !== undefined ? row[String(header)] : ''));
    sheet.appendRow(values);
  }

  /**
   * @description Public URL of the underlying spreadsheet.
   * @returns {string}
   */
  getUrl() {
    return this.spreadsheet.getUrl();
  }
}
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
npx jest GasOnlineTestFramework/__tests__/SampleSpreadsheetBuilder.test.js
```
Expected: PASS.

- [ ] **Step 6: Add `TestContext.buildSampleSpreadsheet`**

In `GasLibraryFactory/GasOnlineTestFramework/src/TestContext.js`, add the import at the top:
```js
import { SampleSpreadsheetBuilder } from './SampleSpreadsheetBuilder.js';
```
Add the method after `resetSpreadsheet`:
```js
  /**
   * @description Gets-or-creates a named spreadsheet, resets it to a clean single-sheet
   * baseline, and wraps it in a {@link SampleSpreadsheetBuilder} for add-sheet/append-row
   * sample-data construction (ref ALDO_GLF_AUDIT_RESULTS.md K-1 reuse-by-name pattern).
   * @param {string} name Spreadsheet file name to look up or create.
   * @param {GoogleAppsScript.Drive.Folder|null} [parentFolder=null] Scope as in {@link getOrCreateNamedSpreadsheet}.
   * @returns {SampleSpreadsheetBuilder}
   */
  buildSampleSpreadsheet(name, parentFolder = null) {
    const spreadsheet = this.getOrCreateNamedSpreadsheet(name, parentFolder);
    this.resetSpreadsheet(spreadsheet);
    return new SampleSpreadsheetBuilder(spreadsheet);
  }
```

- [ ] **Step 7: Add a `TestContext.test.js` case and confirm it passes**

Add to `GasLibraryFactory/GasOnlineTestFramework/__tests__/TestContext.test.js`, in a new `describe('TestContext.buildSampleSpreadsheet', ...)` block following the file's existing `global.DriveApp`/`global.SpreadsheetApp` mocking style:
```js
test('returns a SampleSpreadsheetBuilder wrapping the reused-or-created spreadsheet', () => {
  const ctx = new TestContext();
  const fakeSheets = [{ getName: () => 'Sheet1' }];
  const fakeSs = {
    getId: () => 'ss-1',
    getUrl: () => 'https://sheets/ss-1',
    getSheets: () => fakeSheets,
    getProtections: () => [],
    getNamedRanges: () => []
  };
  jest.spyOn(ctx, 'getOrCreateNamedSpreadsheet').mockReturnValue(fakeSs);
  jest.spyOn(ctx, 'resetSpreadsheet').mockImplementation(() => {});
  const builder = ctx.buildSampleSpreadsheet('SAMPLE_DB');
  expect(ctx.getOrCreateNamedSpreadsheet).toHaveBeenCalledWith('SAMPLE_DB', null);
  expect(ctx.resetSpreadsheet).toHaveBeenCalledWith(fakeSs);
  expect(builder.getUrl()).toBe('https://sheets/ss-1');
});
```

```bash
npx jest GasOnlineTestFramework/__tests__/TestContext.test.js
```
Expected: PASS.

- [ ] **Step 8: Export `SampleSpreadsheetBuilder` from the package public surface**

In `GasLibraryFactory/GasOnlineTestFramework/index.js`, add:
```js
export { SampleSpreadsheetBuilder } from './src/SampleSpreadsheetBuilder.js';
```

- [ ] **Step 9: Full suite + lint**

```bash
cd "/home/giulio/Desktop/ALDO implementing/GasLibraryFactory"
npm test
npx eslint . --quiet
```
Expected: PASS, 0 lint errors (confirms `SpreadsheetApp`-adjacent calls stay confined to the sanctioned `GasOnlineTestFramework/**` exception).

- [ ] **Step 10: Commit (GasLibraryFactory repo)**

```bash
cd "/home/giulio/Desktop/ALDO implementing/GasLibraryFactory"
git add GasOnlineTestFramework/src/SampleSpreadsheetBuilder.js GasOnlineTestFramework/__tests__/SampleSpreadsheetBuilder.test.js GasOnlineTestFramework/src/TestContext.js GasOnlineTestFramework/__tests__/TestContext.test.js GasOnlineTestFramework/index.js
git commit -m "feat(GasOnlineTestFramework): add SampleSpreadsheetBuilder + TestContext.buildSampleSpreadsheet

Generalizes ALDO's hand-rolled GasSampleSpreadsheetFactory add-sheet/append-row
logic into a reusable library helper. ref analysis_2_bypass_and_reimplementations.md §1b.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XsipfWZ5MdGjUugChgMLeh"
```

### Task 6: Rewrite ALDO's `GasSampleSpreadsheetFactory` to delegate to the library helper

**Files (ALDO repo):**
- Modify: `vendor/gaslibs.Code.js` (regenerated)
- Modify: `types/gaslibs/index.d.ts`
- Modify: `src/onlinetests/GasSampleSpreadsheetFactory.ts`
- Test: existing online-test build coverage (`npm run test:build`); no offline unit test exists for this file today since it's excluded from non-online builds — confirm with `grep -rn "GasSampleSpreadsheetFactory" test/`.

- [ ] **Step 1: Refresh vendor**

```bash
cd "/home/giulio/Desktop/ALDO implementing"
npm run refresh:vendor
npm run verify:vendor
```

- [ ] **Step 2: Declare `SampleSpreadsheetBuilder` and `TestContext.buildSampleSpreadsheet` in `types/gaslibs/index.d.ts`**

Extend the existing `TestContext` declaration (added originally for `getOrCreateNamedSpreadsheet`/`resetSpreadsheet`):
```ts
  class TestContext {
    readonly TEST_ROOT_NAME: string;
    readonly TEST_SS_NAME: string;
    readonly TEST_DOC_NAME: string;
    readonly apiCallCount: number;
    getRootFolder(): unknown;
    getOrCreateNamedFolder(name: string, parentFolder?: unknown | null): unknown;
    getSpreadsheet(): unknown;
    getOrCreateNamedSpreadsheet(name: string, parentFolder?: unknown | null): unknown;
    getDocument(): unknown;
    /** Strips protections/named ranges/extra sheets back to one blank "Sheet1"; defaults to `getSpreadsheet()`. */
    resetSpreadsheet(ss?: unknown): void;
    resetDocument(): void;
    resetAll(): void;
    /** Gets-or-creates + resets a named spreadsheet, wrapped for add-sheet/append-row sample-data construction. */
    buildSampleSpreadsheet(name: string, parentFolder?: unknown | null): SampleSpreadsheetBuilder;
  }
  const testContext: TestContext;
  /** Generic sample-spreadsheet construction helper (ref GasOnlineTestFramework/src/SampleSpreadsheetBuilder.js). */
  class SampleSpreadsheetBuilder {
    readonly id: string;
    addSheet(name: string, headerRow: string[]): void;
    appendRow(sheetName: string, row: Record<string, unknown>): void;
    getUrl(): string;
  }
}
```
(Note the closing `}` of `declare global { ... }` moves to after the new `SampleSpreadsheetBuilder` class — verify the file's current final brace position before editing so the block stays balanced.)

- [ ] **Step 3: Rewrite `GasSampleSpreadsheetFactory.ts`**

Change:
```ts
export class GasSampleSpreadsheetFactory implements ISampleSpreadsheetFactory {
  constructor(private readonly rootFolder: unknown = null) {}

  createSpreadsheet(name: string): ISampleSpreadsheet {
    const spreadsheet = testContext.getOrCreateNamedSpreadsheet(
      name,
      this.rootFolder
    ) as GoogleAppsScript.Spreadsheet.Spreadsheet;
    testContext.resetSpreadsheet(spreadsheet);
    return new GasSampleSpreadsheet(spreadsheet);
  }
}

class GasSampleSpreadsheet implements ISampleSpreadsheet {
  readonly id: string;

  /** Default sheet GAS creates with every new spreadsheet; deleted once a real sheet exists. */
  private defaultSheet: GoogleAppsScript.Spreadsheet.Sheet | null;

  constructor(private readonly spreadsheet: GoogleAppsScript.Spreadsheet.Spreadsheet) {
    this.id = spreadsheet.getId();
    this.defaultSheet = spreadsheet.getSheets()[0] ?? null;
  }

  addSheet(name: string, headerRow: string[]): void {
    const sheet = this.spreadsheet.insertSheet(name);
    if (headerRow.length > 0) {
      sheet.getRange(1, 1, 1, headerRow.length).setValues([headerRow]);
    }
    // Drop the spreadsheet's auto-created placeholder sheet once a real one exists, so the
    // final spreadsheet contains only the intended `TABLE.*` sheets.
    if (this.defaultSheet !== null) {
      this.spreadsheet.deleteSheet(this.defaultSheet);
      this.defaultSheet = null;
    }
  }

  appendRow(sheetName: string, row: Record<string, unknown>): void {
    const sheet = this.spreadsheet.getSheetByName(sheetName);
    if (sheet === null) {
      throw new Error(
        `Sheet "${sheetName}" non trovato nello spreadsheet "${this.spreadsheet.getName()}".`
      );
    }
    const headerRow = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0] ?? [];
    const values = headerRow.map((header) => row[String(header)] ?? '');
    sheet.appendRow(values);
  }

  getUrl(): string {
    return this.spreadsheet.getUrl();
  }
}
```
to:
```ts
import type { ISampleSpreadsheet, ISampleSpreadsheetFactory } from './SampleDatabaseBuilder';

/**
 * `GasOnlineTestFramework.testContext.buildSampleSpreadsheet`-backed implementation of
 * {@link ISampleSpreadsheetFactory}. The reuse-by-name persistence and the generic
 * add-sheet/append-row/reset mechanics now live in `GasOnlineTestFramework.SampleSpreadsheetBuilder`
 * (ref analysis_2_bypass_and_reimplementations.md §1b) — this class is a thin ALDO-side adapter to
 * the {@link ISampleSpreadsheetFactory} port, with no direct `SpreadsheetApp`/`Sheet` API calls.
 */
export class GasSampleSpreadsheetFactory implements ISampleSpreadsheetFactory {
  constructor(private readonly rootFolder: unknown = null) {}

  createSpreadsheet(name: string): ISampleSpreadsheet {
    return testContext.buildSampleSpreadsheet(name, this.rootFolder);
  }
}
```
(`SampleSpreadsheetBuilder`'s shape — `id`, `addSheet`, `appendRow`, `getUrl` — is structurally identical to `ISampleSpreadsheet`, so no cast is needed once the ambient declaration from Step 2 is in place.)

- [ ] **Step 4: Typecheck and run the online-mode build check**

```bash
npm run typecheck
npm run build:online
npm run test:build
```
Expected: PASS. `build:online` is what compiles `src/onlinetests/**`, so this is the actual verification surface for this file (it isn't covered by `npm test`).

- [ ] **Step 5: Commit (ALDO repo)**

```bash
git add vendor/gaslibs.Code.js types/gaslibs/index.d.ts src/onlinetests/GasSampleSpreadsheetFactory.ts
git commit -m "refactor: delegate GasSampleSpreadsheetFactory to GasOnlineTestFramework.SampleSpreadsheetBuilder

Removes ALDO's hand-rolled Spreadsheet-API sample-data logic now that the
generic version lives in the library. ref analysis_2_bypass_and_reimplementations.md §1b.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XsipfWZ5MdGjUugChgMLeh"
```

- [ ] **Step 6: Re-index the GasLibraryFactory graph**

Run `mcp__codebase-memory-mcp__index_repository` with `{"project_name": "home-giulio-Desktop-ALDO-implementing-GasLibraryFactory", "root_path": "/home/giulio/Desktop/ALDO implementing/GasLibraryFactory"}`, then the combined ALDO graph with `{"project_name": "home-giulio-Desktop-ALDO-implementing", "root_path": "/home/giulio/Desktop/ALDO implementing"}`, so Phases 5+ query current state.

---

## Phase 5 — `resumeJob` error boundary (`analysis_3_structural_errors.md`, Finding 2)

### Task 7: Wrap `resumeJob`'s `initAldo()`/`riprendiJobSospeso` call in a try/catch with logging

**Files:**
- Modify: `src/index.ts:40-43`
- Test: `test/unit/index.test.ts` (create if it doesn't exist)

**Interfaces:**
- Consumes: `initAldo(): ServiceContainer` and `riprendiJobSospeso(c, runner, jobName?): unknown` (both already exported from `src/config/Bootstrap.ts`, unchanged).

- [ ] **Step 1: Confirm current state**

```bash
grep -n "resumeJob" -A5 src/index.ts
```
Confirm it still matches the `analysis_3_structural_errors.md` Finding 2 description (no try/catch).

- [ ] **Step 2: Write the failing test**

Create `test/unit/index.test.ts` (mock `Bootstrap` before importing `index.ts`, since `index.ts` assigns entrypoints onto `globalThis` as an import side effect):
```ts
jest.mock('../src/config/Bootstrap', () => ({
  initAldo: jest.fn(),
  creaJobRunner: jest.fn(() => ({})),
  avviaGenerazioneDataDriven: jest.fn(),
  avviaInvioNotificheDataDriven: jest.fn(),
  avviaImportazioneDataDriven: jest.fn(),
  riprendiJobSospeso: jest.fn()
}));
jest.mock('../src/presentation/Menu', () => ({
  costruisciMenu: jest.fn(),
  menuGenerazioneDocumenti: jest.fn(),
  menuComunicazioniEmail: jest.fn(),
  menuImportazioni: jest.fn()
}));
jest.mock('../src/infrastructure/facades/UiFacade', () => ({ GasUiFacade: jest.fn() }));

import { initAldo, riprendiJobSospeso } from '../src/config/Bootstrap';
import { resumeJob } from '../src/index';

describe('resumeJob', () => {
  test('logs and does not throw when initAldo() fails', () => {
    (initAldo as jest.Mock).mockImplementation(() => {
      throw new Error('CONF_DOC row misconfigured');
    });
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => resumeJob()).not.toThrow();
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('CONF_DOC row misconfigured'));
    errorSpy.mockRestore();
  });

  test('calls riprendiJobSospeso with the initialized container and runner on success', () => {
    const container = { get: jest.fn() };
    (initAldo as jest.Mock).mockReturnValue(container);
    resumeJob();
    expect(riprendiJobSospeso).toHaveBeenCalledWith(container, expect.anything());
  });
});
```

- [ ] **Step 3: Run the test to verify the failure case fails**

```bash
npx jest --config jest.config.cjs index.test.ts
```
Expected: FAIL on the first test — `initAldo()` throwing currently propagates out of `resumeJob` uncaught, so `expect(() => resumeJob()).not.toThrow()` fails.

- [ ] **Step 4: Wrap `resumeJob`**

Change (`src/index.ts`):
```ts
/** JobRunnerLib resume trigger target (15 §5): the job name is resolved from the trigger context. */
export function resumeJob(): void {
  riprendiJobSospeso(initAldo(), creaJobRunner());
}
```
to:
```ts
/**
 * JobRunnerLib resume trigger target (15 §5): the job name is resolved from the trigger
 * context. Runs unattended (no UI, no operator watching) — unlike the interactive launchers
 * in Menu.ts, a thrown ConfigurationError here must be logged rather than vanish into the
 * trigger's execution log, mirroring Menu.ts's avvioPersonalizzato error-surfacing (ref
 * analysis_3_structural_errors.md Finding 2).
 */
export function resumeJob(): void {
  try {
    riprendiJobSospeso(initAldo(), creaJobRunner());
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`resumeJob: ripresa job fallita — ${message}`);
  }
}
```
(`console.error` is used deliberately here, not `LoggerService`: `initAldo()` itself is what just failed, so a `LoggerService` instance resolved through the same failed composition root cannot be trusted as the reporting channel. `console.error` is GAS's own unconditional execution-log sink and needs no DI.)

- [ ] **Step 5: Run the tests to verify they pass**

```bash
npx jest --config jest.config.cjs index.test.ts
npm run typecheck
npm test
```
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/index.ts test/unit/index.test.ts
git commit -m "fix: give resumeJob an error boundary around initAldo()/riprendiJobSospeso

resumeJob runs unattended as a timed trigger; an initAldo() throw previously
propagated with no logging, leaving the suspended job stuck with no operator-
visible signal. Fixes analysis_3_structural_errors.md Finding 2.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XsipfWZ5MdGjUugChgMLeh"
```

---

## Phase 6 — Relocate `documentSteps.ts`/`emailSteps.ts`/`postProcessActions.ts` (`analysis_5_code_review.md`, §6)

### Task 8: Move the three `Step` files from `infrastructure/steps/` to `application/pipelines/`

**Files:**
- Move: `src/infrastructure/steps/documentSteps.ts` → `src/application/pipelines/documentSteps.ts`
- Move: `src/infrastructure/steps/emailSteps.ts` → `src/application/pipelines/emailSteps.ts`
- Move: `src/infrastructure/steps/postProcessActions.ts` → `src/application/pipelines/postProcessActions.ts`
- Move: `test/unit/infrastructure/document-steps.test.ts` → `test/unit/application/pipelines/document-steps.test.ts`
- Move: `test/unit/infrastructure/email-steps.test.ts` → `test/unit/application/pipelines/email-steps.test.ts`
- Move: `test/unit/infrastructure/post-process-actions.test.ts` → `test/unit/application/pipelines/post-process-actions.test.ts`
- Modify: `src/application/services/DocumentGenerationService.ts:24-25`
- Modify: `src/application/services/EmailNotificationService.ts:7,21`

This is a pure relocation — no behavior change. It fixes the inverted `infrastructure → application` import direction (§6): the three files' own imports of `application/context-engine/*`, `application/email/*`, and their consumers' imports of `infrastructure/facades/*`/`infrastructure/repositories/*` are relative-path fixups only.

**Interfaces:**
- No signature changes. Only import paths move.

- [ ] **Step 1: Confirm the current consumer set hasn't changed**

```bash
cd "/home/giulio/Desktop/ALDO implementing"
grep -rln "infrastructure/steps" src/ test/ --include=*.ts
```
Expected (per current audit): exactly `src/application/services/DocumentGenerationService.ts`, `src/application/services/EmailNotificationService.ts`, `test/unit/infrastructure/document-steps.test.ts`, `test/unit/infrastructure/email-steps.test.ts`, `test/unit/infrastructure/post-process-actions.test.ts`. Also confirm via `mcp__codebase-memory-mcp__search_graph` (`qn_pattern: "infrastructure.steps"`, project `home-giulio-Desktop-ALDO-implementing`) that no other file imports from this path. If the set differs, update every additional consumer found the same way in Step 4.

- [ ] **Step 2: Create the target directory and move the three source files with git**

```bash
mkdir -p src/application/pipelines test/unit/application/pipelines
git mv src/infrastructure/steps/documentSteps.ts src/application/pipelines/documentSteps.ts
git mv src/infrastructure/steps/emailSteps.ts src/application/pipelines/emailSteps.ts
git mv src/infrastructure/steps/postProcessActions.ts src/application/pipelines/postProcessActions.ts
git mv test/unit/infrastructure/document-steps.test.ts test/unit/application/pipelines/document-steps.test.ts
git mv test/unit/infrastructure/email-steps.test.ts test/unit/application/pipelines/email-steps.test.ts
git mv test/unit/infrastructure/post-process-actions.test.ts test/unit/application/pipelines/post-process-actions.test.ts
rmdir src/infrastructure/steps 2>/dev/null; rmdir test/unit/infrastructure 2>/dev/null || true
```
(`rmdir` on `test/unit/infrastructure` only succeeds if it's now empty — if other non-`steps` test files still live there, it will simply no-op with an error that's safe to ignore, per the `|| true`.)

- [ ] **Step 3: Fix relative import paths inside the three moved files**

The files moved from `src/infrastructure/steps/` (two levels under `src/`) to `src/application/pipelines/` (also two levels under `src/`) — the directory depth from `src/` is unchanged, but the *sideways* relative paths shift. Update each moved file's imports:

In `documentSteps.ts`, change every `'../facades/...'`, `'../db/...'`, `'../repositories/...'` (previously relative to `infrastructure/`) to `'../../infrastructure/facades/...'`, `'../../infrastructure/db/...'`, `'../../infrastructure/repositories/...'`; change `'../../application/...'` and `'../../domain/...'` (previously two levels up from `infrastructure/steps/`) to `'../context-engine/...'`/`'../email/...'` (one level up to `application/`, sideways) and `'../../domain/...'` (now one level up from `application/pipelines/` to `application/`, then up to `domain/` — i.e. `'../../domain/...'` stays the same depth). Concretely for `documentSteps.ts`:
```ts
import type { Cdu } from '../../application/context-engine/Cdu';
import type { IDriveFacade } from '../facades/DriveServiceFacade';
import type { ITemplateEngine } from '../facades/TemplateEngineFacade';
import type { IExpressionEngine } from '../facades/ExpressionEngineFacade';
import type { IDatabase, Row } from '../db/Database';
import type { GeneratorStrategy } from '../../application/strategies/GeneratorStrategy';
import type { ConfigurazioneDocumento } from '../../domain/entities/ConfigurazioneDocumento';
import type { ConfigurazioneDocumentoRepository } from '../repositories/ConfigurazioneDocumentoRepository';
import type { Email } from '../../domain/value-objects/Email';
import { TABLE, COL_CONF_DOC, COL_LOG_DOCS } from '../../config/schema';
import {
  StatoDocumento,
  SchemaSottocartelle,
  GestioneSupplenti
} from '../../domain/value-objects/enums';
import { PipelineError } from '../../domain/errors/DomainError';
import { executePostProcess, type PostProcessDb } from './postProcessActions';
import { AlberoCartelle } from '../services/AlberoCartelle';
```
becomes:
```ts
import type { Cdu } from '../context-engine/Cdu';
import type { IDriveFacade } from '../../infrastructure/facades/DriveServiceFacade';
import type { ITemplateEngine } from '../../infrastructure/facades/TemplateEngineFacade';
import type { IExpressionEngine } from '../../infrastructure/facades/ExpressionEngineFacade';
import type { IDatabase, Row } from '../../infrastructure/db/Database';
import type { GeneratorStrategy } from '../strategies/GeneratorStrategy';
import type { ConfigurazioneDocumento } from '../../domain/entities/ConfigurazioneDocumento';
import type { ConfigurazioneDocumentoRepository } from '../../infrastructure/repositories/ConfigurazioneDocumentoRepository';
import type { Email } from '../../domain/value-objects/Email';
import { TABLE, COL_CONF_DOC, COL_LOG_DOCS } from '../../config/schema';
import {
  StatoDocumento,
  SchemaSottocartelle,
  GestioneSupplenti
} from '../../domain/value-objects/enums';
import { PipelineError } from '../../domain/errors/DomainError';
import { executePostProcess, type PostProcessDb } from './postProcessActions';
import { AlberoCartelle } from '../../infrastructure/services/AlberoCartelle';
```
(`./postProcessActions` stays unchanged — it's moving to the same directory as `documentSteps.ts`.) Apply the equivalent mechanical fixup to `emailSteps.ts` and `postProcessActions.ts`: any import that pointed at `../facades/*`, `../db/*`, `../repositories/*`, `../services/*` (infrastructure siblings) becomes `../../infrastructure/facades/*` etc.; any import that pointed at `../../application/*` becomes `../*` (now a same-directory-tree sibling one level up); imports of `../../domain/*` and `../../config/*` are unchanged (same relative depth from `src/`).

- [ ] **Step 4: Fix the two application-layer consumers**

In `src/application/services/DocumentGenerationService.ts`, change:
```ts
} from '../../infrastructure/steps/documentSteps';
import type { PostProcessDb } from '../../infrastructure/steps/postProcessActions';
```
to:
```ts
} from '../pipelines/documentSteps';
import type { PostProcessDb } from '../pipelines/postProcessActions';
```
In `src/application/services/EmailNotificationService.ts`, change:
```ts
import type { PostProcessDb } from '../../infrastructure/steps/postProcessActions';
...
} from '../../infrastructure/steps/emailSteps';
```
to:
```ts
import type { PostProcessDb } from '../pipelines/postProcessActions';
...
} from '../pipelines/emailSteps';
```

- [ ] **Step 5: Fix the three moved test files' imports of their subject-under-test**

In `test/unit/application/pipelines/document-steps.test.ts`, change the import that used to read `'../../../src/infrastructure/steps/documentSteps'` to `'../../../../src/application/pipelines/documentSteps'` (one extra `../` for the new `test/unit/application/pipelines/` nesting depth). Apply the same fixup to the `email-steps.test.ts` and `post-process-actions.test.ts` imports of their subjects. Also fix any of those test files' own imports of `infrastructure/facades/*`, `infrastructure/repositories/*`, etc. fakes/fixtures the same way the source files were fixed in Step 3 — check each test file's full import block, not just the subject-under-test line.

- [ ] **Step 6: Verify via the graph that no dangling `infrastructure/steps` reference remains**

```bash
grep -rn "infrastructure/steps" src/ test/ --include=*.ts
```
Expected: no output. Then re-run `mcp__codebase-memory-mcp__index_repository` for `home-giulio-Desktop-ALDO-implementing` and confirm via `search_graph` (`qn_pattern: "infrastructure.steps"`) that the graph agrees.

- [ ] **Step 7: Typecheck, lint, run the full test suite**

```bash
npm run typecheck
npm run lint
npm test
npm run test:integration
npm run test:build
```
Expected: PASS. `test:build` matters here — it validates the webpack entry still resolves every module after the path changes.

- [ ] **Step 8: Record the placement decision as an ADR**

Use `mcp__codebase-memory-mcp__manage_adr` to record: title "Pipeline Step classes live under application/pipelines, not infrastructure/steps"; context: the `PipelineFramework`-based `Step` subclasses orchestrate CDU assembly, recipe selection, and email box rendering — application-level use-case logic — so they belong in the application layer even though they're built on `PipelineFramework`'s infrastructure-facing `Step` base class; decision: relocated per `analysis_5_code_review.md` §6, future `Step` subclasses go in `src/application/pipelines/` too. (Inspect the `manage_adr` tool schema via `ToolSearch` at execution time for its exact parameter names before calling it.)

- [ ] **Step 9: Commit**

```bash
git add -A src/application/pipelines src/infrastructure/steps test/unit/application/pipelines test/unit/infrastructure src/application/services/DocumentGenerationService.ts src/application/services/EmailNotificationService.ts
git commit -m "refactor: relocate Step pipeline classes from infrastructure/steps to application/pipelines

documentSteps.ts/emailSteps.ts/postProcessActions.ts orchestrate application-
level use-case logic (CDU assembly, recipe selection, email rendering) and
were importing from application/* while living under infrastructure/ — the
wrong dependency direction for this repo's layering. Pure relocation, no
behavior change. Fixes analysis_5_code_review.md §6.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XsipfWZ5MdGjUugChgMLeh"
```

---

## Phase 7 — Dependency Inversion: extract repository interfaces (`analysis_3_structural_errors.md`, Finding 1)

### Task 9: Worked example — extract `ICarenzaRepository` and switch its application-layer consumers

**Files:**
- Create: `src/domain/repositories/ICarenzaRepository.ts`
- Modify: `src/application/services/ReportService.ts` (and any other consumer discovered in Step 1)
- No change to `src/infrastructure/repositories/CarenzaRepository.ts` itself (it implicitly satisfies the new interface structurally — TS structural typing needs no `implements` clause for this to typecheck at call sites using `import type`, but add `implements ICarenzaRepository` explicitly for a compile-time contract check).

**Interfaces:**
- Produces: `ICarenzaRepository` with the same 5 public methods `CarenzaRepository` currently exposes (`findByAlunno`, `findByClasse`, `findNonNotificate`, `getCarenzePerMateria`, `setCarenzaMateria`), mirroring `IClasseRepository.ts`'s shape (a plain interface in `src/domain/repositories/`, no base-class dependency).

- [ ] **Step 1: Discover every current consumer of the concrete `CarenzaRepository` type**

```bash
cd "/home/giulio/Desktop/ALDO implementing"
grep -rln "CarenzaRepository" src/application/ src/presentation/ src/config/
```
Use `mcp__codebase-memory-mcp__search_graph` (`name_pattern: "CarenzaRepository"`, project `home-giulio-Desktop-ALDO-implementing`) to cross-check. Expect `src/application/services/ReportService.ts` and `src/config/Bootstrap.ts` (the composition root — leave Bootstrap.ts importing the **concrete** class; only application-layer files switch to the interface).

- [ ] **Step 2: Create `ICarenzaRepository.ts`**

```ts
import type { Carenza } from '../entities/Carenza';
import type { Alunno } from '../entities/Alunno';
import type { Classe } from '../entities/Classe';
import type { MateriaId } from '../value-objects/MateriaId';
import type { ValoreCarenza } from '../value-objects/ValoreCarenza';
import type { AnnoScolastico } from '../value-objects/AnnoScolastico';

export interface ICarenzaRepository {
  findByAlunno(alunno: Alunno, options?: { annoScolastico?: AnnoScolastico }): Carenza[];
  findByClasse(classe: Classe, data?: Date): Carenza[];
  findNonNotificate(): Carenza[];
  getCarenzePerMateria(carenza: Carenza): Map<MateriaId, ValoreCarenza>;
  setCarenzaMateria(carenza: Carenza, materia: MateriaId, valore: ValoreCarenza | null): void;
}
```

- [ ] **Step 3: Add an explicit `implements` on the concrete class**

In `src/infrastructure/repositories/CarenzaRepository.ts`, add the import and clause:
```ts
import type { ICarenzaRepository } from '../../domain/repositories/ICarenzaRepository';
...
export class CarenzaRepository extends Repository<Carenza> implements ICarenzaRepository {
```

- [ ] **Step 4: Switch `ReportService.ts`'s import to `import type`**

Change:
```ts
import { CarenzaRepository } from '../../infrastructure/repositories/CarenzaRepository';
```
to:
```ts
import type { ICarenzaRepository } from '../../domain/repositories/ICarenzaRepository';
```
Then update every constructor parameter / field type in `ReportService.ts` that was typed `CarenzaRepository` to `ICarenzaRepository` (the concrete instance is still resolved via `ServiceContainer.get<ICarenzaRepository>('carenzaRepository')` in `Bootstrap.ts`'s registration of `ReportService`, unchanged — `ServiceContainer.get<T>` is already a string-keyed generic lookup, so no wiring change is needed there, only the type parameter at the call site).

- [ ] **Step 5: Typecheck and run the affected tests**

```bash
npm run typecheck
npx jest --config jest.config.cjs report-service carenza-repository
npm test
```
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/domain/repositories/ICarenzaRepository.ts src/infrastructure/repositories/CarenzaRepository.ts src/application/services/ReportService.ts
git commit -m "refactor: extract ICarenzaRepository, switch ReportService to depend on the interface

First of 12 remaining repository interfaces per analysis_3_structural_errors.md
Finding 1 — Application currently imports concrete Infrastructure repository
classes for every repository except ClasseRepository.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XsipfWZ5MdGjUugChgMLeh"
```

### Task 10: Replicate the interface-extraction recipe for the remaining repositories consumed by application-layer files

**Files:** one `src/domain/repositories/I<X>Repository.ts` per repository discovered below, plus every application-layer file importing it.

**Interfaces:** each new `I<X>Repository` mirrors that repository's current full public method surface (no additions, no omissions) — discovered live per repository, not pre-enumerated here, because `analysis_5_code_review.md`'s own methodology note records that graph-level `IMPORTS` edges don't resolve cleanly for this TS import style, so the accurate consumer set must come from a source-level `grep`/`search_code` pass at execution time, not from the analysis snapshot.

- [ ] **Step 1: Enumerate every concrete repository class imported (not `import type`-only) by a file under `src/application/**` or `src/presentation/**`, excluding files already relocated in Phase 6 into `src/application/pipelines/` (they're covered by the same pass) and excluding `ClasseRepository`/`CarenzaRepository` (already interfaced)**

```bash
cd "/home/giulio/Desktop/ALDO implementing"
grep -rlEn "^import \{ [A-Za-z]+Repository \} from '\.\./\.\./infrastructure/repositories/" src/application/ | sort -u
```
Cross-check with `mcp__codebase-memory-mcp__search_code` (pattern: `"Repository'" `, project `home-giulio-Desktop-ALDO-implementing`, scoped to `src/application/`) for anything the grep's exact-import-shape assumption might miss (e.g. multi-named imports on one line). Build a table of `{repository class} → {consuming file(s)}` from the real output — this replaces the "14 files total" / "13 repositories" approximation in `analysis_3_structural_errors.md` §1 with the current, exact set.

- [ ] **Step 2: For each repository in the table, repeat Task 9's Steps 2-6 exactly**

For each `{RepoName}`:
1. `get_code_snippet` (or `Read`) the repository's full source to enumerate its current public methods precisely (do not assume the analysis's method list is still current).
2. Create `src/domain/repositories/I{RepoName}.ts` with exactly those public methods, following `ICarenzaRepository.ts`'s shape (plain interface, `import type` for every entity/VO parameter/return type).
3. Add `implements I{RepoName}` to the concrete class in `src/infrastructure/repositories/{RepoName}.ts`.
4. In every consuming application-layer file, switch the import to `import type { I{RepoName} } from '.../domain/repositories/I{RepoName}'` and retype every field/parameter that held the concrete class.
5. `npm run typecheck && npx jest --config jest.config.cjs {kebab-case repo name}` — fix any fallout before moving to the next repository (a shared consumer file touched by two repositories in the same pass is expected — typecheck the whole file each time, not just the one interface).
6. Commit once per repository (small, reviewable diffs), reusing Task 9's commit message shape with the repository name substituted.

- [ ] **Step 3: Full-suite verification after the last repository**

```bash
npm run typecheck
npm run lint
npm test
npm run test:integration
```
Expected: PASS.

- [ ] **Step 4: Graph-verify the inversion is actually closed**

Re-run `mcp__codebase-memory-mcp__index_repository` for `home-giulio-Desktop-ALDO-implementing`, then run:
```bash
grep -rlEn "^import \{ [A-Za-z]+Repository \} from '\.\./\.\./infrastructure/repositories/" src/application/
```
Expected: no output (every remaining repository import under `src/application/` is now `import type { I...Repository }`). Use `mcp__codebase-memory-mcp__query_graph` to confirm no `Module-[:IMPORTS]->Module` edge exists from an `application/` module to an `infrastructure/repositories/` module for a value (non-type) import — cross-check against the grep since this file style previously didn't resolve cleanly per `analysis_5_code_review.md`'s methodology note.

- [ ] **Step 5: Final commit for this phase (if any cleanup remains outside the per-repository commits)**

```bash
git status --short
# only if uncommitted cleanup remains:
git add -A
git commit -m "chore: finish repository DIP interface extraction — application layer depends only on I<X>Repository interfaces

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XsipfWZ5MdGjUugChgMLeh"
```

---

## Phase 8 — GasLibraryFactory-owned defensive-coding gaps (`analysis_3_structural_errors.md`, Findings 3 & 4)

### Task 11: `MyMustache` — add a nesting-depth cap and a partial-cycle guard (GasLibraryFactory repo)

**Files (GasLibraryFactory repo):**
- Modify: `GasLibraryFactory/WorkspaceTemplateEngine/src/facades/Mustache.js`
- Modify: `GasLibraryFactory/WorkspaceTemplateEngine/index.js`
- Test: `GasLibraryFactory/WorkspaceTemplateEngine/src/__tests__/Mustache.test.js`

**Interfaces:**
- Produces: `MustacheRenderError extends BaseError` (new, exported), `MyMustache.MAX_RENDER_DEPTH` (new static constant, default `100`). `render()`'s public signature (`render(template, data, additionalPartials)`) is unchanged; the new `state` parameter threaded through `_renderTokens`/`_renderSection`/`_renderInverted`/`_renderPartial` is private/internal.

- [ ] **Step 1: Verify current state**

```bash
cd "/home/giulio/Desktop/ALDO implementing/GasLibraryFactory"
grep -n "MAX_RENDER_DEPTH\|MustacheRenderError\|partialStack" WorkspaceTemplateEngine/src/facades/Mustache.js
```
Expected: no hits.

- [ ] **Step 2: Write the failing tests**

Add to `GasLibraryFactory/WorkspaceTemplateEngine/src/__tests__/Mustache.test.js` (a new `describe` block, following the file's existing `new MyMustache({...})`/`.render(...)` test style — inspect the top of the file first for its exact import/instantiation pattern before adding):
```js
describe('MyMustache render-depth and partial-cycle guards', () => {
  test('throws MustacheRenderError instead of overflowing the call stack on a self-referencing partial', () => {
    const mustache = new MyMustache({ logger: console, partials: { loop: 'A {{> loop}} B' } });
    const result = mustache.render('{{> loop}}');
    expect(result).toMatch(/RENDER ERROR/);
    expect(result).toMatch(/ciclico|cycl/i);
  });

  test('throws MustacheRenderError instead of overflowing the call stack on pathologically deep section nesting', () => {
    const depth = 500;
    const template = '{{#a}}'.repeat(depth) + 'x' + '{{/a}}'.repeat(depth);
    const mustache = new MyMustache({ logger: console });
    const result = mustache.render(template, { a: { a: {} } });
    expect(result).toMatch(/RENDER ERROR/);
  });

  test('normal, shallow nested sections still render correctly (no regression)', () => {
    const mustache = new MyMustache({ logger: console });
    const result = mustache.render('{{#a}}{{#b}}{{c}}{{/b}}{{/a}}', { a: { b: { c: 'ok' } } });
    expect(result).toBe('ok');
  });

  test('non-cyclic nested partials still render correctly (no regression)', () => {
    const mustache = new MyMustache({
      logger: console,
      partials: { header: 'H', footer: 'F {{> header}}' }
    });
    expect(mustache.render('{{> footer}}')).toBe('F H');
  });
});
```

- [ ] **Step 3: Run the tests to verify the guard tests fail**

```bash
npx jest WorkspaceTemplateEngine/src/__tests__/Mustache.test.js
```
Expected: the first two tests FAIL (`RangeError: Maximum call stack size exceeded` instead of a caught `[RENDER ERROR: ...]` string, or a Jest timeout); the two regression tests currently PASS.

- [ ] **Step 4: Add `MustacheRenderError` and `MAX_RENDER_DEPTH`**

At the top of `GasLibraryFactory/WorkspaceTemplateEngine/src/facades/Mustache.js`, add the import and error class:
```js
import { FilterRegistry, FilterStrategy } from '../FilterStrategy.js';
import { createBuiltInFilters } from '../internal/filters/BuiltInFilters.js';
import { createAdvancedFilters } from '../internal/filters/AdvancedFilters.js';
import { BaseError } from '@CoreUtilsLib';

/**
 * @class MustacheRenderError
 * @extends BaseError
 * @description Thrown when template rendering exceeds the maximum nesting depth or
 * detects a self-referencing partial cycle — surfaces a catchable, diagnosable error
 * instead of an opaque call-stack overflow when a data-driven CONF_DOC/CONF_MAIL
 * template is malformed (ref analysis_3_structural_errors.md Finding 3).
 */
class MustacheRenderError extends BaseError {}
```
In the `MyMustache` class, add the depth-cap constant next to the other static getters (after `TAG_TEXT`):
```js
  /** @description Maximum combined section/partial nesting depth before render() throws MustacheRenderError. @static */
  static get MAX_RENDER_DEPTH() {
    return 100;
  }
```

- [ ] **Step 5: Thread `state` through `render()` and the four recursive methods**

In `render()`:
```js
    try {
      const tokens = this._parse(template);
      const context = new _MustacheContext(data);
      const partials = { ...this.partials, ...additionalPartials };
      const state = { depth: 0, partialStack: [] };
      return this._renderTokens(tokens, context, partials, template, state);
    } catch (e) {
```
In `_renderTokens`:
```js
  _renderTokens(tokens, context, partials, originalTemplate, state) {
    // WTE-H007: Use array and join for efficient string concatenation
    const parts = [];
    for (const token of tokens) {
      // WTE-M009: Use named constants for token indices
      const symbol = token[MyMustache.TOKEN_TYPE];
      let value;
      if (symbol === '#') {
        value = this._renderSection(token, context, partials, originalTemplate, state);
      } else if (symbol === '^') {
        value = this._renderInverted(token, context, partials, originalTemplate, state);
      } else if (symbol === '>') {
        value = this._renderPartial(token, context, partials, state);
      } else if (symbol === '&') {
        value = this._unescapedValue(token, context);
      } else if (symbol === 'name') {
        value = this._escapedValue(token, context);
      } else if (symbol === 'text') {
        value = token[MyMustache.TOKEN_VALUE];
      }
      if (value !== undefined) {
        parts.push(value);
      }
    }
    return parts.join('');
  }
```
In `_renderSection`:
```js
  _renderSection(token, context, partials, originalTemplate, state) {
    if (state.depth >= MyMustache.MAX_RENDER_DEPTH) {
      throw new MustacheRenderError(
        `Superata la profondità massima di annidamento (${MyMustache.MAX_RENDER_DEPTH}) nella sezione "${token[1]}"`
      );
    }
    const childState = { depth: state.depth + 1, partialStack: state.partialStack };
    // WTE-H007: Use array and join for efficient string concatenation
    const parts = [];
    const self = this;
    const value = this._lookupValue(token, context);
    function subRender(template) {
      return self.render(template, context, partials);
    }
    if (!value) {
      return;
    }

    if (Array.isArray(value)) {
      // Enhanced array iteration with meta-variables
      const total = value.length;
      for (let i = 0; i < total; i++) {
        const item = value[i];
        // Create decorated view with meta-variables
        const decoratedItem = this._createLoopContext(item, i, total);
        parts.push(
          this._renderTokens(token[4], context.push(decoratedItem), partials, originalTemplate, childState)
        );
      }
    } else if (typeof value === 'object') {
      // For non-array objects, just push onto context stack (standard Mustache behavior)
      // Note: Object key iteration is not supported in standard Mustache
      // Users should convert objects to arrays if they need iteration with @key
      parts.push(this._renderTokens(token[4], context.push(value), partials, originalTemplate, childState));
    } else if (typeof value === 'function') {
      const text = originalTemplate.slice(token[3], token[5]);
      const result = value.call(context.view, text, subRender);
      if (result != null) {
        parts.push(result);
      }
    } else {
      parts.push(this._renderTokens(token[4], context, partials, originalTemplate, childState));
    }
    return parts.join('');
  }
```
In `_renderInverted`:
```js
  _renderInverted(token, context, partials, originalTemplate, state) {
    if (state.depth >= MyMustache.MAX_RENDER_DEPTH) {
      throw new MustacheRenderError(
        `Superata la profondità massima di annidamento (${MyMustache.MAX_RENDER_DEPTH}) nella sezione invertita "${token[1]}"`
      );
    }
    const value = this._lookupValue(token, context);
    if (!value || (Array.isArray(value) && value.length === 0)) {
      return this._renderTokens(token[4], context, partials, originalTemplate, {
        depth: state.depth + 1,
        partialStack: state.partialStack
      });
    }
  }
```
In `_renderPartial`:
```js
  _renderPartial(token, context, partials, state) {
    if (!partials) {
      return;
    }
    const partialName = token[1];
    if (state.depth >= MyMustache.MAX_RENDER_DEPTH) {
      throw new MustacheRenderError(
        `Superata la profondità massima di annidamento (${MyMustache.MAX_RENDER_DEPTH}) nel partial "${partialName}"`
      );
    }
    if (state.partialStack.includes(partialName)) {
      throw new MustacheRenderError(
        `Riferimento ciclico nel partial "${partialName}" (catena: ${state.partialStack.join(' > ')} > ${partialName})`
      );
    }
    const value = typeof partials === 'function' ? partials(partialName) : partials[partialName];
    if (value != null) {
      const tokens = this._parse(String(value));
      state.partialStack.push(partialName);
      try {
        return this._renderTokens(tokens, context, partials, String(value), {
          depth: state.depth + 1,
          partialStack: state.partialStack
        });
      } finally {
        state.partialStack.pop();
      }
    }
  }
```

- [ ] **Step 6: Export `MustacheRenderError`**

At the bottom of `Mustache.js`, change:
```js
export { MyMustache as Mustache, _MustacheContext as MustacheContext };
```
to:
```js
export { MyMustache as Mustache, _MustacheContext as MustacheContext, MustacheRenderError };
```
In `GasLibraryFactory/WorkspaceTemplateEngine/index.js`, change:
```js
export { Mustache } from './src/facades/Mustache';
```
to:
```js
export { Mustache, MustacheRenderError } from './src/facades/Mustache';
```

- [ ] **Step 7: Run the tests to verify they pass**

```bash
npx jest WorkspaceTemplateEngine/src/__tests__/Mustache.test.js
```
Expected: all 4 tests PASS. Note: `render()`'s existing outer `try/catch` already catches the thrown `MustacheRenderError` and converts it to the `[RENDER ERROR: ...]` diagnostic string — this is why the tests assert on the returned string, not a thrown exception; the fix's value is that the *logged* error (`this.logger.error(...)` inside that same catch block) now carries a clear `MustacheRenderError` name and message instead of a raw V8 stack-overflow trace.

- [ ] **Step 8: Full suite + lint**

```bash
cd "/home/giulio/Desktop/ALDO implementing/GasLibraryFactory"
npm test
npx eslint . --quiet
```
Expected: PASS.

- [ ] **Step 9: Commit (GasLibraryFactory repo)**

```bash
cd "/home/giulio/Desktop/ALDO implementing/GasLibraryFactory"
git add WorkspaceTemplateEngine/src/facades/Mustache.js WorkspaceTemplateEngine/index.js WorkspaceTemplateEngine/src/__tests__/Mustache.test.js
git commit -m "fix(WorkspaceTemplateEngine): add nesting-depth cap and partial-cycle guard to MyMustache

A self-referencing partial or pathologically deep {{#section}} nesting
(both reachable from user-editable CONF_DOC/CONF_MAIL templates) previously
overflowed the call stack with an opaque RangeError. Fixes
analysis_3_structural_errors.md Finding 3.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XsipfWZ5MdGjUugChgMLeh"
```

### Task 12: `DocumentContentExtractor.scanDocumentStructure` — add the missing Phase 1 iteration cap (GasLibraryFactory repo)

**Files (GasLibraryFactory repo):**
- Modify: `GasLibraryFactory/GoogleApiWrapper/src/internal/services-managers/DocumentContentExtractor.js:189-284`
- Test: existing `DocumentContentExtractor` test file (`find GoogleApiWrapper -iname "DocumentContentExtractor.test.js"`)

**Interfaces:**
- No signature change to `scanDocumentStructure(documentId, textPatterns)`. Internal-only: Phase 1's table-extraction loop gains the same `MAX_ITERATIONS` cap Phase 2 (text scan) already has.

- [ ] **Step 1: Verify current state**

```bash
cd "/home/giulio/Desktop/ALDO implementing/GasLibraryFactory"
sed -n '185,230p' GoogleApiWrapper/src/internal/services-managers/DocumentContentExtractor.js
find GoogleApiWrapper -iname "DocumentContentExtractor.test.js"
```
Confirm Phase 1's `for (const element of structure.body.content)` loop still has no iteration cap while Phase 2's does.

- [ ] **Step 2: Write the failing test**

Add to the located `DocumentContentExtractor.test.js` (match its existing mocking style for `this.facade.getRawDocumentStructure`/`Docs.Documents.get` — inspect the file's `beforeEach`/fixture setup first):
```js
test('scanDocumentStructure caps Phase 1 table extraction at MAX_ITERATIONS and logs a warning', () => {
  const hugeContent = Array.from({ length: 10005 }, (_, i) => ({
    type: 'TABLE',
    startIndex: i,
    tableRows: []
  }));
  extractor.facade.getRawDocumentStructure = jest.fn(() => ({ body: { content: hugeContent } }));
  const result = extractor.scanDocumentStructure('doc-1', []);
  expect(result.tables.length).toBeLessThanOrEqual(10000);
  expect(extractor._logger.warn).toHaveBeenCalledWith(
    expect.stringContaining('maximum iteration limit')
  );
});
```
(Adapt `extractor`/mock-construction to however the existing test file in this location instantiates `DocumentContentExtractor` and its `_logger`/`facade` collaborators — match the file's established fixture pattern rather than introducing a new one.)

- [ ] **Step 3: Run the test to verify it fails**

```bash
npx jest GoogleApiWrapper --testPathPattern DocumentContentExtractor
```
Expected: FAIL — `result.tables.length` is currently `10005` (no cap) and no warning was logged.

- [ ] **Step 4: Add the Phase 1 guard**

Change:
```js
      // PHASE 1: Extract tables from POJO structure
      for (const element of structure.body.content) {
        if (element.type === 'TABLE') {
```
to:
```js
      // PHASE 1: Extract tables from POJO structure
      let phase1IterationCount = 0;
      const PHASE1_MAX_ITERATIONS = 10000;
      for (const element of structure.body.content) {
        if (++phase1IterationCount > PHASE1_MAX_ITERATIONS) {
          this._logger.warn(`Reached maximum iteration limit (${PHASE1_MAX_ITERATIONS}) while extracting tables`);
          break;
        }
        if (element.type === 'TABLE') {
```
(No other lines in the Phase 1 block change — the closing braces of the existing `for`/`if` structure already match.)

- [ ] **Step 5: Run the test to verify it passes, then the full suite**

```bash
npx jest GoogleApiWrapper --testPathPattern DocumentContentExtractor
cd "/home/giulio/Desktop/ALDO implementing/GasLibraryFactory"
npm test
npx eslint . --quiet
```
Expected: PASS.

- [ ] **Step 6: Commit (GasLibraryFactory repo)**

```bash
cd "/home/giulio/Desktop/ALDO implementing/GasLibraryFactory"
git add GoogleApiWrapper/src/internal/services-managers/DocumentContentExtractor.js GoogleApiWrapper/src/internal/services-managers/__tests__/DocumentContentExtractor.test.js
git commit -m "fix(GoogleApiWrapper): cap Phase 1 table-extraction iterations in scanDocumentStructure

Phase 2 (text scan) already had a MAX_ITERATIONS guard against deeply nested/
legacy-converted document structures; Phase 1 (table extraction) was missing
the identical guard. Fixes analysis_3_structural_errors.md Finding 4.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XsipfWZ5MdGjUugChgMLeh"
```
(Adjust the `git add` test file path to wherever Step 1's `find` located it, if different from the guessed `__tests__/` convention.)

### Task 13: Pull the two GasLibraryFactory fixes into ALDO

**Files (ALDO repo):**
- Modify: `vendor/gaslibs.Code.js` (regenerated)

- [ ] **Step 1: Refresh vendor and verify**

```bash
cd "/home/giulio/Desktop/ALDO implementing"
npm run refresh:vendor
npm run verify:vendor
```

- [ ] **Step 2: Run ALDO's full offline suite (these two fixes have no ALDO-side call-site changes, so this is a regression check only)**

```bash
npm test
npm run test:integration
npm run typecheck
npm run lint
```
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add vendor/gaslibs.Code.js
git commit -m "chore: refresh vendored GasLibraryFactory bundle (Mustache depth guard, DocumentContentExtractor Phase 1 cap)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XsipfWZ5MdGjUugChgMLeh"
```

- [ ] **Step 4: Re-index both graphs**

Run `mcp__codebase-memory-mcp__index_repository` for both `home-giulio-Desktop-ALDO-implementing-GasLibraryFactory` and `home-giulio-Desktop-ALDO-implementing` before starting Phase 9.

---

## Phase 9 — Confirmed dead code cleanup (`analysis_4_dead_code.md`, §A2.4)

Every task in this phase starts with a live re-verification step, since `analysis_4_dead_code.md` explicitly warns its per-item "how to proceed" notes are "starting points... re-check current call sites... before acting on any of them." Do not skip Step 1 in any task below.

### Task 14: Delete `Supplenza`'s 3 dead members (`isAttivaOggi`, `supplenteEmail`, `titolareEmail`)

**Files:**
- Modify: `src/domain/entities/Supplenza.ts`

- [ ] **Step 1: Re-verify zero callers**

```bash
cd "/home/giulio/Desktop/ALDO implementing"
grep -rn "\.isAttivaOggi(\|\.supplenteEmail\b\|\.titolareEmail\b" src/ test/ --include=*.ts | grep -v "Supplenza.ts"
```
Use `mcp__codebase-memory-mcp__search_graph` (`name_pattern: "isAttivaOggi|supplenteEmail|titolareEmail"`, project `home-giulio-Desktop-ALDO-implementing`) to cross-check for any caller the grep missed (e.g. via a base-class duck-typed dispatch — not expected here since these are plain getters/methods, not `AldoEntity`-hooked). Expected: no output beyond comment references (e.g. `test/unit/application/risolutore-ruoli-service.test.ts:321`'s comment mentioning `titolareEmail` in prose, not a call — confirm it's still just a comment).

- [ ] **Step 2: Delete the three members**

In `src/domain/entities/Supplenza.ts`, remove:
```ts
  get titolareEmail(): Email {
    return Email.of(this.titolare);
  }
  get supplenteEmail(): Email {
    return Email.of(this.supplente);
  }
```
(immediately before `getPeriodo()`) and:
```ts
  isAttivaOggi(): boolean {
    return this.isAttivaData(new Date());
  }
```
(immediately before `isAttivaData`, which stays). If the `Email` import becomes unused after this deletion, remove `import { Email } from '../value-objects/Email';` too — check with:
```bash
grep -n "Email" src/domain/entities/Supplenza.ts
```

- [ ] **Step 3: Typecheck and test**

```bash
npm run typecheck
npx jest --config jest.config.cjs supplenza
npm test
```
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/domain/entities/Supplenza.ts
git commit -m "refactor: remove dead Supplenza.isAttivaOggi/supplenteEmail/titolareEmail

Zero callers anywhere — isAttivaData(new Date()) and the raw
supplente/titolare string fields are what every real caller already uses.
Fixes analysis_4_dead_code.md A2.4.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XsipfWZ5MdGjUugChgMLeh"
```

### Task 15: Delete `LogEmail.isFailed` and `LogCartella.getLink`

**Files:**
- Modify: `src/domain/entities/LogEmail.ts`
- Modify: `src/domain/entities/LogCartella.ts`

- [ ] **Step 1: Re-verify zero callers (both independently — they're unrelated classes)**

```bash
cd "/home/giulio/Desktop/ALDO implementing"
grep -rn "\.isFailed(" src/ test/ --include=*.ts
grep -rn "\.getLink(" src/ test/ --include=*.ts
```
For `getLink`, confirm every hit resolves to `LogDocumento.getLink()` (which stays — used by `DocumentiProvider`/`StoricoDocumentiService`, confirmed live in `analysis_4_dead_code.md`), not `LogCartella.getLink()`. `test/unit/infrastructure/log-repositories.test.ts:54`'s `f1.getLink()` is on a `LogDocumentoRepository`-sourced entity, confirmed by that file's imports — re-confirm this hasn't changed before deleting.

- [ ] **Step 2: Delete `LogEmail.isFailed`**

In `src/domain/entities/LogEmail.ts`, remove:
```ts
  isFailed(): boolean {
    return this.stato === StatoEmail.ERROR;
  }
```
(between `getDestinatari()` and `getAllegati()`). `StatoEmail` stays imported (used elsewhere in the same file for `this.stato`'s type and `StatoEmail.PENDING` default).

- [ ] **Step 3: Delete `LogCartella.getLink`**

In `src/domain/entities/LogCartella.ts`, remove:
```ts
  getLink(): string {
    return typeof this.raw[COL_LOG_FOLD.LINK] === 'string'
      ? (this.raw[COL_LOG_FOLD.LINK] as string)
      : '';
  }
```
(the method immediately before `containsClasse`).

- [ ] **Step 4: Typecheck and test**

```bash
npm run typecheck
npx jest --config jest.config.cjs log-email log-cartella log-repositories
npm test
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/entities/LogEmail.ts src/domain/entities/LogCartella.ts
git commit -m "refactor: remove dead LogEmail.isFailed and LogCartella.getLink

isFailed duplicates LogEmailRepository.findFailed()'s collection-level filter;
LogCartella.getLink has no caller (unlike the sibling LogDocumento.getLink,
which stays — actively used by DocumentiProvider/StoricoDocumentiService).
Fixes analysis_4_dead_code.md A2.4.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XsipfWZ5MdGjUugChgMLeh"
```

### Task 16: Delete `VariazioneCattedra`'s 2 dead getters and `Carenza`'s 2 dead getters

**Files:**
- Modify: `src/domain/entities/VariazioneCattedra.ts`
- Modify: `src/domain/entities/Carenza.ts`

- [ ] **Step 1: Re-verify zero callers**

```bash
cd "/home/giulio/Desktop/ALDO implementing"
grep -rn "\.nuovoTitolareEmail\b\|\.vecchioTitolareEmail\b" src/ test/ --include=*.ts | grep -v VariazioneCattedra.ts
grep -rn "\.classeId\b\|\.studenteEmail\b" src/ test/ --include=*.ts | grep -v -e "Carenza.ts" -e "ClasseId" -e "classeId:" -e "classeIdRaw"
```
For the `Carenza` grep, manually confirm every remaining hit is a different `.classeId`/`.studenteEmail` (e.g. `Progetto.classeId`, other entities — those are handled in Task 17) and not a genuine new caller of `Carenza.classeId`/`Carenza.studenteEmail`.

- [ ] **Step 2: Delete `VariazioneCattedra`'s two getters**

In `src/domain/entities/VariazioneCattedra.ts`, remove:
```ts
  get nuovoTitolareEmail(): Email {
    return Email.of(this.nuovoTitolare);
  }
  get vecchioTitolareEmail(): Email {
    return Email.of(this.vecchioTitolare);
  }
```
(before `applicaAClasse`). If `Email` becomes unused, drop `import { Email } from '../value-objects/Email';`.

- [ ] **Step 3: Delete `Carenza`'s two getters**

In `src/domain/entities/Carenza.ts`, remove:
```ts
  get studenteEmail(): Email {
    return Email.of(this.studente);
  }
  get classeId(): ClasseId {
    return ClasseId.of(this.classe);
  }
```
(before `getCella`). `ClasseId` and `Email` are both imported at the top of this file (`import { Email } from '../value-objects/Email'; import { ClasseId } from '../value-objects/ClasseId';`) — check whether either becomes unused (`ClasseId` is a value import, not `import type`, used nowhere else in this file per the current source, so it will need removing; `Email` likewise).

- [ ] **Step 4: Typecheck and test**

```bash
npm run typecheck
npx jest --config jest.config.cjs variazione-cattedra carenza
npm test
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/entities/VariazioneCattedra.ts src/domain/entities/Carenza.ts
git commit -m "refactor: remove dead VariazioneCattedra/Carenza Email/ClasseId-wrapping getters

Zero callers — every real call site reads the raw nuovoTitolare/vecchioTitolare/
classe/studente string fields directly. Fixes analysis_4_dead_code.md A2.4.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XsipfWZ5MdGjUugChgMLeh"
```

### Task 17: Delete the remaining property-duplication getters (`Progetto`, `MovimentoAlunno`, `OreASL`, `Piano`)

**Files:**
- Modify: `src/domain/entities/Progetto.ts`
- Modify: `src/domain/entities/MovimentoAlunno.ts`
- Modify: `src/domain/entities/OreASL.ts`
- Modify: `src/domain/entities/Piano.ts`

- [ ] **Step 1: Re-verify zero callers for all 5 methods across all 4 files**

```bash
cd "/home/giulio/Desktop/ALDO implementing"
grep -rn "\.classeId\b" src/ test/ --include=*.ts | grep Progetto
grep -rn "\.studenteEmail\b" src/ test/ --include=*.ts | grep -e MovimentoAlunno -e OreASL -e Piano
grep -rn "\.annoScolastico\b" src/ test/ --include=*.ts | grep OreASL
```
(These greps are advisory — the string patterns `.classeId`/`.studenteEmail`/`.annoScolastico` match across multiple classes; manually confirm each hit's receiver type from surrounding context, same caution as Task 16 Step 1.)

- [ ] **Step 2: Delete `Progetto.classeId`**

In `src/domain/entities/Progetto.ts`, remove:
```ts
  get classeId(): ClasseId {
    return ClasseId.of(this.classe);
  }
```
(before `isASL`). `ClasseId` is imported as a value (`import { ClasseId } from '../value-objects/ClasseId';`) — check it isn't used elsewhere in the file before removing the import; it currently isn't, so remove the import line too.

- [ ] **Step 3: Delete `MovimentoAlunno.studenteEmail`**

In `src/domain/entities/MovimentoAlunno.ts`, remove:
```ts
  get studenteEmail(): Email {
    return Email.of(this.studente);
  }
```
(before `isIngresso`). Remove `import { Email } from '../value-objects/Email';` (unused after this deletion — check first).

- [ ] **Step 4: Delete `OreASL.studenteEmail` and `OreASL.annoScolastico`**

In `src/domain/entities/OreASL.ts`, remove:
```ts
  get studenteEmail(): Email {
    return Email.of(this.studente);
  }
  get annoScolastico(): AnnoScolastico {
    return AnnoScolastico.of(this.anno);
  }
```
(before `getOre`). **Keep both `Email` and `AnnoScolastico` imports** — `Email` is still used by the static `create(studente: Email, anno: AnnoScolastico)` factory method's parameter types later in the same file, and `AnnoScolastico` likewise.

- [ ] **Step 5: Delete `Piano.studenteEmail`**

In `src/domain/entities/Piano.ts`, remove:
```ts
  get studenteEmail(): Email {
    return Email.of(this.studente);
  }
```
(before `isBES`). Remove `import { Email } from '../value-objects/Email';` (unused after this deletion — check first).

- [ ] **Step 6: Typecheck and test**

```bash
npm run typecheck
npx jest --config jest.config.cjs progetto movimento-alunno ore-asl piano
npm test
```
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/domain/entities/Progetto.ts src/domain/entities/MovimentoAlunno.ts src/domain/entities/OreASL.ts src/domain/entities/Piano.ts
git commit -m "refactor: remove remaining dead property-duplication getters (Progetto/MovimentoAlunno/OreASL/Piano)

Zero callers — every real call site reads the raw classe/studente/anno string
fields directly. Fixes analysis_4_dead_code.md A2.4.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XsipfWZ5MdGjUugChgMLeh"
```

### Task 18: Delete the dead repository pass-through methods

**Files:**
- Modify: `src/infrastructure/repositories/ConfigurazioneDocumentoRepository.ts`
- Modify: `src/infrastructure/repositories/ConfigurazioneEmailRepository.ts`
- Modify: `src/infrastructure/repositories/AlunnoRepository.ts`
- Modify: `src/infrastructure/repositories/RuoloSpecialeRepository.ts`

- [ ] **Step 1: Re-verify zero callers — and critically, distinguish repository-level calls from entity-level calls of the same method name**

```bash
cd "/home/giulio/Desktop/ALDO implementing"
grep -rn "confDocRepo\.findAllCached(\|confMailRepo\.findAllCached(" src/ test/ --include=*.ts
grep -rn "alunnoRepo\.getCurriculum(\|alunnoRepo\.getTutors(\|\.repo\.getTutors(\|\.repo\.getCurriculum(" src/ test/ --include=*.ts
grep -rn "ruoliRepo\.getEmails(\|ruoloRepo\.getEmails(" src/ test/ --include=*.ts
```
These grep patterns are illustrative, not exhaustive (the analysis itself found these via full type-checked cross-reference, not grep alone) — the reliable check is: open each repository file, find the method, and confirm no file passes an `Alunno`/`RuoloSpeciale` instance into `AlunnoRepository.getCurriculum(alunno)`/`.getTutors(alunno)`/`RuoloSpecialeRepository.getEmails(ruolo)` (as opposed to calling `alunno.getCurriculum()`/`.getTutors()`/`ruolo.getEmails()` directly on the entity, which is the live path and stays). Confirmed during plan research: `test/unit/infrastructure/alunno-repository.test.ts:24-37` calls `.getTutors()`/`.getCurriculum()` on the **entity** (`a = repo().findById(...)`, then `a.getTutors()`), not on the repository — safe. `test/unit/infrastructure/ruolo-speciale-repository.test.ts:18,24` calls `.getEmails()` on `RuoloSpeciale.fromData(...)` (the **entity**), not the repository — safe. Re-confirm this is still true before deleting.

- [ ] **Step 2: Delete `ConfigurazioneDocumentoRepository.findAllCached` and `ConfigurazioneEmailRepository.findAllCached`**

In `src/infrastructure/repositories/ConfigurazioneDocumentoRepository.ts`, remove:
```ts
  findAllCached(): ConfigurazioneDocumento[] {
    return this.all().slice();
  }
```
(before `findByTipo`; `private all()` stays — still used by `findByTipo`). In `src/infrastructure/repositories/ConfigurazioneEmailRepository.ts`, remove:
```ts
  findAllCached(): ConfigurazioneEmail[] {
    return this.all().slice();
  }
```
(before `findByProcesso`; `private all()` stays — still used by `findByProcesso`).

- [ ] **Step 3: Delete `AlunnoRepository.getCurriculum`/`.getTutors`**

In `src/infrastructure/repositories/AlunnoRepository.ts`, remove:
```ts
  getTutors(alunno: Alunno): Email[] {
    return alunno.getTutors();
  }

  getCurriculum(alunno: Alunno): Map<MateriaId, string[]> {
    return alunno.getCurriculum();
  }
```
(between `findConBES` and the `// --- Aggregate navigation ---` comment). Check whether `Email` and `MateriaId` (both `import type`) become unused elsewhere in the file before removing their imports:
```bash
grep -n "Email\b\|MateriaId\b" src/infrastructure/repositories/AlunnoRepository.ts
```

- [ ] **Step 4: Delete `RuoloSpecialeRepository.getEmails`**

In `src/infrastructure/repositories/RuoloSpecialeRepository.ts`, remove:
```ts
  getEmails(ruolo: RuoloSpeciale): Email[] {
    return ruolo.getEmails();
  }
```
(the last method in the class, after `findByDocente`). Check whether `Email` (`import type`) is still used elsewhere in the file (it is, as `findByDocente(email: Email)`'s parameter type) — keep the import.

- [ ] **Step 5: Typecheck and test**

```bash
npm run typecheck
npx jest --config jest.config.cjs configurazione-documento configurazione-email alunno-repository ruolo-speciale-repository
npm test
```
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/infrastructure/repositories/ConfigurazioneDocumentoRepository.ts src/infrastructure/repositories/ConfigurazioneEmailRepository.ts src/infrastructure/repositories/AlunnoRepository.ts src/infrastructure/repositories/RuoloSpecialeRepository.ts
git commit -m "refactor: remove dead repository pass-through methods

findAllCached (CONF_DOC/CONF_MAIL repos, unlike their still-used siblings
MateriaRepository/RuoloSpecialeRepository.findAllCached) and the
AlunnoRepository/RuoloSpecialeRepository entity-method pass-throughs
(getCurriculum/getTutors/getEmails) all have zero callers — every real
caller reaches the same behavior directly on the entity or via a narrower
finder. Fixes analysis_4_dead_code.md A2.4.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XsipfWZ5MdGjUugChgMLeh"
```

### Task 19: Delete `DocumentBatchService.resume` and `EmailBatchService.resume`

**Files:**
- Modify: `src/application/services/DocumentBatchService.ts`
- Modify: `src/application/services/EmailBatchService.ts`

- [ ] **Step 1: Re-verify zero callers**

```bash
cd "/home/giulio/Desktop/ALDO implementing"
grep -rn "documenti\.resume(\|email\.resume(\|documentBatchService\.resume(\|emailBatchService\.resume(" src/ test/ --include=*.ts
```
Confirm `src/config/Bootstrap.ts`'s `riprendiJobSospeso` still calls `runner.resume(jobName, (queue) => { documenti.registerJobHandlers(queue); email.registerJobHandlers(queue); })` directly — i.e. bypassing both services' own `resume()` methods, per `analysis_4_dead_code.md`'s finding that this bypass is structural (one shared resume trigger registers both job types' handlers together).

- [ ] **Step 2: Delete `DocumentBatchService.resume`**

In `src/application/services/DocumentBatchService.ts`, remove:
```ts
  resume(runner: JobRunnerService, jobName: string): unknown {
    return runner.resume(jobName, (queue) => this.registerJobHandlers(queue));
  }
```
`registerJobHandlers` itself stays (still called from `Bootstrap.riprendiJobSospeso`, and from this same class's `start()`).

- [ ] **Step 3: Delete `EmailBatchService.resume`**

In `src/application/services/EmailBatchService.ts`, remove the identically-shaped:
```ts
  resume(runner: JobRunnerService, jobName: string): unknown {
    return runner.resume(jobName, (queue) => this.registerJobHandlers(queue));
  }
```

- [ ] **Step 4: Typecheck and test**

```bash
npm run typecheck
npx jest --config jest.config.cjs document-batch-service email-batch-service bootstrap
npm test
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/application/services/DocumentBatchService.ts src/application/services/EmailBatchService.ts
git commit -m "refactor: remove dead DocumentBatchService/EmailBatchService.resume

Bootstrap.riprendiJobSospeso registers both job types' handlers on one shared
JobRunnerLib resume trigger, which these per-service resume() methods could
never do alone — they were never a viable call path once both batch services
shared one resume trigger. Fixes analysis_4_dead_code.md A2.4.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XsipfWZ5MdGjUugChgMLeh"
```

### Task 20: Standardize on `.equals()` — refactor the 3 inline VO comparisons

**Files:**
- Modify: `src/domain/specifications/DocenteSpecs.ts:9-10`
- Modify: `src/domain/entities/RuoloSpeciale.ts:38`
- Modify: `src/domain/value-objects/EsameConfig.ts:24-29`

Per the user decision recorded in Global Constraints: **keep** `DipartimentoId.equals`, `Email.equals`, `IndirizzoId.equals` (no change to those three VO files) and refactor their one inline-comparison caller each to call `.equals()` instead, closing the reason they showed as dead in `analysis_4_dead_code.md`.

- [ ] **Step 1: Re-verify the three inline comparisons and confirm the VO `.equals()` methods still have zero callers today**

```bash
cd "/home/giulio/Desktop/ALDO implementing"
sed -n '6,11p' src/domain/specifications/DocenteSpecs.ts
sed -n '36,39p' src/domain/entities/RuoloSpeciale.ts
sed -n '23,30p' src/domain/value-objects/EsameConfig.ts
grep -rn "DipartimentoId\.of([^)]*)\.equals(\|dipartId\.equals(\|\.equals(this\.dipartId)" src/
```

- [ ] **Step 2: `DocentiPerDipartimentoSpec.isSatisfiedBy` → `DipartimentoId.equals`**

In `src/domain/specifications/DocenteSpecs.ts`, add the import:
```ts
import type { Specification } from './Specification';
import type { Docente } from '../entities/Docente';
import { DipartimentoId } from '../value-objects/DipartimentoId';
import { COL_DOCENTI } from '../../config/schema';
```
(note: `DipartimentoId` moves from `import type` to a plain `import`, since it's now called as a value via `DipartimentoId.of(...)`.) Change:
```ts
export class DocentiPerDipartimentoSpec implements Specification<Docente> {
  constructor(private readonly dipartId: DipartimentoId) {}
  isSatisfiedBy(d: Docente): boolean {
    return d.dipart === this.dipartId.value;
  }
```
to:
```ts
export class DocentiPerDipartimentoSpec implements Specification<Docente> {
  constructor(private readonly dipartId: DipartimentoId) {}
  isSatisfiedBy(d: Docente): boolean {
    return DipartimentoId.of(d.dipart).equals(this.dipartId);
  }
```

- [ ] **Step 3: `RuoloSpeciale.hasDocente` → `Email.equals`**

In `src/domain/entities/RuoloSpeciale.ts`, change:
```ts
  hasDocente(email: Email): boolean {
    return this.getEmails().some((e) => e.value === email.value);
  }
```
to:
```ts
  hasDocente(email: Email): boolean {
    return this.getEmails().some((e) => e.equals(email));
  }
```
(`Email` is already imported as a value in this file — no import change needed.)

- [ ] **Step 4: `EsameConfig.isPrimaProvaPerIndirizzo`/`isSecondaProvaPerIndirizzo` → `IndirizzoId.equals`**

In `src/domain/value-objects/EsameConfig.ts`, add the value import:
```ts
import { IndirizzoId } from './IndirizzoId';
```
(replacing the current `import type { IndirizzoId } from './IndirizzoId';`, since `IndirizzoId.of` is now called as a value). Change:
```ts
  isPrimaProvaPerIndirizzo(ind: IndirizzoId): boolean {
    return this.primaProva.includes(ind.value);
  }

  isSecondaProvaPerIndirizzo(ind: IndirizzoId): boolean {
    return this.secondaProva.includes(ind.value);
  }
```
to:
```ts
  isPrimaProvaPerIndirizzo(ind: IndirizzoId): boolean {
    return this.primaProva.some((raw) => IndirizzoId.of(raw).equals(ind));
  }

  isSecondaProvaPerIndirizzo(ind: IndirizzoId): boolean {
    return this.secondaProva.some((raw) => IndirizzoId.of(raw).equals(ind));
  }
```
(`this.primaProva`/`this.secondaProva` are `string[]` of raw indirizzo ids parsed from JSON — `.includes(ind.value)` becomes `.some((raw) => IndirizzoId.of(raw).equals(ind))` to route the comparison through `.equals()` rather than comparing `ind.value` against a raw unvalidated string directly.)

- [ ] **Step 5: Typecheck and test**

```bash
npm run typecheck
npx jest --config jest.config.cjs docente-specs ruolo-speciale esame-config
npm test
```
Expected: PASS. (`DipartimentoId.equals`/`Email.equals`/`IndirizzoId.equals` now show a real caller each — confirm with `mcp__codebase-memory-mcp__search_graph` post-commit if useful, though this is optional since the tests already prove behavior.)

- [ ] **Step 6: Commit**

```bash
git add src/domain/specifications/DocenteSpecs.ts src/domain/entities/RuoloSpeciale.ts src/domain/value-objects/EsameConfig.ts
git commit -m "refactor: standardize on VO .equals() over inline value comparisons

DipartimentoId/Email/IndirizzoId all expose .equals(), but their one
plausible caller each reimplemented the same check inline. Per project
decision, the VOs' equals() methods are the convention going forward — three
call sites switched. Fixes analysis_4_dead_code.md A2.4 (dead .equals() rows).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XsipfWZ5MdGjUugChgMLeh"
```

---

## Phase 10 — Final verification

### Task 21: Full-repo re-index and cross-cutting verification pass

**Files:** none modified — verification only.

- [ ] **Step 1: Re-index both graphs from a clean HEAD**

Run `mcp__codebase-memory-mcp__index_repository`:
- `{"project_name": "home-giulio-Desktop-ALDO-implementing-GasLibraryFactory", "root_path": "/home/giulio/Desktop/ALDO implementing/GasLibraryFactory"}`
- `{"project_name": "home-giulio-Desktop-ALDO-implementing", "root_path": "/home/giulio/Desktop/ALDO implementing"}`

- [ ] **Step 2: Bypass-detection query (per this repo's `CLAUDE.md`-mandated check)**

```bash
cd "/home/giulio/Desktop/ALDO implementing"
grep -rn "SpreadsheetApp\.\|DriveApp\.\|MailApp\.\|GmailApp\.\|DocumentApp\.\|PropertiesService\.\|CacheService\.\|UrlFetchApp\.\|ScriptApp\.\|LockService\.\|Session\." src/ --include=*.ts | grep -v "//"
npx eslint src --quiet
```
Expected: only the `src/onlinetests/**` sanctioned exception (now routed through `GasOnlineTestFramework.SampleSpreadsheetBuilder`/`testContext`, per Phase 4 — confirm no raw `SpreadsheetApp`/`Sheet` call remains even there), zero raw `Session.` hits anywhere (closed in Phase 3), `eslint` exits 0.

- [ ] **Step 3: Confirm the DIP fix closed (re-check, now against the post-Phase-9 tree)**

```bash
grep -rlEn "^import \{ [A-Za-z]+Repository \} from '\.\./\.\./infrastructure/repositories/" src/application/
```
Expected: no output.

- [ ] **Step 4: Confirm no `infrastructure → application` import remains**

```bash
grep -rln "from '\.\./\.\./application/" src/infrastructure/ 2>/dev/null
```
Expected: no output (the only prior offenders, `documentSteps.ts`/`emailSteps.ts`, moved to `application/pipelines/` in Phase 6).

- [ ] **Step 5: Full test/lint/typecheck sweep, both repos**

```bash
cd "/home/giulio/Desktop/ALDO implementing"
npm run typecheck
npm run lint
npm test
npm run test:integration
npm run test:build
cd "/home/giulio/Desktop/ALDO implementing/GasLibraryFactory"
npm test
npx eslint . --quiet
```
Expected: all PASS.

- [ ] **Step 6: Confirm zero dead-code regressions were introduced**

Re-run the same class of zero-caller query `analysis_4_dead_code.md` used originally (via `search_graph`/`query_graph` for `Method`/`Function` nodes in `src/` with zero inbound `CALLS`, excluding entry points and tests) and confirm the count of genuinely-dead (non-false-positive) hits is now 0, matching Phase 9's deletions.

- [ ] **Step 7: Optional low-priority check carried over from `analysis_5_code_review.md` §7**

```bash
grep -rn "requireRegistered\|cellToString" src/ --include=*.ts
```
Manually confirm `CustomSourceStrategies.requireRegistered` and `DocumentoConTabelleImportateGeneratorStrategy.cellToString` are each still reached (likely via `.map()`/array-callback, which the graph indexer under-attributes as a `CALLS` edge) before any future cleanup pass treats them as dead — no code change expected here, this is a verification-only note, not a fix.

- [ ] **Step 8: No commit for this task** — it is a read-only verification gate. If any step fails, return to the relevant phase, fix, and re-run this task from Step 5.
