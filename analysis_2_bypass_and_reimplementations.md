# ALDO ↔ GasLibraryFactory Compliance Audit #2 — Bypass, Reimplementation, Missing Extensions

Scope: `home-giulio-Desktop-ALDO-implementing` knowledge graph (9,726 nodes / 25,701 edges, `search_graph`/`query_graph`/`search_code`/`get_architecture` against HEAD `a0803d5`), cross-referenced against `GasLibraryFactory/DOCS_LIBS` and `GasLibraryFactory/CLAUDE.md`'s sanctioned-exception list.

**Headline: `src/` is already highly disciplined.** Every native-GAS-global usage found outside `GoogleApiWrapper` is deliberately routed through a facade, is documented in-line with an explicit rationale, and (in most cases) references the prior `ALDO_GLF_AUDIT_RESULTS.md` / `REPORT_GLF.md` cleanup passes. No hand-rolled retry/backoff, UUID generation, date-token parsing, or email-regex validation was found — all of those already call through `UtilsService`/`CoreUtilsLib`. The one substantive, actionable finding is a PII-logging gap (§3).

---

## 1) Bypass violations (direct native-GAS calls outside GoogleApiWrapper)

Searched `src/**` for the twelve globals the project CLAUDE.md restricts to `GoogleApiWrapper` (`DriveApp`, `SpreadsheetApp`, `DocumentApp`, `PropertiesService`, `CacheService`, `UrlFetchApp`, `Utilities`, `Session`, `ScriptApp`, `LockService`, `MailApp`, plus `GmailApp`). Only comment-only mentions and two real call sites turned up — both narrow, documented boundary cases, not silent leaks.

### 1a. `ActiveUserFacade.ts:13` — `Session.getActiveUser().getEmail()`

```ts
// src/infrastructure/facades/ActiveUserFacade.ts
export class SessionActiveUserFacade implements IActiveUserFacade {
  getEmail(): string {
    return Session.getActiveUser().getEmail();
  }
}
```

**Verified**: `GoogleApiWrapper` exposes no `UserService`/`getSession*`/`getActiveUser*` wrapper anywhere in the graph (`search_graph` for "active user email session" across the GLF project returns no `GoogleApiWrapper` hit for this capability). The file's own docstring already states this is a deliberate, singular L2 boundary because no wrapped equivalent exists.
**Verdict**: Not a violation — it's the _only_ facade file with a raw global call, it is the L2 boundary for that one call, and the claim of "no library equivalent" checks out.
**Recommendation**: If `GoogleApiWrapper` is meant to be the _sole_ place native globals ever appear (per its own CLAUDE.md: "**`GoogleApiWrapper/**`** — it _is_ the L2 abstraction" as the only non-test sanctioned exception), extend it with a thin `UserService.getActiveUserEmail()` wrapper and have `ActiveUserFacade` call that instead. This is low-risk, closes the one remaining ALDO-side native-global call, and gives every future GLF consumer the same wrapper instead of each one growing its own.

### 1b. `src/onlinetests/GasSampleSpreadsheetFactory.ts` — direct `Spreadsheet`/`Sheet` API calls

```ts
// src/onlinetests/GasSampleSpreadsheetFactory.ts
const spreadsheet = testContext.getOrCreateNamedSpreadsheet(name, this.rootFolder) as GoogleAppsScript.Spreadsheet.Spreadsheet;
...
sheet.getRange(1, 1, 1, headerRow.length).setValues([headerRow]);
this.spreadsheet.deleteSheet(this.defaultSheet);
```

**Verified**: `GasLibraryFactory/CLAUDE.md`'s sanctioned-exception list names `GasOnlineTestFramework/**` (a _library_ directory) as "runs inside real GAS by design," not `src/onlinetests/**` (an _ALDO_ directory). The file's own docstring explicitly argues this is "the same L2-boundary role... mirrored here since `src/onlinetests/**` only ever executes inside a live online-test run" — a reasonable analogy, but it is a self-declared extension of the exception list, not something the written policy literally covers.
**Verdict**: Borderline. Functionally sound (uses `GasOnlineTestFramework`'s `testContext` helper rather than bare `SpreadsheetApp.create`), and confined to a test-only entry (`src/onlinetests/**`, built only in `--mode=online`), but it does mean ALDO's own `src/` tree — not just GLF's — now contains a second "this file is the L2 boundary" carve-out that isn't written down anywhere the linter or `CLAUDE.md` enforces.
**Recommendation**: Either (a) formally add `src/onlinetests/**` to the sanctioned-exception list in ALDO's own `CLAUDE.md` so the carve-out is documented where reviewers will see it, or (b) push `GasSampleSpreadsheetFactory`'s logic into `GasOnlineTestFramework` itself as a reusable "sample spreadsheet builder" helper (it's a generic add-sheet/append-row/reset pattern, not SGSA-specific) and have ALDO call that — which also directly serves the repo's stated long-term goal of growing `GasLibraryFactory`'s reusable surface. Ask the user which they'd prefer before picking one, per the CLAUDE.md instruction to not silently choose the custom-code path.

No other `src/**` file calls a restricted global; the remaining 16 grep hits (`MateriaRepository.ts`, `MasterSheetRepository.ts`, `ConfigurazioneDocumentoRepository.ts`, `RuoloSpecialeRepository.ts`, `DipartimentoRepository.ts`, `ConfigurazioneEmailRepository.ts`, `ConfigurazioneImportRepository.ts`, `IndirizzoRepository.ts`, `MasterConfig.ts`, `GmailServiceFacade.ts`, `ProcessMonitorFacade.ts`, `PropertiesFacade.ts`, `UiFacade.ts`, `SampleDatabaseBuilder.ts`, `pipelineChecks.ts`) are all **comment-only** mentions (explaining _why_ a facade exists, or naming `CacheService`/`SpreadsheetApp` in a doc-comment) — no executable call.

---

## 2) Reimplementation violations

None found. Every candidate area that looked reimplementation-prone on a keyword sweep turned out to already delegate correctly:

| Area searched                                                                                                               | ALDO code                                                                                                                                                                                                                                                                                                                                                                                  | Verdict                                                                                 |
| --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| Date formatting (`src/application/context-engine/dates.ts:27`, `src/infrastructure/repositories/SupplenzaRepository.ts:12`) | Both call `new UtilsService().formatDate(d, pattern, { utc: true })`; only the Italian month-name table (`MESI`) is local, which is legitimate SGSA-domain wording, not a formatting algorithm.                                                                                                                                                                                            | Correct delegation                                                                      |
| Email validation (`src/domain/value-objects/Email.ts:9`)                                                                    | Calls `UtilsService.isValidEmail(...)`, no local regex.                                                                                                                                                                                                                                                                                                                                    | Correct delegation                                                                      |
| Retry logic (`EmailRetryService.retryFailed`, `SendEmailStep._executeLogic`)                                                | `EmailRetryService` retries **business-level** failed sends recorded in `LOG_MAIL` (group-by-pattern, `maxTentativi` business rule, admin notification) — semantically different from `GasResilienceLib`'s transient-error/quota backoff, which operates beneath a single API call. No `while(true)`, manual backoff loop, or circuit-breaker reimplementation found anywhere in `src/**`. | Not a duplicate — different problem (domain retry policy vs. infrastructure resilience) |
| UUID/ID generation                                                                                                          | No `Math.random`/`crypto.`/hand-rolled UUID hits in `src/**`.                                                                                                                                                                                                                                                                                                                              | N/A — none present                                                                      |
| Custom `SourceStrategy`s (`CustomSourceStrategies.ts`)                                                                      | `readSheetRows()` explicitly delegates to the library's own `SheetByIdStrategy.extract()`/`.extractRaw()` for all tab/range/header logic; ALDO code only adds the `_CLASSE` tagging and folder/log lookups that are inherently SGSA-domain.                                                                                                                                                | Correct delegation                                                                      |
| `DomainError` hierarchy (`src/domain/errors/DomainError.ts`)                                                                | Business error taxonomy (`ValidationError`, `EntityNotFoundError`, `PipelineError`, `ConfigurationError`, `MateriaNotFoundError`) for the Domain layer, which CLAUDE.md requires to be agnostic of infrastructure. Distinct in purpose from `GasResilienceLib`'s Quota/Network/Fatal _infrastructure_ error classification.                                                                | Not a duplicate — different layer                                                       |
| `UrlFetchApp`/circuit-breaker/`executeWithRetry` hand-rolling                                                               | Zero hits in `src/**`.                                                                                                                                                                                                                                                                                                                                                                     | N/A — none present                                                                      |

---

## 3) Gap: PII (email) written to logs without CoreUtilsLib's `PiiRedactor`

`CoreUtilsLib` exports `PiiRedactor` from its public index (`CoreUtilsLib/index.js`: `export { PiiRedactor } from './src/internal/PiiRedactor.js'`, then flattened onto `global` by `GasLibraryFactory/src/index.js`'s `Object.assign(global, CoreUtilsLib)`), and its docs state this is precisely for GDPR/privacy-safe logging: _"Sanitizzazione PII... permette di loggare dati senza esporre email o token."_ `LoggerService` itself does **not** auto-redact (no `PiiRedactor`/`redact` reference anywhere in `CoreUtilsLib/src/LoggerService.js`) — callers must opt in.

Three places in ALDO interpolate raw email addresses directly into `LoggerService.warn/error` calls without calling `PiiRedactor`:

- **`src/application/services/EmailRetryService.ts:65-67`**
  ```ts
  this.logger.warn(
    `EmailRetry: nuovo tentativo fallito per ${first.pattern} → ${first.destinatariRaw} (${run.errors.join('; ')})`
  );
  ```
- **`src/application/services/EmailRetryService.ts:74-78`** (`registraPermanente`, embeds `record.destinatariRaw` into `msg`, then `this.logger.error(...msg)`)
- **`src/infrastructure/steps/emailSteps.ts:394`**
  ```ts
  this.logger.error(`SendEmail: invio fallito a ${to.join(',')}: ${msg}`);
  ```
- **`src/application/services/EmailNotificationService.ts:354`**
  ```ts
  this.logger.warn(`PER_CARENZA: alunno ${carenza.studente} non trovato — carenza saltata`);
  ```
  (`carenza.studente` is an `AlunnoId`, whose value is the student's email per the `ALUNNI.EMAIL` primary key, per `01_SCHEMA_DATABASE.md`.)

**This is not a reimplementation** (nothing is re-derived), but it is exactly the kind of gap the "GasLibraryFactory-first" constraint is meant to catch: a facility already exists (`PiiRedactor.redact` / `.redactEmails`) for the exact case (compliance-safe logging of email-bearing error strings), and the application code doesn't reach for it.

**Recommendation**: Wrap the interpolated message with `PiiRedactor.redact(...)` (or the narrower `PiiRedactor.redactEmails(...)`) before passing it to `logger.warn`/`logger.error` at the four call sites above. Since `PiiRedactor` is a stateless static class already flattened onto the GAS global namespace (same access pattern as `UtilsService`/`LoggerService` elsewhere in `src/`), this requires no new DI wiring in `Bootstrap.ts`/`ServiceContainer` — it's a drop-in call at each site.

---

## Summary

| #   | Finding                                                       | Category                                                                         | Action                                                                                                                          |
| --- | ------------------------------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| 1a  | `ActiveUserFacade.ts` direct `Session.getActiveUser()`        | Bypass (documented, verified no library equivalent)                              | Optional: add `UserService.getActiveUserEmail()` to `GoogleApiWrapper` to close the last native-global call in ALDO entirely    |
| 1b  | `GasSampleSpreadsheetFactory.ts` direct Spreadsheet API calls | Bypass (self-declared exception, not literally in GLF's written sanctioned list) | Ask user: document the exception in ALDO's own `CLAUDE.md`, or upstream the sample-builder helper into `GasOnlineTestFramework` |
| 2   | —                                                             | Reimplementation                                                                 | None found                                                                                                                      |
| 3   | Raw email addresses in `logger.warn/error` at 4 sites         | Missing use of existing library facility (`PiiRedactor`)                         | Wrap the 4 call sites with `PiiRedactor.redact`/`.redactEmails`                                                                 |
