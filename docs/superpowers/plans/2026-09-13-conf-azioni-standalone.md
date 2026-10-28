# CONF_AZIONI — azioni standalone data-driven — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `CONF_AZIONI` configuration table plus an `ActionBatchService` so that permission realignment, permission downgrade, DB validation and column sanitisation run as data-driven standalone actions, reusing the existing `POST_PROCESSO` action grammar.

**Architecture:** The `POST_PROCESSO` executor (`src/application/pipelines/postProcessActions.ts`) is renamed to `standaloneActions.ts` and becomes the shared "azioni" grammar: DB-only action types stay built in, infrastructure action types arrive as a `handlers` map supplied by the caller. A new `ActionBatchService` (JobRunnerLib generator, `JOB_TYPE = 'ESECUZIONE_AZIONI'`) reads `CONF_AZIONI`, gates each row on `CONDIZIONE`, enumerates targets from `ASSE` through a newly extracted `axisTargets.ts` (shared with `DocumentBatchService`), materialises one CDU per target via `ContextBuilder`, and calls `eseguiAzioni()`. Logging is `LOG_JOB` only.

**Tech Stack:** TypeScript targeting GAS V8 (synchronous only), Jest + ts-jest, GasLibraryFactory vendored libraries (JobRunnerLib, GasSchemaValidatorLib, GasExpressionEngineLib, ContextEngine, GoogleApiWrapper via ALDO facades).

**Spec:** `docs/superpowers/specs/2026-09-12-conf-azioni-standalone-design.md`

## Global Constraints

- **GasLibraryFactory-first.** Never reimplement logic `GasLibraryFactory/DOCS_LIBS` already provides. If only a partial match exists, stop and ask the user before writing ALDO-local code.
- **Target is GAS V8, not Node.** Synchronous code only; no async/await, no Node APIs.
- **Native GAS globals** (`DriveApp`, `SpreadsheetApp`, `PropertiesService`, `Utilities`, …) may only be touched inside `GoogleApiWrapper`. ALDO code routes through facades. ESLint `no-restricted-globals` fails the build otherwise.
- **Never edit `dist/*`.** It is generated.
- All table and column names are UPPERCASE and come from `src/config/schema.ts`; the physical column `POST_PROCESSO` **does not change name** — only ALDO code identifiers are renamed.
- New services/facades are wired in `src/config/Bootstrap.ts` and resolved through `ServiceContainer`, never constructed ad hoc inside application code.
- Run `npm run typecheck && npm run lint && npm test` before every commit.
- Spec terminology: the grammar is always called **azioni** (standalone or inline). No "step"/"passi".

## Scope decisions taken in this plan (deviations from a literal reading of the spec)

1. **`VALIDATION_TABLES` needs no edit.** It is already `Object.values(TABLE).filter(t => t !== TABLE.MASTER)` (`src/config/validationRules.ts:40`), so adding `TABLE.CONF_AZIONI` puts the table inside the validation perimeter automatically. Only the _rules_ are added by hand.
2. **No `ConfigurazioneAzioneRepository`.** `CONF_AZIONI` is read through `db.table(TABLE.CONF_AZIONI)` + the `ConfigurazioneAzione` entity, the way `DocumentGenerationService` reads `CONF_DOC`. A repository class would be an extra file with two one-line filters in it.
3. **`PostProcessDb` keeps its name.** It is a DB-slice type, not an action concept; the spec's rename table does not list it, and renaming it touches four more files for zero behaviour.
4. **Build-tier assertions land in the existing unit tests** (`test/unit/index.test.ts`, `test/unit/config/bootstrap.test.ts`) instead of a new `test/build/` project test: the assertions the spec asks for (job type registered, entrypoints on `globalThis`, `CONF_AZIONI` in schema/rules) are all checkable without building `dist/`.
5. **Online smoke check is not implemented** — the spec marks it stretch/non-blocking for v1.
6. **No process-monitor sidebar for actions** — the spec lists it under "Rinviato".
7. **`handlers` is keyed by `string`, not a `TipoAzione` union.** The spec sketches `Partial<Record<TipoAzione, AzioneHandler>>`; a union would have to be widened again for every future infra type and buys nothing over the warn-and-skip the dispatcher already does for an unknown key.
8. **`ActionBatchService`'s test lives in the unit tier**, not `test/integration/`: it drives the generator directly with fakes (no live GAS, no cross-service composition), which is what the existing `document-batch-service.test.ts`/`email-batch-service.test.ts` do for the same shape of code.
9. **Follow-up noted, not done:** once `RIDUCI_PERMESSI` exists, `LockDocumentsService` + the "BLOCCA DOCUMENTI" menu entry are a `CONF_AZIONI` record with `ASSE=SINGOLA`; deleting them is out of this plan's scope.

## File Structure

**Created**

- `src/application/pipelines/standaloneActions.ts` — renamed from `postProcessActions.ts`; the shared azioni grammar + dispatcher.
- `src/application/pipelines/azioniInfra.ts` — factory building the infrastructure handlers (`AGGIORNA_PERMESSI`, `RIDUCI_PERMESSI`, `VALIDA_DB`) over `IDriveFacade`/`IRoleResolver`/`StoricoDocumentiService`/`DatabaseValidationService`.
- `src/application/services/axisTargets.ts` — pure target-enumeration functions per `GeneratoreAxis`, shared by `DocumentBatchService` and `ActionBatchService`.
- `src/application/services/ActionBatchService.ts` — the `ESECUZIONE_AZIONI` JobRunnerLib generator.
- `src/domain/entities/ConfigurazioneAzione.ts` — `CONF_AZIONI` entity, validates `ASSE`.
- `test/unit/application/pipelines/standalone-actions.test.ts` — renamed from `post-process-actions.test.ts`, extended.
- `test/unit/application/azioni-infra.test.ts`
- `test/unit/application/action-batch-service.test.ts`
- `test/unit/domain/configurazione-azione.test.ts`
- `test/unit/application/axis-targets.test.ts`

**Modified**

- `src/config/schema.ts` — `TABLE.CONF_AZIONI`, `COL_CONF_AZIONI`.
- `src/domain/value-objects/enums.ts` — `ASSI_AZIONE`.
- `src/config/validationRules.ts` — required/enum/JSON rules for `CONF_AZIONI`.
- `src/application/context-engine/Recipe.ts` — `AZIONE_SINGOLA` recipe, `tipoOperazione` union.
- `src/application/context-engine/Cdu.ts` — `tipoOperazione`/`tipoOperazioneLabel` unions.
- `src/application/context-engine/ContextBuilder.ts` — label mapping for the new operation type.
- `src/application/pipelines/documentSteps.ts`, `src/application/pipelines/emailSteps.ts` — call `eseguiAzioni` with the handlers map.
- `src/application/services/DocumentGenerationService.ts`, `src/application/services/EmailNotificationService.ts` — import path of `PostProcessDb`.
- `src/application/services/DocumentBatchService.ts` — delegate target enumeration to `axisTargets.ts`.
- `src/application/services/DatabaseValidationService.ts` — `esegui(tabelle?)`.
- `src/infrastructure/facades/DriveServiceFacade.ts` — export the permesso→Drive-role map.
- `src/config/Bootstrap.ts` — register `actionBatchService`, launchers, resume registration.
- `src/index.ts`, `src/entrypoints/EntryPoints_Menu.ts`, `src/entrypoints/EntryPoints_User.ts`, `src/presentation/Menu.ts` — menu entry + user entrypoints.
- `src/onlinetests/SampleDatabaseBuilder.ts`, `src/onlinetests/data/SharedTestHeaders.ts` — header rows for the new sheet.
- `SPECS_ALDO/01_SCHEMA_DATABASE.md`, `SPECS_ALDO/00_PANORAMICA.md` — documentation.

---

### Task 1: Rename the POST_PROCESSO executor to the shared azioni grammar

Pure rename + signature change. No behaviour changes; the existing tests are the regression gate.

**Files:**

- Create (via `git mv`): `src/application/pipelines/standaloneActions.ts` (from `postProcessActions.ts`)
- Modify: `src/application/pipelines/documentSteps.ts:19-20,558-570,577`
- Modify: `src/application/pipelines/emailSteps.ts:37,837-850`
- Modify: `src/application/services/DocumentGenerationService.ts:27`
- Modify: `src/application/services/EmailNotificationService.ts:7`
- Modify: `src/domain/entities/ConfigurazioneDocumento.ts:111` (comment reference only)
- Test (via `git mv`): `test/unit/application/pipelines/standalone-actions.test.ts` (from `post-process-actions.test.ts`)

**Interfaces:**

- Consumes: nothing (first task).
- Produces:
  - `export interface Azione { tipo: string; tab?: string; col?: string; valore?: unknown; stato?: string; criteri?: Record<string, string>; target?: string; ruolo?: string; permesso?: string; profondita?: number; su?: string; emails?: string[]; operazione?: string; soglia?: string; tabelle?: string[]; }`
  - `export type AzioneHandler = (azione: Azione, criteri: Record<string, string>) => number;`
  - `export function eseguiAzioni(opts: EseguiAzioniOptions): number`
  - `export interface EseguiAzioniOptions { azioni: string; cdu: Record<string, unknown>; db: PostProcessDb; templates: ITemplateEngine; now: Date; logger: LoggerService; handlers?: Record<string, AzioneHandler>; }`
  - unchanged exports: `hasJsonValue`, `type PostProcessDb`
  - newly exported helper: `export function csvValues(raw: unknown): string[]`

- [ ] **Step 1: Move the module and its test with git mv (history preserved)**

```bash
cd "/home/giulio/Desktop/ALDO implementing"
git mv src/application/pipelines/postProcessActions.ts src/application/pipelines/standaloneActions.ts
git mv test/unit/application/pipelines/post-process-actions.test.ts test/unit/application/pipelines/standalone-actions.test.ts
```

- [ ] **Step 2: Rewrite the module header comment and the exported types**

In `src/application/pipelines/standaloneActions.ts`, replace the file's leading doc comment with:

```ts
/**
 * Shared "azioni" grammar (10 §12, 11 §10, CONF_AZIONI design doc): one JSON
 * action vocabulary used in two places — inline, as the physical
 * CONF_DOC/CONF_MAIL `POST_PROCESSO` column (the column name is spec and does
 * NOT change), and standalone, as CONF_AZIONI.AZIONI orchestrated by
 * ActionBatchService. Criteria values are `{{path}}` templates resolved by
 * WorkspaceTemplateEngine against the CDU; matching rows are rewritten through
 * the RepositoryDatabase `updateRowWhere` seam (the full previous row is the
 * match key, so exactly that row is replaced and a missing match can never
 * append phantom rows). Persistence is the caller's concern: inside the
 * document pipeline the service transaction commits; the email pipeline calls
 * `save()` right after (11 §10); ActionBatchService saves per target.
 *
 * DB-only action types are built in here. Infrastructure action types (Drive
 * permissions, DB validation) arrive as `handlers`, supplied by the caller —
 * the document pipeline registers only AGGIORNA_PERMESSI_STORICI, while
 * ActionBatchService registers the full set (see azioniInfra.ts).
 */
export interface Azione {
  tipo: string;
  tab?: string;
  col?: string;
  valore?: unknown;
  stato?: string;
  criteri?: Record<string, string>;
  target?: string;
  ruolo?: string;
  permesso?: string;
  profondita?: number;
  /** Log table an infra action selects its targets from: 'LOG_DOCS' | 'LOG_FOLD'. */
  su?: string;
  /** Direct recipient addresses, alternative to `ruolo`. */
  emails?: string[];
  /** TRASFORMA_CAMPO: TRIM | UPPER | LOWER | CAPITALIZE | UNCAPITALIZE. */
  operazione?: string;
  /** RIDUCI_PERMESSI: maximum permission left in place (default LETTURA). */
  soglia?: string;
  /** VALIDA_DB: subset of tables to validate (default: all). */
  tabelle?: string[];
}

export type AzioneHandler = (azione: Azione, criteri: Record<string, string>) => number;
```

Delete the old `PostProcessAction` interface and `PostProcessActionHandler` type.

- [ ] **Step 3: Export `csvValues` and swap the dispatcher signature**

In the same file, change `function csvValues` to `export function csvValues`, and replace the whole `executePostProcess` function with:

```ts
export interface EseguiAzioniOptions {
  /** Raw JSON array: CONF_AZIONI.AZIONI or CONF_DOC/CONF_MAIL.POST_PROCESSO. */
  azioni: string;
  cdu: Record<string, unknown>;
  db: PostProcessDb;
  templates: ITemplateEngine;
  now: Date;
  logger: LoggerService;
  /** Infra action types the caller can service; an unregistered type is warned and skipped. */
  handlers?: Record<string, AzioneHandler>;
}

/** Runs every action in the JSON array; returns the number of updated rows/targets. */
export function eseguiAzioni(opts: EseguiAzioniOptions): number {
  const { cdu, db, templates, now, logger } = opts;
  const azioni = JSON.parse(opts.azioni) as Azione[];
  const handlers = opts.handlers ?? {};
  // Mixes two different units: rows updated by DB actions and files touched by
  // the infra handlers, summed into one counter — see documentSteps.ts's
  // `Updated` log-detail field.
  let updated = 0;
  for (const azione of azioni) {
    const criteri = resolveCriteri(azione.criteri ?? {}, cdu, templates);
    switch (azione.tipo) {
      case 'INSERISCI_TIMESTAMP': {
        // Insert, not overwrite: only the first send stamps the column (e.g.
        // LOG_DOCS.NOTIFICATO), so a later PIANI_PERSONALIZZATI email that
        // also re-matches already-notified rows leaves their original
        // timestamp untouched. AGGIORNA_CAMPO remains for unconditional writes.
        const col = azione.col ?? '';
        updated += updateMatching(
          db,
          azione.tab ?? '',
          criteri,
          { [col]: now.toISOString() },
          (row) => isBlank(row[col])
        );
        break;
      }
      case 'AGGIORNA_CAMPO':
        updated += updateMatching(db, azione.tab ?? '', criteri, {
          [azione.col ?? '']: templates.processString(
            typeof azione.valore === 'string' ? azione.valore : '',
            cdu
          )
        });
        break;
      case 'AGGIORNA_STATO_DOC':
        updated += updateMatching(db, azione.tab ?? TABLE.LOG_DOCS, criteri, {
          [COL_LOG_DOCS.STATO]: azione.stato ?? ''
        });
        break;
      default: {
        const handler = handlers[azione.tipo];
        if (handler === undefined) {
          logger.warn(`AZIONE: tipo "${azione.tipo}" non disponibile — saltata`);
          break;
        }
        updated += handler(azione, criteri);
      }
    }
  }
  return updated;
}
```

Note the behaviour kept identical: `AGGIORNA_PERMESSI_STORICI` is no longer a `case` — it falls into `default` and is serviced by the handler the document pipeline registers under that key, producing the same warn-and-skip when absent.

- [ ] **Step 4: Update the document pipeline call site**

In `src/application/pipelines/documentSteps.ts`, change the imports on lines 19-20 to:

```ts
import { eseguiAzioni, hasJsonValue, type PostProcessDb } from './standaloneActions';
import type { Azione } from './standaloneActions';
```

Replace the `executePostProcess(...)` call in `PostProcessStep._executeLogic` with:

```ts
const updated = eseguiAzioni({
  azioni: String(cfg(ctx)[COL_CONF_DOC.POST_PROCESSO]),
  cdu: cduRecord(ctx),
  db: this.db,
  templates: this.templates,
  now: this.now,
  logger: this.logger,
  handlers: {
    AGGIORNA_PERMESSI_STORICI: (azione, criteri) =>
      this.aggiornaPermessiStorici(ctx, azione, criteri)
  }
});
```

and change `aggiornaPermessiStorici`'s parameter type from `action: PostProcessAction` to `azione: Azione` (rename the parameter and its destructuring line `const { target, ruolo, permesso, profondita } = azione;`).

- [ ] **Step 5: Update the email pipeline call site**

In `src/application/pipelines/emailSteps.ts`, change line 37 to:

```ts
import { eseguiAzioni, hasJsonValue, type PostProcessDb } from './standaloneActions';
```

and replace the `executePostProcess(...)` call in `PostProcessEmailStep._executeLogic` with:

```ts
const updated = eseguiAzioni({
  azioni: String(cfg(ctx)[COL_CONF_MAIL.POST_PROCESSO]),
  cdu: cduRecord(ctx),
  db: this.db,
  templates: this.templates,
  now: now(ctx),
  logger: this.logger
});
```

- [ ] **Step 6: Fix the two remaining import paths**

In `src/application/services/DocumentGenerationService.ts:27` and `src/application/services/EmailNotificationService.ts:7`, change `from '../pipelines/postProcessActions'` to `from '../pipelines/standaloneActions'`.
In `src/domain/entities/ConfigurazioneDocumento.ts:111`, change the comment's `postProcessActions.ts` to `standaloneActions.ts`.

- [ ] **Step 7: Update the moved test file to the new API**

In `test/unit/application/pipelines/standalone-actions.test.ts`, change the import block to:

```ts
import {
  eseguiAzioni,
  type PostProcessDb
} from '../../../../src/application/pipelines/standaloneActions';
```

and rewrite every call. The positional form becomes the options object — e.g.

```ts
const n = eseguiAzioni({
  azioni: actions,
  cdu: cdu(),
  db,
  templates: new FakeTemplateEngine(),
  now: NOW,
  logger
});
```

and the handler test becomes:

```ts
expect(
  eseguiAzioni({
    azioni: actions,
    cdu: { focus: { alunno: { email: 'a1@school.it' }, piano: { tipo: 'PDP_BES' } } },
    db,
    templates: new FakeTemplateEngine(),
    now: NOW,
    logger,
    handlers: { AGGIORNA_PERMESSI_STORICI: handler }
  })
).toBe(1);
```

Also rename the two `describe` titles from `postProcessActions — …` to `standaloneActions — …`.

- [ ] **Step 8: Run the test suite to verify the rename is behaviour-neutral**

Run: `npx jest --config jest.config.cjs test/unit/application/pipelines/standalone-actions.test.ts`
Expected: PASS, same number of tests as before the rename.

Then run the full gate:

Run: `npm run typecheck && npm run lint && npm test`
Expected: PASS (same test count as before this task, no new failures).

- [ ] **Step 9: Commit**

```bash
git add -A src/application/pipelines src/application/services/DocumentGenerationService.ts src/application/services/EmailNotificationService.ts src/domain/entities/ConfigurazioneDocumento.ts test/unit/application/pipelines
git commit -m "refactor(azioni): rename POST_PROCESSO executor to the shared standaloneActions grammar"
```

---

### Task 2: `TRASFORMA_CAMPO` built-in action

**Files:**

- Modify: `src/application/pipelines/standaloneActions.ts`
- Test: `test/unit/application/pipelines/standalone-actions.test.ts`

**Interfaces:**

- Consumes: `eseguiAzioni`, `Azione` (Task 1).
- Produces: action type `TRASFORMA_CAMPO` with `{ tipo, tab, col, operazione, criteri? }`, `operazione ∈ TRIM | UPPER | LOWER | CAPITALIZE | UNCAPITALIZE`. Returns the number of rows actually changed.

- [ ] **Step 1: Write the failing tests**

Append to `test/unit/application/pipelines/standalone-actions.test.ts`:

```ts
describe('standaloneActions — TRASFORMA_CAMPO', () => {
  function run(
    operazione: string,
    criteri?: Record<string, string>
  ): { db: FakeDatabase; n: number } {
    const tables = fixtureTables();
    tables['DOCENTI'] = [
      { EMAIL: 'd1@school.it', COGNOME: '  rossi  ', NOME: 'mario', ITP: false },
      { EMAIL: 'd2@school.it', COGNOME: 'BIANCHI', NOME: 'Lucia', ITP: false }
    ];
    const db = new FakeDatabase(tables);
    const n = eseguiAzioni({
      azioni: JSON.stringify([
        {
          tipo: 'TRASFORMA_CAMPO',
          tab: 'DOCENTI',
          col: 'COGNOME',
          operazione,
          ...(criteri === undefined ? {} : { criteri })
        }
      ]),
      cdu: cdu(),
      db,
      templates: new FakeTemplateEngine(),
      now: NOW,
      logger
    });
    return { db, n };
  }

  const cognomi = (db: FakeDatabase): string[] =>
    db.tables['DOCENTI']!.getAllRows().map((r) => String(r['COGNOME']));

  test('TRIM strips surrounding whitespace and counts only changed rows', () => {
    const { db, n } = run('TRIM');
    expect(cognomi(db)).toEqual(['rossi', 'BIANCHI']);
    expect(n).toBe(1); // 'BIANCHI' was already trimmed
  });

  test('UPPER uppercases', () => {
    expect(cognomi(run('UPPER').db)).toEqual(['  ROSSI  ', 'BIANCHI']);
  });

  test('LOWER lowercases', () => {
    expect(cognomi(run('LOWER').db)).toEqual(['  rossi  ', 'bianchi']);
  });

  test('CAPITALIZE uppercases the first letter of each word and lowercases the rest', () => {
    expect(cognomi(run('CAPITALIZE').db)).toEqual(['  Rossi  ', 'Bianchi']);
  });

  test('UNCAPITALIZE lowercases the first letter only', () => {
    expect(cognomi(run('UNCAPITALIZE').db)).toEqual(['  rossi  ', 'bIANCHI']);
  });

  test('criteri restrict the transform to matching rows', () => {
    const { db } = run('UPPER', { EMAIL: 'd2@school.it' });
    expect(cognomi(db)).toEqual(['  rossi  ', 'BIANCHI']);
  });

  test('an unknown operazione is warned and changes nothing', () => {
    const warn = jest.spyOn(LoggerService.prototype, 'warn').mockImplementation(() => {});
    const { db, n } = run('REVERSE');
    expect(n).toBe(0);
    expect(cognomi(db)).toEqual(['  rossi  ', 'BIANCHI']);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('REVERSE'));
    warn.mockRestore();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest --config jest.config.cjs test/unit/application/pipelines/standalone-actions.test.ts -t "TRASFORMA_CAMPO"`
Expected: FAIL — the actions are dispatched to the `default` branch, warned and skipped, so `n` is 0 and no cell changes.

- [ ] **Step 3: Implement the transform**

In `src/application/pipelines/standaloneActions.ts`, add above `eseguiAzioni`:

```ts
const TRASFORMAZIONI: Record<string, (value: string) => string> = {
  TRIM: (v) => v.trim(),
  UPPER: (v) => v.toUpperCase(),
  LOWER: (v) => v.toLowerCase(),
  CAPITALIZE: (v) => v.replace(/\S+/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()),
  UNCAPITALIZE: (v) => v.charAt(0).toLowerCase() + v.slice(1)
};

/**
 * Applies `trasforma` to `tab.col` on every row matching `match`, writing only
 * the rows whose value actually changes (idempotent re-runs cost no writes).
 * Non-string cells are left alone: a coerced number/boolean written back as a
 * string would silently change the column's type.
 */
function transformMatching(
  db: PostProcessDb,
  tab: string,
  col: string,
  match: Record<string, string>,
  trasforma: (value: string) => string
): number {
  const table = db.tables[tab];
  if (table === undefined || col === '') return 0;
  let changed = 0;
  for (const row of findMatchingRows(table, Object.keys(match), match)) {
    const current = row[col];
    if (typeof current !== 'string') continue;
    const next = trasforma(current);
    if (next === current) continue;
    table.updateRowWhere({ ...row }, { ...row, [col]: next });
    changed += 1;
  }
  return changed;
}
```

and add this `case` to the `eseguiAzioni` switch, right before `default:`:

```ts
      case 'TRASFORMA_CAMPO': {
        const trasforma = TRASFORMAZIONI[azione.operazione ?? ''];
        if (trasforma === undefined) {
          logger.warn(`AZIONE TRASFORMA_CAMPO: operazione "${String(azione.operazione)}" sconosciuta — saltata`);
          break;
        }
        updated += transformMatching(db, azione.tab ?? '', azione.col ?? '', criteri, trasforma);
        break;
      }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest --config jest.config.cjs test/unit/application/pipelines/standalone-actions.test.ts`
Expected: PASS (all tests, old and new).

- [ ] **Step 5: Commit**

```bash
git add src/application/pipelines/standaloneActions.ts test/unit/application/pipelines/standalone-actions.test.ts
git commit -m "feat(azioni): add TRASFORMA_CAMPO action type (TRIM/UPPER/LOWER/CAPITALIZE/UNCAPITALIZE)"
```

---

### Task 3: `CONF_AZIONI` schema, entity, validation rules and test-DB headers

**Files:**

- Modify: `src/config/schema.ts`
- Modify: `src/domain/value-objects/enums.ts`
- Create: `src/domain/entities/ConfigurazioneAzione.ts`
- Modify: `src/config/validationRules.ts`
- Modify: `src/onlinetests/SampleDatabaseBuilder.ts` (HEADERS map)
- Modify: `src/onlinetests/data/SharedTestHeaders.ts` (HEADERS map)
- Test: `test/unit/domain/configurazione-azione.test.ts`

**Interfaces:**

- Consumes: nothing from earlier tasks.
- Produces:
  - `TABLE.CONF_AZIONI = 'CONF_AZIONI'`
  - `COL_CONF_AZIONI = { ID, TIPO, ASSE, CONDIZIONE, ATTIVO, AZIONI, PERIODICITA }`
  - `export const ASSE_SINGOLA = 'SINGOLA'` and `export const ASSI_AZIONE: string[]` (GeneratoreAxis values + `SINGOLA`) in `enums.ts`
  - `class ConfigurazioneAzione extends AldoEntity` with `readonly tipo: string`, `readonly asse: string`, `readonly condizione: string`, `readonly periodicita: string`, `isAttivo(): boolean`, `getAzioniRaw(): string | null`, `static fromData(data: Record<string, unknown>): ConfigurazioneAzione`

- [ ] **Step 1: Write the failing entity test**

Create `test/unit/domain/configurazione-azione.test.ts`:

```ts
import { ConfigurazioneAzione } from '../../../src/domain/entities/ConfigurazioneAzione';
import { ConfigurationError } from '../../../src/domain/errors/DomainError';

test('reads every CONF_AZIONI column', () => {
  const azione = ConfigurazioneAzione.fromData({
    ID: 'ALLINEA_PERMESSI_CATTEDRE',
    TIPO: 'PERMESSI',
    ASSE: 'CLASSE',
    CONDIZIONE: '{{istituto.annoScolastico}} != ""',
    ATTIVO: true,
    AZIONI: '[{"tipo":"AGGIORNA_PERMESSI"}]',
    PERIODICITA: 'WEEKLY'
  });
  expect(azione.id).toBe('ALLINEA_PERMESSI_CATTEDRE');
  expect(azione.tipo).toBe('PERMESSI');
  expect(azione.asse).toBe('CLASSE');
  expect(azione.condizione).toBe('{{istituto.annoScolastico}} != ""');
  expect(azione.isAttivo()).toBe(true);
  expect(azione.getAzioniRaw()).toBe('[{"tipo":"AGGIORNA_PERMESSI"}]');
  expect(azione.periodicita).toBe('WEEKLY');
});

test('accepts the reserved SINGOLA axis', () => {
  expect(ConfigurazioneAzione.fromData({ ID: 'SANIFICA_TRIM', ASSE: 'SINGOLA' }).asse).toBe(
    'SINGOLA'
  );
});

test('rejects an unknown ASSE with a ConfigurationError', () => {
  expect(() => ConfigurazioneAzione.fromData({ ID: 'X', ASSE: 'GALASSIA' })).toThrow(
    ConfigurationError
  );
  expect(() => ConfigurazioneAzione.fromData({ ID: 'X', ASSE: 'GALASSIA' })).toThrow(/GALASSIA/);
});

test('ATTIVO defaults to true when the cell is blank and is false only when explicitly disabled', () => {
  expect(ConfigurazioneAzione.fromData({ ID: 'X', ASSE: 'SINGOLA' }).isAttivo()).toBe(true);
  expect(ConfigurazioneAzione.fromData({ ID: 'X', ASSE: 'SINGOLA', ATTIVO: '' }).isAttivo()).toBe(
    true
  );
  expect(
    ConfigurazioneAzione.fromData({ ID: 'X', ASSE: 'SINGOLA', ATTIVO: false }).isAttivo()
  ).toBe(false);
  expect(
    ConfigurazioneAzione.fromData({ ID: 'X', ASSE: 'SINGOLA', ATTIVO: 'FALSE' }).isAttivo()
  ).toBe(false);
});

test('an unset AZIONI cell reads as null (nothing to execute), including the Sheets empty-string round-trip', () => {
  expect(ConfigurazioneAzione.fromData({ ID: 'X', ASSE: 'SINGOLA' }).getAzioniRaw()).toBeNull();
  expect(
    ConfigurazioneAzione.fromData({ ID: 'X', ASSE: 'SINGOLA', AZIONI: '  ' }).getAzioniRaw()
  ).toBeNull();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest --config jest.config.cjs test/unit/domain/configurazione-azione.test.ts`
Expected: FAIL — `Cannot find module '.../ConfigurazioneAzione'`.

- [ ] **Step 3: Add the table and columns to the schema**

In `src/config/schema.ts`, add to the `TABLE` object right after `CONF_IMP: 'CONF_IMP',`:

```ts
  CONF_AZIONI: 'CONF_AZIONI',
```

and add a new column block next to `COL_CONF_IMP`:

```ts
export const COL_CONF_AZIONI = {
  ID: 'ID',
  TIPO: 'TIPO',
  ASSE: 'ASSE',
  CONDIZIONE: 'CONDIZIONE',
  ATTIVO: 'ATTIVO',
  AZIONI: 'AZIONI',
  /** Reserved for future scheduling (DAILY/WEEKLY/...) — present in the structure, ignored in v1. */
  PERIODICITA: 'PERIODICITA'
} as const;
```

- [ ] **Step 4: Add the axis dictionary to the enums**

In `src/domain/value-objects/enums.ts`, right after the `GeneratoreAxis` enum, add:

```ts
/** CONF_AZIONI.ASSE reserved value: the action runs exactly once, with a base CDU and no iteration. */
export const ASSE_SINGOLA = 'SINGOLA';

/** Valid CONF_AZIONI.ASSE values: the CONF_DOC.GENERATORE dictionary plus SINGOLA. */
export const ASSI_AZIONE: string[] = [...Object.values(GeneratoreAxis), ASSE_SINGOLA];
```

- [ ] **Step 5: Write the entity**

Create `src/domain/entities/ConfigurazioneAzione.ts`:

```ts
import { COL_CONF_AZIONI } from '../../config/schema';
import { ASSI_AZIONE } from '../value-objects/enums';
import { AldoEntity } from './AldoEntity';
import { ConfigurationError } from '../errors/DomainError';

/**
 * CONF_AZIONI entity (PK = ID) — one standalone action orchestration: the
 * iteration axis, the whole-action condition gate and the JSON array of
 * elementary actions (shared grammar, see standaloneActions.ts). PERIODICITA is
 * carried but ignored in v1 (scheduling is future work).
 */
export class ConfigurazioneAzione extends AldoEntity {
  public readonly tipo: string;
  public readonly asse: string;
  public readonly condizione: string;
  public readonly periodicita: string;
  private readonly attivo: boolean;
  private readonly azioniRaw: string | null;

  constructor(data: Record<string, unknown> = {}) {
    super(data);
    this.id =
      typeof data[COL_CONF_AZIONI.ID] === 'string' ? (data[COL_CONF_AZIONI.ID] as string) : null;
    this.tipo = text(data[COL_CONF_AZIONI.TIPO]);
    const asse = text(data[COL_CONF_AZIONI.ASSE]);
    if (!ASSI_AZIONE.includes(asse)) {
      throw new ConfigurationError(`CONF_AZIONI ${this.id ?? '?'}: ASSE non valido: ${asse}`);
    }
    this.asse = asse;
    this.condizione = text(data[COL_CONF_AZIONI.CONDIZIONE]);
    this.periodicita = text(data[COL_CONF_AZIONI.PERIODICITA]);
    // Default true: a blank ATTIVO cell (or the '' a live Sheets round-trip
    // returns for it) means "enabled", mirroring CONF_IMP.ATTIVO semantics but
    // opt-out rather than opt-in, per the CONF_AZIONI design doc.
    const attivo = data[COL_CONF_AZIONI.ATTIVO];
    this.attivo = !(attivo === false || String(attivo).trim().toUpperCase() === 'FALSE');
    const azioni = data[COL_CONF_AZIONI.AZIONI];
    this.azioniRaw = typeof azioni === 'string' && azioni.trim() !== '' ? azioni : null;
  }

  isAttivo(): boolean {
    return this.attivo;
  }

  /** Raw AZIONI JSON, or null when the cell is unset — nothing to execute. */
  getAzioniRaw(): string | null {
    return this.azioniRaw;
  }

  override toData(): EntityData {
    return {
      [COL_CONF_AZIONI.ID]: this.id,
      [COL_CONF_AZIONI.TIPO]: this.tipo,
      [COL_CONF_AZIONI.ASSE]: this.asse,
      [COL_CONF_AZIONI.CONDIZIONE]: this.condizione,
      [COL_CONF_AZIONI.ATTIVO]: this.attivo,
      [COL_CONF_AZIONI.AZIONI]: this.azioniRaw,
      [COL_CONF_AZIONI.PERIODICITA]: this.periodicita
    };
  }

  static fromData(data: Record<string, unknown>): ConfigurazioneAzione {
    return new ConfigurazioneAzione(data);
  }
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}
```

- [ ] **Step 6: Run the entity test to verify it passes**

Run: `npx jest --config jest.config.cjs test/unit/domain/configurazione-azione.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 7: Add the validation rules**

In `src/config/validationRules.ts`, add `COL_CONF_AZIONI` to the schema import list and `ASSI_AZIONE` to the enums import list, then add these three rules inside `regoleValidazione()` — the JSON rule next to the other `json(...)` calls, the required rule next to the other `required(...)` calls, the enum rule next to the other `enumRule(...)` calls:

```ts
    json(TABLE.CONF_AZIONI, COL_CONF_AZIONI.AZIONI),
```

```ts
    required(TABLE.CONF_AZIONI, [COL_CONF_AZIONI.ID, COL_CONF_AZIONI.TIPO, COL_CONF_AZIONI.ASSE, COL_CONF_AZIONI.ATTIVO]),
```

```ts
    enumRule('ENUM_CONF_AZIONI_ASSE', TABLE.CONF_AZIONI, COL_CONF_AZIONI.ASSE, ASSI_AZIONE),
```

`VALIDATION_TABLES` needs no change: it already derives from `Object.values(TABLE)`.

- [ ] **Step 8: Add the header row to both test-database builders**

In `src/onlinetests/SampleDatabaseBuilder.ts`, import `COL_CONF_AZIONI` from `../config/schema` and add to the `HEADERS` map after the `CONF_IMP` line:

```ts
  [TABLE.CONF_AZIONI]: Object.values(COL_CONF_AZIONI),
```

Do the same in `src/onlinetests/data/SharedTestHeaders.ts` (import `COL_CONF_AZIONI`, add the same entry after `CONF_IMP`).

- [ ] **Step 9: Run the affected suites**

Run: `npx jest --config jest.config.cjs test/unit/onlinetests test/unit/application/database-validation-service.test.ts test/unit/application/database-validation-service-full-db.test.ts test/unit/domain/configurazione-azione.test.ts`
Expected: PASS — `sample-database-builder.test.ts`'s "one sheet per TABLE entry" assertion now covers `CONF_AZIONI`, and the full-DB validation test still reports zero violations (the new table is empty, so the required/enum rules have no rows to flag).

Run: `npm run typecheck && npm run lint && npm test`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add src/config/schema.ts src/config/validationRules.ts src/domain/value-objects/enums.ts src/domain/entities/ConfigurazioneAzione.ts src/onlinetests/SampleDatabaseBuilder.ts src/onlinetests/data/SharedTestHeaders.ts test/unit/domain/configurazione-azione.test.ts
git commit -m "feat(conf-azioni): add CONF_AZIONI table, entity and validation rules"
```

---

### Task 4: Extract axis target enumeration into a shared module

`ActionBatchService` must enumerate targets per `ASSE` exactly the way `DocumentBatchService` does per `GENERATORE`. Extract the enumeration (the `resume === null` branches) into pure functions used by both — one source of truth instead of a second copy.

**Files:**

- Create: `src/application/services/axisTargets.ts`
- Modify: `src/application/services/DocumentBatchService.ts` (7 enumeration branches)
- Test: `test/unit/application/axis-targets.test.ts`

**Interfaces:**

- Consumes: nothing from earlier tasks.
- Produces (all pure, no `this`):
  - `targetsClasse(classi: IClasseRepository, gestione: GestioneArticolazione): Classe[]`
  - `targetsPiani(alunni: IAlunnoRepository): PianoBatchTarget[]`
  - `targetsAlunni(alunni: IAlunnoRepository): AlunnoBatchTarget[]`
  - `targetsDipartimenti(dipartimenti: IDipartimentoRepository): string[]`
  - `targetsClasseDocenteMateria(classi, teachingAssignments, now, gestione): DocenteClasseMateriaBatchTarget[]`
  - `targetsClasseMateria(classi, teachingAssignments, now, gestione): ClasseMateriaBatchTarget[]`
  - `targetsClasseDocente(classi, teachingAssignments, now, gestione): ClasseDocenteBatchTarget[]`
  - `targetsDocenti(classi, teachingAssignments, now, gestione): DocenteBatchTarget[]`
  - The five `*BatchTarget` interfaces move here and are re-exported from `DocumentBatchService.ts` so existing importers keep working.

- [ ] **Step 1: Write the failing test**

Create `test/unit/application/axis-targets.test.ts`:

```ts
import {
  targetsClasse,
  targetsClasseDocente,
  targetsClasseMateria,
  targetsDocenti,
  targetsDipartimenti,
  targetsAlunni
} from '../../../src/application/services/axisTargets';
import { ClasseRepository } from '../../../src/infrastructure/repositories/ClasseRepository';
import { AlunnoRepository } from '../../../src/infrastructure/repositories/AlunnoRepository';
import { DipartimentoRepository } from '../../../src/infrastructure/repositories/DipartimentoRepository';
import { FakeDatabase } from '../../fakes/FakeDatabase';
import { fixtureTables } from '../../fixtures/tables';
import { GestioneArticolazione } from '../../../src/domain/value-objects/enums';
import type { ITeachingAssignmentResolver } from '../../../src/application/ports/ITeachingAssignmentResolver';
import { Docente } from '../../../src/domain/entities/Docente';
import { MateriaId } from '../../../src/domain/value-objects/MateriaId';

const NOW = new Date('2026-07-01T09:00:00Z');

/** Every class gets the same two cattedre; one subject carries a specifica. */
function resolver(): ITeachingAssignmentResolver {
  const docente = new Docente({
    EMAIL: 'd1@school.it',
    COGNOME: 'ROSSI',
    NOME: 'MARIO',
    ITP: false
  });
  return {
    resolveConsiglio: () => [
      { docenteEffettivo: docente, slot: { materia: MateriaId.of('MAT'), specifica: null } },
      { docenteEffettivo: docente, slot: { materia: MateriaId.of('LAB'), specifica: 'GRUPPO_A' } }
    ],
    resolveMateria: () => null
  } as unknown as ITeachingAssignmentResolver;
}

test('targetsClasse returns the active classes filtered by gestione articolazione', () => {
  const db = new FakeDatabase(fixtureTables());
  const classi = new ClasseRepository(db);
  const targets = targetsClasse(classi, GestioneArticolazione.COMPLETA);
  expect(targets).toEqual(
    classi.filterPerGestioneArticolazione(classi.findAttive(), GestioneArticolazione.COMPLETA)
  );
  expect(targets.length).toBeGreaterThan(0);
});

test('targetsClasseMateria qualifies a specifica slot as BASE.SPECIFICA and dedups', () => {
  const db = new FakeDatabase(fixtureTables());
  const classi = new ClasseRepository(db);
  const targets = targetsClasseMateria(classi, resolver(), NOW, GestioneArticolazione.COMPLETA);
  const perClasse = targets.filter((t) => t.classe === targets[0]!.classe).map((t) => t.materiaId);
  expect(perClasse).toEqual(['MAT', 'LAB.GRUPPO_A']);
});

test('targetsClasseDocente dedups the same teacher across two subjects of one class', () => {
  const db = new FakeDatabase(fixtureTables());
  const classi = new ClasseRepository(db);
  const targets = targetsClasseDocente(classi, resolver(), NOW, GestioneArticolazione.COMPLETA);
  const perClasse = targets.filter((t) => t.classe === targets[0]!.classe);
  expect(perClasse).toHaveLength(1);
});

test('targetsDocenti aggregates every class a teacher is assigned to', () => {
  const db = new FakeDatabase(fixtureTables());
  const classi = new ClasseRepository(db);
  const targets = targetsDocenti(classi, resolver(), NOW, GestioneArticolazione.COMPLETA);
  expect(targets).toHaveLength(1);
  expect(targets[0]!.docenteEmail).toBe('d1@school.it');
  expect(targets[0]!.classiCompetenza.length).toBe(
    classi.filterPerGestioneArticolazione(classi.findAttive(), GestioneArticolazione.COMPLETA)
      .length
  );
});

test('targetsAlunni and targetsDipartimenti enumerate their whole tables', () => {
  const db = new FakeDatabase(fixtureTables());
  expect(targetsAlunni(new AlunnoRepository(db)).length).toBe(
    new AlunnoRepository(db).findAttivi().length
  );
  expect(targetsDipartimenti(new DipartimentoRepository(db)).length).toBe(
    new DipartimentoRepository(db).findAll().length
  );
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest --config jest.config.cjs test/unit/application/axis-targets.test.ts`
Expected: FAIL — `Cannot find module '.../axisTargets'`.

- [ ] **Step 3: Create the module**

Create `src/application/services/axisTargets.ts`:

```ts
import type { IClasseRepository } from '../../domain/repositories/IClasseRepository';
import type { IAlunnoRepository } from '../../domain/repositories/IAlunnoRepository';
import type { IDipartimentoRepository } from '../../domain/repositories/IDipartimentoRepository';
import type { Classe } from '../../domain/entities/Classe';
import type { ITeachingAssignmentResolver } from '../ports/ITeachingAssignmentResolver';
import type { GestioneArticolazione, TipoPiano } from '../../domain/value-objects/enums';

/**
 * Batch target enumeration per iteration axis (CONF_DOC.GENERATORE /
 * CONF_AZIONI.ASSE). Pure functions over repositories: DocumentBatchService
 * calls them to freeze its target snapshot at the first run, ActionBatchService
 * calls the same ones — the two axes share a dictionary, so they must share
 * the enumeration or they drift.
 */

export interface PianoBatchTarget {
  studente: string;
  tipo: TipoPiano;
}

export interface DocenteClasseMateriaBatchTarget {
  classe: string;
  docenteEmail: string;
  materiaId: string;
}

export interface ClasseMateriaBatchTarget {
  classe: string;
  materiaId: string;
}

export interface ClasseDocenteBatchTarget {
  classe: string;
  docenteEmail: string;
}

export interface DocenteBatchTarget {
  docenteEmail: string;
  classiCompetenza: string[];
}

export interface AlunnoBatchTarget {
  email: string;
}

/**
 * Role-resolved (SUPPLENZE -> VARIAZIONI_CATTEDRA -> CLASSI) council of every
 * active class. `includeReligioneAlt: true` mirrors resolveCouncilForProjection
 * — without it a teacher holding only IRC/attività alternativa is never
 * enumerated. No routingPolicy: it only affects TeachingAssignment.routing,
 * never `docenteEffettivo`/`slot`, the two fields these enumerations read.
 */
function perClasseConCattedre(
  classi: IClasseRepository,
  teachingAssignments: ITeachingAssignmentResolver,
  now: Date,
  gestione: GestioneArticolazione
): Array<{ classeId: string; docenteEmail: string; materiaId: string }> {
  const out: Array<{ classeId: string; docenteEmail: string; materiaId: string }> = [];
  for (const classe of targetsClasse(classi, gestione)) {
    for (const assignment of teachingAssignments.resolveConsiglio(classe, now, {
      includeReligioneAlt: true
    })) {
      out.push({
        classeId: classe.id ?? '',
        docenteEmail: assignment.docenteEffettivo.email.value,
        // specifica-qualified (BASE.SPECIFICA), mirroring SheetMaterieGeneratorStrategy.catalogId()
        materiaId:
          assignment.slot.specifica === null
            ? assignment.slot.materia.value
            : `${assignment.slot.materia.value}.${assignment.slot.specifica}`
      });
    }
  }
  return out;
}

export function targetsClasse(
  classi: IClasseRepository,
  gestione: GestioneArticolazione
): Classe[] {
  return classi.filterPerGestioneArticolazione(classi.findAttive(), gestione);
}

export function targetsPiani(alunni: IAlunnoRepository): PianoBatchTarget[] {
  const targets: PianoBatchTarget[] = [];
  for (const alunno of alunni.findAttivi()) {
    for (const piano of alunni.getPiani(alunno)) {
      targets.push({ studente: alunno.email.value, tipo: piano.tipo });
    }
  }
  return targets;
}

export function targetsAlunni(alunni: IAlunnoRepository): AlunnoBatchTarget[] {
  return alunni.findAttivi().map((alunno) => ({ email: alunno.email.value }));
}

export function targetsDipartimenti(dipartimenti: IDipartimentoRepository): string[] {
  return dipartimenti.findAll().map((dipartimento) => dipartimento.id ?? '?');
}

/**
 * Slots differing only by kind (STANDARD vs ITP on the same materiaId) collapse
 * to one target by design; dedup keeps the first match, mirroring
 * DocenteClasseMateriaFocusProvider's own first-match `materie.find` semantics.
 */
export function targetsClasseDocenteMateria(
  classi: IClasseRepository,
  teachingAssignments: ITeachingAssignmentResolver,
  now: Date,
  gestione: GestioneArticolazione
): DocenteClasseMateriaBatchTarget[] {
  const seen = new Set<string>();
  const targets: DocenteClasseMateriaBatchTarget[] = [];
  for (const { classeId, docenteEmail, materiaId } of perClasseConCattedre(
    classi,
    teachingAssignments,
    now,
    gestione
  )) {
    const key = `${classeId}:${materiaId}:${docenteEmail}`;
    if (seen.has(key)) continue;
    seen.add(key);
    targets.push({ classe: classeId, docenteEmail, materiaId });
  }
  return targets;
}

export function targetsClasseMateria(
  classi: IClasseRepository,
  teachingAssignments: ITeachingAssignmentResolver,
  now: Date,
  gestione: GestioneArticolazione
): ClasseMateriaBatchTarget[] {
  const seen = new Set<string>();
  const targets: ClasseMateriaBatchTarget[] = [];
  for (const { classeId, materiaId } of perClasseConCattedre(
    classi,
    teachingAssignments,
    now,
    gestione
  )) {
    const key = `${classeId}:${materiaId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    targets.push({ classe: classeId, materiaId });
  }
  return targets;
}

export function targetsClasseDocente(
  classi: IClasseRepository,
  teachingAssignments: ITeachingAssignmentResolver,
  now: Date,
  gestione: GestioneArticolazione
): ClasseDocenteBatchTarget[] {
  const seen = new Set<string>();
  const targets: ClasseDocenteBatchTarget[] = [];
  for (const { classeId, docenteEmail } of perClasseConCattedre(
    classi,
    teachingAssignments,
    now,
    gestione
  )) {
    const key = `${classeId}:${docenteEmail}`;
    if (seen.has(key)) continue;
    seen.add(key);
    targets.push({ classe: classeId, docenteEmail });
  }
  return targets;
}

export function targetsDocenti(
  classi: IClasseRepository,
  teachingAssignments: ITeachingAssignmentResolver,
  now: Date,
  gestione: GestioneArticolazione
): DocenteBatchTarget[] {
  const classiPerDocente = new Map<string, Set<string>>();
  for (const { classeId, docenteEmail } of perClasseConCattedre(
    classi,
    teachingAssignments,
    now,
    gestione
  )) {
    const acc = classiPerDocente.get(docenteEmail) ?? new Set<string>();
    acc.add(classeId);
    classiPerDocente.set(docenteEmail, acc);
  }
  return [...classiPerDocente.entries()].map(([docenteEmail, classi2]) => ({
    docenteEmail,
    classiCompetenza: [...classi2]
  }));
}
```

- [ ] **Step 4: Run the new test to verify it passes**

Run: `npx jest --config jest.config.cjs test/unit/application/axis-targets.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Point DocumentBatchService at the shared module**

In `src/application/services/DocumentBatchService.ts`:

a) Delete the six local `*BatchTarget` interface declarations and replace them with a re-export so existing importers (tests, checkpoint types) keep compiling:

```ts
import {
  targetsAlunni,
  targetsClasse,
  targetsClasseDocente,
  targetsClasseDocenteMateria,
  targetsClasseMateria,
  targetsDipartimenti,
  targetsDocenti,
  targetsPiani,
  type AlunnoBatchTarget,
  type ClasseDocenteBatchTarget,
  type ClasseMateriaBatchTarget,
  type DocenteBatchTarget,
  type DocenteClasseMateriaBatchTarget,
  type PianoBatchTarget
} from './axisTargets';

export type {
  AlunnoBatchTarget,
  ClasseDocenteBatchTarget,
  ClasseMateriaBatchTarget,
  DocenteBatchTarget,
  DocenteClasseMateriaBatchTarget,
  PianoBatchTarget
};
```

b) Replace each `resume === null` enumeration branch with the corresponding call (the `else` resume branches stay exactly as they are):

- in `generatePiani`: `targets = targetsPiani(this.alunni);`
- in `generateDocentiClasseMateria`: `targets = targetsClasseDocenteMateria(this.classi, this.teachingAssignments, this.now, config.gestioneArticolazione);`
- in `generateClassiMateria`: `targets = targetsClasseMateria(this.classi, this.teachingAssignments, this.now, config.gestioneArticolazione);`
- in `generateClasseDocente`: `targets = targetsClasseDocente(this.classi, this.teachingAssignments, this.now, config.gestioneArticolazione);`
- in `generateDocenti`: `targets = targetsDocenti(this.classi, this.teachingAssignments, this.now, config.gestioneArticolazione);`
- in `generateDipartimenti`: `tutti = targetsDipartimenti(this.dipartimenti);`
- in `generateAlunni`: `targets = targetsAlunni(this.alunni);`
- in `generateClassi`:

```ts
const classi = targetsClasse(this.classi, config.gestioneArticolazione);
attive = classi;
classeTargets = classi.map((classe) => classe.id ?? '');
```

Move the long explanatory comments that sat inside those branches into `axisTargets.ts` where the logic now lives (the `perClasseConCattedre` docstring already carries them) — do not leave orphaned comments describing code that moved.

- [ ] **Step 6: Run the regression suites**

Run: `npx jest --config jest.config.cjs test/unit/application/document-batch-service.test.ts test/unit/application/axis-targets.test.ts`
Expected: PASS, with the document-batch test count unchanged.

Run: `npm run typecheck && npm run lint && npm test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/application/services/axisTargets.ts src/application/services/DocumentBatchService.ts test/unit/application/axis-targets.test.ts
git commit -m "refactor(batch): extract per-axis target enumeration into axisTargets"
```

---

### Task 5: Infrastructure action handlers (`AGGIORNA_PERMESSI`, `RIDUCI_PERMESSI`, `VALIDA_DB`)

**Files:**

- Create: `src/application/pipelines/azioniInfra.ts`
- Modify: `src/infrastructure/facades/DriveServiceFacade.ts` (export the role map)
- Modify: `src/application/services/DatabaseValidationService.ts` (`esegui(tabelle?)`)
- Test: `test/unit/application/azioni-infra.test.ts`
- Test: `test/unit/application/database-validation-service.test.ts` (add subset case)

**Interfaces:**

- Consumes: `Azione`, `AzioneHandler`, `PostProcessDb`, `csvValues` (Task 1); `IDriveFacade`, `DrivePermission`, `PermissionGrant` (existing).
- Produces:
  - `export const DRIVE_ROLE_BY_PERMESSO: Record<string, string>` in `DriveServiceFacade.ts` (the existing private `ROLE_MAP`, exported and referenced by the class).
  - `export interface AzioniInfraDeps { db: PostProcessDb; drive: IDriveFacade; roles: IRoleResolver; cdu: Cdu; storico?: StoricoDocumentiService; validator?: { esegui(tabelle?: string[]): { violazioni: unknown[]; nome: string } }; logger: LoggerService; }`
  - `export function creaHandlersInfra(deps: AzioniInfraDeps): Record<string, AzioneHandler>`
  - `DatabaseValidationService.esegui(tabelle?: string[]): ValidationReport`

- [ ] **Step 1: Write the failing handler tests**

Create `test/unit/application/azioni-infra.test.ts`:

```ts
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
    {
      ID: 'file_1',
      ID_GEN: 'CD1',
      TIPO: 'VERBALE',
      SOTTOTIPO: '',
      CLASSI: '5A,5B',
      UTENTI: '',
      MATERIE: '',
      PATH: 'Verbali/5',
      STATO: 'GENERATO'
    },
    {
      ID: 'file_2',
      ID_GEN: 'CD1',
      TIPO: 'PIANO',
      SOTTOTIPO: 'PEI',
      CLASSI: '1A',
      UTENTI: 'a1@school.it',
      MATERIE: '',
      PATH: 'Piani/1',
      STATO: 'GENERATO'
    }
  ];
  tables['LOG_FOLD'] = [
    {
      ID: 'fold_1',
      ID_GEN: 'CD1',
      TIPO: 'CARTELLA_CLASSE',
      NOME: '5A',
      PATH: '2026-2027/5A',
      CLASSI: '5A',
      UTENTI: '',
      MATERIE: ''
    }
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
  expect(drive.permissions).toEqual([
    { fileId: 'fold_1', email: 'x@school.it', permesso: 'LETTURA' }
  ]);
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
  const handlers = creaHandlersInfra({
    db: db(),
    drive: new FakeDriveFacade(),
    roles,
    cdu,
    logger
  });
  expect(handlers['VALIDA_DB']!({ tipo: 'VALIDA_DB' }, {})).toBe(0);
  expect(warn).toHaveBeenCalledWith(expect.stringContaining('VALIDA_DB'));
  warn.mockRestore();
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest --config jest.config.cjs test/unit/application/azioni-infra.test.ts`
Expected: FAIL — `Cannot find module '.../azioniInfra'`.

- [ ] **Step 3: Export the permesso→role map from the Drive facade**

In `src/infrastructure/facades/DriveServiceFacade.ts`, change

```ts
const ROLE_MAP: Record<string, string> = {
```

to

```ts
/** ALDO PermessoACL -> Drive API v3 sharing role (14 §4). Exported so the azioni
 * handlers can compare an expected permesso against a live `DrivePermission.role`
 * without a second copy of the mapping. */
export const DRIVE_ROLE_BY_PERMESSO: Record<string, string> = {
```

and update the single in-class use `const role = ROLE_MAP[permesso] ?? 'reader';` to `const role = DRIVE_ROLE_BY_PERMESSO[permesso] ?? 'reader';`.

- [ ] **Step 4: Write the handler factory**

Create `src/application/pipelines/azioniInfra.ts`:

```ts
import type { Azione, AzioneHandler, PostProcessDb } from './standaloneActions';
import { csvValues } from './standaloneActions';
import type {
  IDriveFacade,
  PermissionGrant
} from '../../infrastructure/facades/DriveServiceFacade';
import { DRIVE_ROLE_BY_PERMESSO } from '../../infrastructure/facades/DriveServiceFacade';
import type { IRoleResolver } from './documentSteps';
import type { Cdu } from '../context-engine/Cdu';
import type { StoricoDocumentiService } from '../storico/StoricoDocumentiService';
import { TABLE } from '../../config/schema';
import { ConfigurationError } from '../../domain/errors/DomainError';

/** Drive roles ordered by privilege; owner/organizer are absent on purpose —
 * Drive rejects downgrading them and they keep full access regardless
 * (same rule LockDocumentsService documents). */
const RANK: Record<string, number> = { reader: 1, commenter: 2, writer: 3 };

/** Log columns whose cells hold a CSV list and therefore match by containment (01 §CLASSI/UTENTI). */
const CSV_COLUMNS = new Set(['CLASSI', 'UTENTI', 'MATERIE']);

export interface ValidatoreDb {
  esegui(tabelle?: string[]): { violazioni: unknown[]; nome: string };
}

export interface AzioniInfraDeps {
  db: PostProcessDb;
  drive: IDriveFacade;
  roles: IRoleResolver;
  /** CDU of the current target — the role resolver's context. */
  cdu: Cdu;
  /** Needed only by AGGIORNA_PERMESSI with `profondita` > 0. */
  storico?: StoricoDocumentiService;
  /** Needed only by VALIDA_DB; absent off-GAS (no SpreadsheetService). */
  validator?: ValidatoreDb;
  logger: LoggerService;
}

/**
 * The infra half of the azioni grammar: action types that touch Drive or run a
 * service, supplied to `eseguiAzioni` as `handlers` (the DB-only types stay
 * built in). Every handler is idempotent by construction — it computes the
 * delta between the configured state and the live one and writes only that —
 * so a resumed or re-run job repeats no work.
 */
export function creaHandlersInfra(deps: AzioniInfraDeps): Record<string, AzioneHandler> {
  const { db, drive, roles, cdu, storico, validator, logger } = deps;

  /** Rows of LOG_DOCS/LOG_FOLD matching `criteri`: CSV columns by containment, PATH by prefix, everything else by equality. */
  function selezionaId(azione: Azione, criteri: Record<string, string>): string[] {
    const tab = azione.su ?? TABLE.LOG_DOCS;
    if (tab !== TABLE.LOG_DOCS && tab !== TABLE.LOG_FOLD) {
      throw new ConfigurationError(
        `AZIONE ${azione.tipo}: "su" deve essere LOG_DOCS o LOG_FOLD, non ${tab}`
      );
    }
    const table = db.tables[tab];
    if (table === undefined) return [];
    const entries = Object.entries(criteri);
    return table
      .getAllRows()
      .filter((row) =>
        entries.every(([col, value]) => {
          if (col === 'PATH') return String(row[col] ?? '').startsWith(value);
          if (CSV_COLUMNS.has(col)) {
            const attesi = csvValues(value);
            return attesi.length === 0
              ? String(row[col] ?? '') === value
              : csvValues(row[col]).some((v) => attesi.includes(v));
          }
          return String(row[col] ?? '') === value;
        })
      )
      .map((row) => String(row['ID'] ?? ''))
      .filter((id) => id !== '');
  }

  /** Current-year targets plus, when `profondita` > 0, the matching historical LOG_DOCS ids. */
  function targetIds(azione: Azione, criteri: Record<string, string>): string[] {
    const correnti = selezionaId(azione, criteri);
    const profondita = azione.profondita ?? 0;
    if (profondita <= 0 || storico === undefined) return correnti;
    // StoricoDocumentiService only understands LOG_DOCS metadata criteria; PATH
    // is a current-year folder-tree concept and is dropped for the history scan.
    const storiciCriteri = Object.fromEntries(
      Object.entries(criteri).filter(([col]) => col !== 'PATH')
    );
    return [...new Set([...correnti, ...storico.idsMatching(storiciCriteri, profondita)])];
  }

  function destinatari(azione: Azione): string[] {
    if (azione.ruolo !== undefined && azione.ruolo.trim() !== '') {
      return roles.risolvi(azione.ruolo, cdu).map((email) => email.value);
    }
    return (azione.emails ?? []).filter((email) => email.trim() !== '');
  }

  return {
    /**
     * Applies the configured ACL to every selected file/folder, writing only the
     * delta against `listPermissions`: a missing address becomes a batched grant,
     * an address holding a different role becomes a role change. owner/organizer
     * are never touched. This is what makes the action re-runnable as a
     * cattedra/supplenza realignment.
     */
    AGGIORNA_PERMESSI: (azione, criteri) => {
      const permesso = azione.permesso ?? 'LETTURA';
      const role = DRIVE_ROLE_BY_PERMESSO[permesso] ?? 'reader';
      const emails = destinatari(azione);
      if (emails.length === 0) return 0;
      const grants: PermissionGrant[] = [];
      let cambiati = 0;
      for (const targetId of targetIds(azione, criteri)) {
        const attuali = new Map(
          drive
            .listPermissions(targetId)
            .filter((p) => p.email !== null)
            .map((p) => [p.email!, p])
        );
        const changes: Array<{ permissionId: string; role: string }> = [];
        for (const email of emails) {
          const attuale = attuali.get(email);
          if (attuale === undefined) {
            grants.push({ targetId, email, permesso });
            continue;
          }
          if (attuale.role === role || RANK[attuale.role] === undefined) continue;
          changes.push({ permissionId: attuale.id, role });
        }
        if (changes.length === 0) continue;
        const falliti = drive.changePermissionRoles(targetId, changes);
        cambiati += changes.length - falliti.length;
        for (const fallito of falliti) {
          logger.warn(`AGGIORNA_PERMESSI: ${targetId}/${fallito.permissionId} — ${fallito.errore}`);
        }
      }
      // One shareWithUsers call per targetId+permesso pair, batched by the facade.
      if (grants.length > 0) drive.setPermissions(grants);
      return grants.length + cambiati;
    },

    /** Caps every ACL at `soglia` (default LETTURA) on the selected targets — writer/commenter -> reader. */
    RIDUCI_PERMESSI: (azione, criteri) => {
      const soglia = azione.soglia ?? 'LETTURA';
      const roleSoglia = DRIVE_ROLE_BY_PERMESSO[soglia] ?? 'reader';
      const max = RANK[roleSoglia] ?? 1;
      let declassati = 0;
      for (const targetId of targetIds(azione, criteri)) {
        const changes = drive
          .listPermissions(targetId)
          .filter((p) => (RANK[p.role] ?? 0) > max)
          .map((p) => ({ permissionId: p.id, role: roleSoglia }));
        if (changes.length === 0) continue;
        const falliti = drive.changePermissionRoles(targetId, changes);
        declassati += changes.length - falliti.length;
        for (const fallito of falliti) {
          logger.warn(`RIDUCI_PERMESSI: ${targetId}/${fallito.permissionId} — ${fallito.errore}`);
        }
      }
      return declassati;
    },

    /** Read-only: runs the validator (optionally over a table subset) and reports the violation count. */
    VALIDA_DB: (azione) => {
      if (validator === undefined) {
        logger.warn('AZIONE VALIDA_DB: servizio di validazione non disponibile — saltata');
        return 0;
      }
      const esito = validator.esegui(azione.tabelle);
      logger.info(`VALIDA_DB: ${esito.violazioni.length} violazioni — report ${esito.nome}`);
      return esito.violazioni.length;
    }
  };
}
```

- [ ] **Step 5: Run the handler tests to verify they pass**

Run: `npx jest --config jest.config.cjs test/unit/application/azioni-infra.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 6: Write the failing test for the validation subset**

Append to `test/unit/application/database-validation-service.test.ts`:

```ts
test('esegui(tabelle) reports only the requested tables, still validating FKs against the whole DB', () => {
  // Two deliberate violations in two different tables; only one is requested.
  const tables = fixtureTables();
  tables['CLASSI'] = [{ ID: '', ANNO: '5', INDIRIZZO: 'INF' }];
  tables['DOCENTI'] = [{ EMAIL: 'd@school.it', COGNOME: '', NOME: 'X', ITP: false }];
  const db = new FakeDatabase(tables);
  const report = new FakeSpreadsheetReportFacade();
  const service = new DatabaseValidationService({ db, master: master(), report });

  const esito = service.esegui(['CLASSI']);

  expect(esito.violazioni.every((v) => v.tabella === 'CLASSI')).toBe(true);
  expect(esito.violazioni.length).toBeGreaterThan(0);
  expect(esito.nome).toContain('CLASSI');
});
```

(Reuse whatever `master()`/fixture helpers that file already defines; if its helper names differ, adapt the call, not the assertion.)

- [ ] **Step 7: Run it to verify it fails**

Run: `npx jest --config jest.config.cjs test/unit/application/database-validation-service.test.ts -t "esegui(tabelle)"`
Expected: FAIL — `esegui` takes no argument, so every table's violations come back.

- [ ] **Step 8: Implement the table subset**

In `src/application/services/DatabaseValidationService.ts`, replace the `esegui()` signature and the first lines of its body:

```ts
  /**
   * Validates the current year's database. `tabelle` narrows only the REPORTED
   * tables: the whole DB is still read and validated, because foreign-key rules
   * resolve their targets across tables and a partial read would report false
   * violations. Used both by the menu (no argument) and by the VALIDA_DB action.
   */
  esegui(tabelle?: string[]): ValidationReport {
    const richieste = tabelle === undefined ? null : tabelle.filter((t) => VALIDATION_TABLES.includes(t));
    const datasets = this.leggiTabelle();
    const { violations } = new DatasetValidator({ logger: this.logger }).validate(
      datasets,
      regoleValidazione()
    );
    const violazioni = violations
      .filter((v) => richieste === null || richieste.includes(v.table))
      .map((v) => ({
```

and change the report name line to:

```ts
const nome =
  richieste === null
    ? `Validazione DB - ${anno.annoScolasticoRaw}`
    : `Validazione DB - ${anno.annoScolasticoRaw} - ${richieste.join(', ')}`;
```

- [ ] **Step 9: Run the validation tests to verify they pass**

Run: `npx jest --config jest.config.cjs test/unit/application/database-validation-service.test.ts test/unit/application/database-validation-service-full-db.test.ts`
Expected: PASS.

Run: `npm run typecheck && npm run lint && npm test`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add src/application/pipelines/azioniInfra.ts src/infrastructure/facades/DriveServiceFacade.ts src/application/services/DatabaseValidationService.ts test/unit/application/azioni-infra.test.ts test/unit/application/database-validation-service.test.ts
git commit -m "feat(azioni): add AGGIORNA_PERMESSI, RIDUCI_PERMESSI and VALIDA_DB handlers"
```

---

### Task 6: `ActionBatchService` — the `ESECUZIONE_AZIONI` job

**Files:**

- Create: `src/application/services/ActionBatchService.ts`
- Modify: `src/application/context-engine/Recipe.ts` (new recipe + `tipoOperazione` union)
- Modify: `src/application/context-engine/Cdu.ts` (`tipoOperazione`/`tipoOperazioneLabel` unions)
- Modify: `src/application/context-engine/ContextBuilder.ts` (label mapping)
- Test: `test/unit/application/action-batch-service.test.ts`

**Interfaces:**

- Consumes: `eseguiAzioni` (Task 1), `ConfigurazioneAzione`/`COL_CONF_AZIONI`/`ASSE_SINGOLA` (Task 3), `axisTargets` (Task 4), `creaHandlersInfra` (Task 5).
- Produces:
  - `export const JOB_TYPE_ESECUZIONE_AZIONI = 'ESECUZIONE_AZIONI'`
  - `export const JOB_LABEL_ESECUZIONE_AZIONI = 'ESECUZIONE AZIONI'`
  - `export interface AzioniCheckpoint extends AzioniResumeState { percentage: number }`
  - `class ActionBatchService` with `constructor(deps: ActionBatchDeps)`, `*batchAzioniHandler(params)`, `registerJobHandlers(queue: JobQueueLike): void`, `start(runner, jobName, azioneIds, forceRestart?, maxDurationMs?): unknown`, `elencoAttive(): Array<{ id: string; tipo: string }>`, `findAzione(id: string): ConfigurazioneAzione | null`
  - `export interface ActionBatchDeps { db: IDatabase & PostProcessDb; contextBuilder: ContextBuilder; expressionEngine: IExpressionEngine; templates: ITemplateEngine; drive: IDriveFacade; roles: IRoleResolver; classi: IClasseRepository; alunni: IAlunnoRepository; dipartimenti: IDipartimentoRepository; teachingAssignments: ITeachingAssignmentResolver; now: Date; storico?: StoricoDocumentiService; validator?: ValidatoreDb; logger?: LoggerService; logJob?: ILogJobRepository; activeUser?: IActiveUserFacade }`

- [ ] **Step 1: Add the base recipe and the new operation type**

In `src/application/context-engine/Recipe.ts`:

- change `BuildParams.tipoOperazione` to `'GENERAZIONE_DOCUMENTO' | 'INVIO_NOTIFICA' | 'ESECUZIONE_AZIONE';`
- add to `RECIPES`, after `DOCENTE_AGGREGATO`:

```ts
/** CONF_AZIONI ASSE=SINGOLA (and the CONDIZIONE gate of every axis): institute-level CDU only, no focus. */
AZIONE_SINGOLA: ['school'];
```

In `src/application/context-engine/Cdu.ts`, widen both unions:

```ts
tipoOperazione: 'GENERAZIONE_DOCUMENTO' | 'INVIO_NOTIFICA' | 'ESECUZIONE_AZIONE';
tipoOperazioneLabel: 'Generazione documento' | 'Invio notifica' | 'Esecuzione azione';
```

In `src/application/context-engine/ContextBuilder.ts`, replace the ternary label mapping with:

```ts
        tipoOperazioneLabel: OPERAZIONE_LABEL[params.tipoOperazione],
```

and add near the top of the file:

```ts
const OPERAZIONE_LABEL = {
  GENERAZIONE_DOCUMENTO: 'Generazione documento',
  INVIO_NOTIFICA: 'Invio notifica',
  ESECUZIONE_AZIONE: 'Esecuzione azione'
} as const;
```

- [ ] **Step 2: Write the failing service test**

Create `test/unit/application/action-batch-service.test.ts`:

```ts
import {
  ActionBatchService,
  JOB_TYPE_ESECUZIONE_AZIONI
} from '../../../src/application/services/ActionBatchService';
import type { AzioniCheckpoint } from '../../../src/application/services/ActionBatchService';
import { FakeDatabase } from '../../fakes/FakeDatabase';
import { fixtureTables } from '../../fixtures/tables';
import { FakeDriveFacade } from '../../fakes/FakeDriveFacade';
import { FakeTemplateEngine } from '../../fakes/FakeTemplateEngine';
import { ClasseRepository } from '../../../src/infrastructure/repositories/ClasseRepository';
import { AlunnoRepository } from '../../../src/infrastructure/repositories/AlunnoRepository';
import { DipartimentoRepository } from '../../../src/infrastructure/repositories/DipartimentoRepository';
import { ContextBuilder } from '../../../src/application/context-engine/ContextBuilder';
import { ContextEngineFactory } from '../../../src/application/context-engine/ContextEngineFactory';
import { StatoJob } from '../../../src/domain/value-objects/enums';
import { ConfigurationError } from '../../../src/domain/errors/DomainError';
import type {
  ILogJobRepository,
  LogJobEntryInput
} from '../../../src/domain/repositories/ILogJobRepository';
import type { ITeachingAssignmentResolver } from '../../../src/application/ports/ITeachingAssignmentResolver';
import type { IMasterSheetRepository } from '../../../src/domain/repositories/IMasterSheetRepository';
import { MasterConfig } from '../../../src/domain/entities/MasterConfig';

const NOW = new Date('2026-09-13T08:00:00.000Z');

function fakeLogJob(): { logJob: ILogJobRepository; entries: LogJobEntryInput[] } {
  const entries: LogJobEntryInput[] = [];
  return {
    entries,
    logJob: {
      append: (entry) => {
        entries.push(entry);
        return entry as unknown as ReturnType<ILogJobRepository['append']>;
      },
      listByType: () => [],
      getById: () => [],
      getFailuresSince: () => []
    }
  };
}

const noopTeachingAssignments = {
  resolveConsiglio: () => [],
  resolveMateria: () => null
} as unknown as ITeachingAssignmentResolver;

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

function wire(azioni: Array<Record<string, unknown>>, options: { condizione?: boolean } = {}) {
  const tables = fixtureTables();
  tables['CONF_AZIONI'] = azioni;
  tables['DOCENTI'] = [{ EMAIL: 'd1@school.it', COGNOME: '  rossi  ', NOME: 'mario', ITP: false }];
  const db = new FakeDatabase(tables);
  const classi = new ClasseRepository(db);
  const { logJob, entries } = fakeLogJob();
  const contextBuilder: ContextBuilder = ContextEngineFactory.create({
    master: master(),
    teachingAssignments: noopTeachingAssignments,
    ruoli: { findAll: () => [] } as never,
    docenti: { findAll: () => [] } as never,
    classi,
    alunni: new AlunnoRepository(db),
    materie: { findAll: () => [] } as never,
    oreAsl: { findAll: () => [] } as never,
    movimenti: { findAll: () => [] } as never,
    logDocs: { findAll: () => [] } as never,
    progetti: { findAll: () => [] } as never,
    dipartimenti: new DipartimentoRepository(db),
    variazioni: { findAll: () => [] } as never,
    supplenze: { findAll: () => [] } as never,
    storicoDb: { apri: () => null } as never
  });
  const service = new ActionBatchService({
    db,
    contextBuilder,
    expressionEngine: { evaluateBoolean: () => options.condizione ?? true },
    templates: new FakeTemplateEngine(),
    drive: new FakeDriveFacade(),
    roles: { risolvi: () => [] },
    classi,
    alunni: new AlunnoRepository(db),
    dipartimenti: new DipartimentoRepository(db),
    teachingAssignments: noopTeachingAssignments,
    now: NOW,
    logJob,
    activeUser: { getEmail: () => 'admin@school.it' }
  });
  return { service, db, entries };
}

function drain(generator: Generator<AzioniCheckpoint, unknown, void>): AzioniCheckpoint[] {
  const checkpoints: AzioniCheckpoint[] = [];
  let step = generator.next();
  while (!step.done) {
    checkpoints.push(step.value);
    step = generator.next();
  }
  return checkpoints;
}

const SANIFICA = {
  ID: 'SANIFICA_TRIM',
  TIPO: 'MANUTENZIONE',
  ASSE: 'SINGOLA',
  CONDIZIONE: '',
  ATTIVO: true,
  AZIONI: JSON.stringify([
    { tipo: 'TRASFORMA_CAMPO', tab: 'DOCENTI', col: 'COGNOME', operazione: 'TRIM' }
  ]),
  PERIODICITA: ''
};

test('ASSE=SINGOLA runs the action exactly once and applies it', () => {
  const { service, db, entries } = wire([SANIFICA]);
  const checkpoints = drain(
    service.batchAzioniHandler({ azioneIds: ['SANIFICA_TRIM'], jobId: 'azioni_SANIFICA_TRIM' })
  );

  expect(checkpoints).toHaveLength(1);
  expect(db.tables['DOCENTI']!.getAllRows()[0]!['COGNOME']).toBe('rossi');
  expect(entries).toHaveLength(1);
  expect(entries[0]).toMatchObject({
    tipo: JOB_TYPE_ESECUZIONE_AZIONI,
    idConfig: 'SANIFICA_TRIM',
    nomeConfig: 'MANUTENZIONE',
    stato: StatoJob.COMPLETATO,
    totaleTask: 1,
    completatiOk: 1,
    falliti: 0,
    eseguitoDa: 'admin@school.it'
  });
});

test('ASSE=CLASSE yields one checkpoint per active class', () => {
  const { service } = wire([{ ...SANIFICA, ID: 'PER_CLASSE', ASSE: 'CLASSE' }]);
  const checkpoints = drain(
    service.batchAzioniHandler({ azioneIds: ['PER_CLASSE'], jobId: 'job' })
  );
  expect(checkpoints.length).toBeGreaterThan(1);
  expect(checkpoints[checkpoints.length - 1]!.percentage).toBe(100);
});

test('a false CONDIZIONE skips the action and writes no LOG_JOB row', () => {
  const { service, db, entries } = wire([SANIFICA], { condizione: false });
  drain(service.batchAzioniHandler({ azioneIds: ['SANIFICA_TRIM'], jobId: 'job' }));
  expect(entries).toEqual([]);
  expect(db.tables['DOCENTI']!.getAllRows()[0]!['COGNOME']).toBe('  rossi  ');
});

test('an unknown ASSE fails the job with a ConfigurationError and a FALLITO row', () => {
  const { service, entries } = wire([{ ...SANIFICA, ASSE: 'GALASSIA' }]);
  expect(() =>
    drain(service.batchAzioniHandler({ azioneIds: ['SANIFICA_TRIM'], jobId: 'job' }))
  ).toThrow(ConfigurationError);
  expect(entries[0]).toMatchObject({ stato: StatoJob.FALLITO });
});

test('a missing CONF_AZIONI id fails the job', () => {
  const { service } = wire([SANIFICA]);
  expect(() =>
    drain(service.batchAzioniHandler({ azioneIds: ['NON_ESISTE'], jobId: 'job' }))
  ).toThrow(/NON_ESISTE/);
});

test('a failing target is recorded in LISTA_FALLIMENTI and the run continues', () => {
  const azione = {
    ...SANIFICA,
    ID: 'PER_CLASSE',
    ASSE: 'CLASSE',
    AZIONI: JSON.stringify([{ tipo: 'AGGIORNA_PERMESSI', su: 'TABELLA_INESISTENTE' }])
  };
  const { service, entries } = wire([azione]);
  const checkpoints = drain(
    service.batchAzioniHandler({ azioneIds: ['PER_CLASSE'], jobId: 'job' })
  );
  expect(checkpoints.length).toBeGreaterThan(0);
  expect(entries[0]).toMatchObject({ stato: StatoJob.COMPLETATO_CON_ERRORI });
  expect(entries[0]!.listaFallimenti.length).toBe(entries[0]!.falliti);
  expect(entries[0]!.listaFallimenti[0]).toMatch(/: /);
});

test('resuming from a checkpoint restarts at the persisted index and keeps the job id', () => {
  const { service } = wire([{ ...SANIFICA, ID: 'PER_CLASSE', ASSE: 'CLASSE' }]);
  const first = drain(service.batchAzioniHandler({ azioneIds: ['PER_CLASSE'], jobId: 'job' }));
  const halfway = first[0]!;

  const { service: ripreso, entries } = wire([{ ...SANIFICA, ID: 'PER_CLASSE', ASSE: 'CLASSE' }]);
  const checkpoints = drain(ripreso.batchAzioniHandler({ resumeState: halfway }));

  expect(checkpoints[0]!.nextIndex).toBe(halfway.nextIndex + 1);
  // The suspended execution is backfilled as SOSPESO_TEMPO before the final row.
  expect(entries.map((e) => e.stato)).toEqual([StatoJob.SOSPESO_TEMPO, StatoJob.COMPLETATO]);
  expect(entries.every((e) => e.idJob === 'job')).toBe(true);
});

test('running several actions in one job writes one LOG_JOB row per action', () => {
  const seconda = {
    ...SANIFICA,
    ID: 'SANIFICA_UPPER',
    AZIONI: JSON.stringify([
      { tipo: 'TRASFORMA_CAMPO', tab: 'DOCENTI', col: 'NOME', operazione: 'UPPER' }
    ])
  };
  const { service, db, entries } = wire([SANIFICA, seconda]);
  drain(
    service.batchAzioniHandler({
      azioneIds: ['SANIFICA_TRIM', 'SANIFICA_UPPER'],
      jobId: 'azioni_TUTTE'
    })
  );
  expect(entries.map((e) => e.idConfig)).toEqual(['SANIFICA_TRIM', 'SANIFICA_UPPER']);
  expect(db.tables['DOCENTI']!.getAllRows()[0]!['NOME']).toBe('MARIO');
});

test('elencoAttive lists only the enabled actions', () => {
  const { service } = wire([SANIFICA, { ...SANIFICA, ID: 'DISATTIVA', ATTIVO: false }]);
  expect(service.elencoAttive()).toEqual([{ id: 'SANIFICA_TRIM', tipo: 'MANUTENZIONE' }]);
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx jest --config jest.config.cjs test/unit/application/action-batch-service.test.ts`
Expected: FAIL — `Cannot find module '.../ActionBatchService'`.

- [ ] **Step 4: Write the service**

Create `src/application/services/ActionBatchService.ts`:

```ts
import type { IDatabase } from '../../infrastructure/db/Database';
import type { PostProcessDb } from '../pipelines/standaloneActions';
import { eseguiAzioni } from '../pipelines/standaloneActions';
import { creaHandlersInfra, type ValidatoreDb } from '../pipelines/azioniInfra';
import type { IDriveFacade } from '../../infrastructure/facades/DriveServiceFacade';
import type { ITemplateEngine } from '../../infrastructure/facades/TemplateEngineFacade';
import type { IExpressionEngine } from '../../infrastructure/facades/ExpressionEngineFacade';
import type { IRoleResolver } from '../pipelines/documentSteps';
import type { ContextBuilder } from '../context-engine/ContextBuilder';
import type { BuildParams } from '../context-engine/Recipe';
import { recipe } from '../context-engine/Recipe';
import type { Cdu } from '../context-engine/Cdu';
import type { StoricoDocumentiService } from '../storico/StoricoDocumentiService';
import { ConfigurazioneAzione } from '../../domain/entities/ConfigurazioneAzione';
import { COL_CONF_AZIONI, TABLE } from '../../config/schema';
import {
  ASSE_SINGOLA,
  GeneratoreAxis,
  GestioneArticolazione,
  StatoJob
} from '../../domain/value-objects/enums';
import { ConfigurationError } from '../../domain/errors/DomainError';
import type { IClasseRepository } from '../../domain/repositories/IClasseRepository';
import type { IAlunnoRepository } from '../../domain/repositories/IAlunnoRepository';
import type { IDipartimentoRepository } from '../../domain/repositories/IDipartimentoRepository';
import type { ITeachingAssignmentResolver } from '../ports/ITeachingAssignmentResolver';
import type { ILogJobRepository } from '../../domain/repositories/ILogJobRepository';
import type { IActiveUserFacade } from '../../infrastructure/facades/ActiveUserFacade';
import {
  targetsAlunni,
  targetsClasse,
  targetsClasseDocente,
  targetsClasseDocenteMateria,
  targetsClasseMateria,
  targetsDipartimenti,
  targetsDocenti,
  targetsPiani
} from './axisTargets';

/** Job type under which the azioni batch is registered in JobRunnerLib. */
export const JOB_TYPE_ESECUZIONE_AZIONI = 'ESECUZIONE_AZIONI';
/** Human-readable job type shown in the end-of-job report. */
export const JOB_LABEL_ESECUZIONE_AZIONI = 'ESECUZIONE AZIONI';

/** One iteration target: its id (for logs) and the CDU build params it implies. */
interface AzioneTarget {
  id: string;
  params: Omit<BuildParams, 'now' | 'configurazioneId' | 'esecuzioneId' | 'tipoOperazione'>;
  recipe: string;
}

/** Checkpoint state persisted by JobRunnerLib to ScriptProperties at suspension. */
export interface AzioniResumeState {
  azioneIds: string[];
  /** Index into `azioneIds` of the action currently running. */
  azioneIndex: number;
  jobId: string;
  /** Index of the next target of the current action. */
  nextIndex: number;
  /** Targets of the current action, frozen at its first run. */
  targets: AzioneTarget[];
  processed: string[];
  errori: string[];
  runCount?: number;
  totalDurationMs?: number;
  eseguitoDa?: string;
  /** ISO start of the execution that produced this checkpoint — backfills a SOSPESO_TEMPO row on the next resume. */
  esecuzioneIniziata?: string;
}

export interface AzioniCheckpoint extends AzioniResumeState {
  percentage: number;
}

export interface ActionBatchDeps {
  db: IDatabase & PostProcessDb;
  contextBuilder: ContextBuilder;
  expressionEngine: IExpressionEngine;
  templates: ITemplateEngine;
  drive: IDriveFacade;
  roles: IRoleResolver;
  classi: IClasseRepository;
  alunni: IAlunnoRepository;
  dipartimenti: IDipartimentoRepository;
  teachingAssignments: ITeachingAssignmentResolver;
  /** Injected clock — deterministic, never the system clock. */
  now: Date;
  storico?: StoricoDocumentiService;
  validator?: ValidatoreDb;
  logger?: LoggerService;
  logJob?: ILogJobRepository;
  activeUser?: IActiveUserFacade;
}

/**
 * Standalone azioni batch (CONF_AZIONI design doc): for each requested action
 * row it evaluates CONDIZIONE once against a base CDU, enumerates the targets
 * of its ASSE (same dictionary and the same enumeration functions as
 * CONF_DOC.GENERATORE, see axisTargets.ts), materialises one CDU per target and
 * runs the action array through the shared azioni grammar.
 *
 * GAS caps execution at 6/30 minutes, so this is a generator-function
 * JobRunnerLib (L3) handler: the library checks the clock at each `yield`,
 * persists the yielded checkpoint to ScriptProperties, schedules the resume
 * trigger and re-enters with `params.resumeState`.
 *
 * Error hierarchy (design doc §Gestione errori): broken configuration (unknown
 * ASSE, malformed AZIONI, missing id) throws before the run starts and logs a
 * FALLITO row; a single elementary action failing on a single target is
 * recorded in LISTA_FALLIMENTI and the run continues (COMPLETATO_CON_ERRORI).
 * There is no rollback — the permission actions are idempotent by construction,
 * so a re-run reconciles rather than duplicates.
 */
export class ActionBatchService {
  constructor(private readonly deps: ActionBatchDeps) {}

  private containerStartedAt = Date.now();
  private runCount = 1;
  private priorDurationMs = 0;
  private eseguitoDa = '';
  private esecuzioneIniziata = '';

  private elapsedTotalMs(): number {
    return this.priorDurationMs + (Date.now() - this.containerStartedAt);
  }

  /** Every CONF_AZIONI row, typed. */
  private tutte(): ConfigurazioneAzione[] {
    return this.deps.db
      .table(TABLE.CONF_AZIONI)
      .findAll()
      .map((row) => ConfigurazioneAzione.fromData(row));
  }

  /** Enabled actions, for the menu dialog. */
  elencoAttive(): Array<{ id: string; tipo: string }> {
    return this.tutte()
      .filter((azione) => azione.isAttivo())
      .map((azione) => ({ id: azione.id ?? '', tipo: azione.tipo }));
  }

  findAzione(id: string): ConfigurazioneAzione | null {
    return this.tutte().find((azione) => azione.id === id) ?? null;
  }

  /** JobRunnerLib handler: one checkpoint per target, one LOG_JOB row per action. */
  *batchAzioniHandler(
    params: JobHandlerParams & { azioneIds?: string[]; jobId?: string; eseguitoDa?: string }
  ): Generator<AzioniCheckpoint, { success: boolean }, void> {
    const resume = (params.resumeState ?? null) as AzioniResumeState | null;
    this.containerStartedAt = Date.now();
    this.runCount = (resume?.runCount ?? 0) + 1;
    this.priorDurationMs = resume?.totalDurationMs ?? 0;
    this.eseguitoDa = String(
      params.eseguitoDa ?? resume?.eseguitoDa ?? this.deps.activeUser?.getEmail() ?? ''
    );
    this.esecuzioneIniziata = new Date(this.containerStartedAt).toISOString();
    const azioneIds = params.azioneIds ?? resume?.azioneIds ?? [];
    const jobId = String(params.jobId ?? resume?.jobId ?? 'azioni');
    if (azioneIds.length === 0) {
      throw new ConfigurationError('Esecuzione azioni: nessuna azione richiesta');
    }

    let success = true;
    for (let a = resume?.azioneIndex ?? 0; a < azioneIds.length; a++) {
      const azioneId = azioneIds[a]!;
      const ripresa = a === (resume?.azioneIndex ?? -1) ? resume : null;
      const esito = yield* this.eseguiAzione(azioneId, azioneIds, a, jobId, ripresa);
      if (!esito) success = false;
    }
    return { success };
  }

  private *eseguiAzione(
    azioneId: string,
    azioneIds: string[],
    azioneIndex: number,
    jobId: string,
    resume: AzioniResumeState | null
  ): Generator<AzioniCheckpoint, boolean, void> {
    const logger = this.deps.logger;
    let config: ConfigurazioneAzione | null = null;
    try {
      config = this.findAzione(azioneId);
      if (config === null) throw new ConfigurationError(`CONF_AZIONI ${azioneId} non trovata`);
      const cduBase = this.cduBase(azioneId);
      // Whole-action gate: a false (or unevaluable) CONDIZIONE skips the action
      // entirely and, by design, writes no LOG_JOB row at all.
      if (
        config.condizione.trim() !== '' &&
        !this.deps.expressionEngine.evaluateBoolean(
          config.condizione,
          cduBase as unknown as Record<string, unknown>
        )
      ) {
        logger?.info(`Azione ${azioneId} saltata: CONDIZIONE falsa`);
        return true;
      }
      const azioniRaw = config.getAzioniRaw();
      if (azioniRaw === null) {
        logger?.info(`Azione ${azioneId}: nessuna azione elementare configurata`);
        return true;
      }

      const targets = resume === null ? this.targetsPerAsse(config) : resume.targets;
      const processed = resume === null ? [] : resume.processed.slice();
      const errori = resume === null ? [] : resume.errori.slice();
      if (resume !== null && this.runCount >= 2) {
        this.backfillSospesoTempo(jobId, config, targets.length, resume);
      }
      logger?.logBatchStart(targets.length);

      for (let i = resume?.nextIndex ?? 0; i < targets.length; i++) {
        const target = targets[i]!;
        logger?.logItemStart(i + 1, targets.length, 'Target', target.id, 'DOCUMENT');
        try {
          const cdu = this.deps.contextBuilder.build(
            {
              ...target.params,
              now: this.deps.now,
              configurazioneId: azioneId,
              esecuzioneId: jobId,
              tipoOperazione: 'ESECUZIONE_AZIONE'
            },
            recipe(target.recipe)
          );
          eseguiAzioni({
            azioni: azioniRaw,
            cdu: cdu as unknown as Record<string, unknown>,
            db: this.deps.db,
            templates: this.deps.templates,
            now: this.deps.now,
            logger: logger ?? new LoggerService(),
            handlers: creaHandlersInfra({
              db: this.deps.db,
              drive: this.deps.drive,
              roles: this.deps.roles,
              cdu,
              storico: this.deps.storico,
              validator: this.deps.validator,
              logger: logger ?? new LoggerService()
            })
          });
          // Actions write through the same IDatabase seam the pipelines use;
          // outside a pipeline transaction nothing commits them, so persist per target.
          this.deps.db.save();
        } catch (e) {
          const reason = e instanceof Error ? e.message : String(e);
          errori.push(`${target.id}: ${reason}`);
          logger?.warn(`Azione ${azioneId} — target ${target.id} fallito: ${reason}`);
        }
        processed.push(target.id);
        yield {
          azioneIds,
          azioneIndex,
          jobId,
          percentage: ((i + 1) / targets.length) * 100,
          nextIndex: i + 1,
          targets,
          processed: processed.slice(),
          errori: errori.slice(),
          runCount: this.runCount,
          totalDurationMs: this.elapsedTotalMs(),
          eseguitoDa: this.eseguitoDa,
          esecuzioneIniziata: this.esecuzioneIniziata
        };
      }

      const success = errori.length === 0;
      logger?.logJobReport({
        jobType: JOB_LABEL_ESECUZIONE_AZIONI,
        runCount: this.runCount,
        totalDurationMs: this.elapsedTotalMs(),
        totale: targets.length,
        falliti: errori.length,
        dettagliFalliti: errori
      });
      this.deps.logJob?.append({
        idJob: jobId,
        esecuzione: this.runCount - 1,
        tipo: JOB_TYPE_ESECUZIONE_AZIONI,
        idConfig: azioneId,
        nomeConfig: config.tipo,
        stato: success ? StatoJob.COMPLETATO : StatoJob.COMPLETATO_CON_ERRORI,
        totaleTask: targets.length,
        completatiOk: processed.length - errori.length,
        falliti: errori.length,
        listaFallimenti: errori,
        durataSec: Math.max(0, (Date.now() - this.containerStartedAt) / 1000),
        inizio: this.esecuzioneIniziata,
        fine: new Date().toISOString(),
        eseguitoDa: this.eseguitoDa
      });
      return success;
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.deps.logJob?.append({
        idJob: jobId,
        esecuzione: this.runCount - 1,
        tipo: JOB_TYPE_ESECUZIONE_AZIONI,
        idConfig: azioneId,
        nomeConfig: config?.tipo ?? '',
        stato: StatoJob.FALLITO,
        totaleTask: 0,
        completatiOk: 0,
        falliti: 0,
        listaFallimenti: [reason],
        durataSec: Math.max(0, (Date.now() - this.containerStartedAt) / 1000),
        inizio: this.esecuzioneIniziata,
        fine: new Date().toISOString(),
        eseguitoDa: this.eseguitoDa
      });
      throw error;
    }
  }

  /** Institute-level CDU used for the CONDIZIONE gate and for ASSE=SINGOLA. */
  private cduBase(azioneId: string): Cdu {
    return this.deps.contextBuilder.build(
      {
        target: '',
        tipoTarget: 'classe',
        now: this.deps.now,
        configurazioneId: azioneId,
        esecuzioneId: '',
        tipoOperazione: 'ESECUZIONE_AZIONE'
      },
      recipe('AZIONE_SINGOLA')
    );
  }

  /**
   * Backfills the SOSPESO_TEMPO row for the execution JobRunnerLib cut off: the
   * generator never gets to log at the actual timeout, so this runs once, at the
   * start of the resume that picks the job back up.
   */
  private backfillSospesoTempo(
    jobId: string,
    config: ConfigurazioneAzione,
    totale: number,
    resume: AzioniResumeState
  ): void {
    if (resume.esecuzioneIniziata === undefined) return;
    const fine = new Date().toISOString();
    this.deps.logJob?.append({
      idJob: jobId,
      esecuzione: this.runCount - 2,
      tipo: JOB_TYPE_ESECUZIONE_AZIONI,
      idConfig: config.id ?? '',
      nomeConfig: config.tipo,
      stato: StatoJob.SOSPESO_TEMPO,
      totaleTask: totale,
      completatiOk: Math.max(0, resume.processed.length - resume.errori.length),
      falliti: resume.errori.length,
      listaFallimenti: resume.errori,
      durataSec: Math.max(0, (Date.parse(fine) - Date.parse(resume.esecuzioneIniziata)) / 1000),
      inizio: resume.esecuzioneIniziata,
      fine,
      eseguitoDa: resume.eseguitoDa ?? ''
    });
  }

  /**
   * Targets of the action's ASSE. CONF_AZIONI carries no GESTIONE_ARTICOLAZIONE
   * column, so class enumeration always uses COMPLETA (every active class, the
   * parent of an articulated pair included).
   */
  private targetsPerAsse(config: ConfigurazioneAzione): AzioneTarget[] {
    const { classi, alunni, dipartimenti, teachingAssignments, now } = this.deps;
    const gestione = GestioneArticolazione.COMPLETA;
    switch (config.asse) {
      case ASSE_SINGOLA:
        return [
          {
            id: config.id ?? 'SINGOLA',
            recipe: 'AZIONE_SINGOLA',
            params: { target: '', tipoTarget: 'classe' }
          }
        ];
      case GeneratoreAxis.CLASSE:
        return targetsClasse(classi, gestione).map((classe) => ({
          id: classe.id ?? '',
          recipe: 'CLASSE_COMPLETA',
          params: { target: classe.id ?? '', tipoTarget: 'classe' }
        }));
      case GeneratoreAxis.ALUNNO:
        return targetsAlunni(alunni).map((target) => ({
          id: target.email,
          recipe: 'ALUNNO_COMPLETO',
          params: { target: target.email, tipoTarget: 'alunno' }
        }));
      case GeneratoreAxis.PIANO_PERSONALIZZATO:
        return targetsPiani(alunni).map((target) => ({
          id: `${target.studente}:${target.tipo}`,
          recipe: 'PIANO_PERSONALIZZATO',
          params: { target: target.studente, tipoTarget: 'alunno', pianoTipo: target.tipo }
        }));
      case GeneratoreAxis.DIPARTIMENTO:
        return targetsDipartimenti(dipartimenti).map((id) => ({
          id,
          recipe: 'DIPARTIMENTO_COMPLETO',
          params: { target: id, tipoTarget: 'dipartimento' }
        }));
      case GeneratoreAxis.CLASSE_MATERIA:
        return targetsClasseMateria(classi, teachingAssignments, now, gestione).map((target) => ({
          id: `${target.classe}:${target.materiaId}`,
          recipe: 'CLASSE_MATERIA',
          params: { target: target.classe, tipoTarget: 'classe', materiaCorrente: target.materiaId }
        }));
      case GeneratoreAxis.CLASSE_DOCENTE:
        return targetsClasseDocente(classi, teachingAssignments, now, gestione).map((target) => ({
          id: `${target.classe}:${target.docenteEmail}`,
          recipe: 'CLASSE_DOCENTE',
          params: {
            target: target.classe,
            tipoTarget: 'classe',
            docenteCorrente: target.docenteEmail
          }
        }));
      case GeneratoreAxis.CLASSE_DOCENTE_MATERIA:
        return targetsClasseDocenteMateria(classi, teachingAssignments, now, gestione).map(
          (target) => ({
            id: `${target.classe}:${target.materiaId}:${target.docenteEmail}`,
            recipe: 'CLASSE_DOCENTE_MATERIA',
            params: {
              target: target.classe,
              tipoTarget: 'classe',
              docenteCorrente: target.docenteEmail,
              materiaCorrente: target.materiaId
            }
          })
        );
      case GeneratoreAxis.DOCENTE:
        return targetsDocenti(classi, teachingAssignments, now, gestione).map((target) => ({
          id: target.docenteEmail,
          recipe: 'DOCENTE_AGGREGATO',
          params: {
            target: target.docenteEmail,
            tipoTarget: 'docente',
            docenteCorrente: target.docenteEmail,
            classiCompetenza: target.classiCompetenza
          }
        }));
      default:
        // Unreachable via the entity (its constructor validates ASSE), kept so a
        // future axis added to the dictionary fails loudly here instead of running zero targets.
        throw new ConfigurationError(
          `CONF_AZIONI ${config.id ?? '?'}: ASSE non gestito: ${config.asse}`
        );
    }
  }

  /** JobRunnerLib registry callback (passed to run/resume). */
  registerJobHandlers(queue: JobQueueLike): void {
    queue.registerJobHandler(JOB_TYPE_ESECUZIONE_AZIONI, (params) =>
      this.batchAzioniHandler(params)
    );
  }

  /** Starts the batch through JobRunnerLib (state + resume triggers managed by the library). */
  start(
    runner: JobRunnerService,
    jobName: string,
    azioneIds: string[],
    forceRestart = false,
    maxDurationMs?: number
  ): unknown {
    return runner.run(
      jobName,
      JOB_TYPE_ESECUZIONE_AZIONI,
      { azioneIds, jobId: jobName, eseguitoDa: this.deps.activeUser?.getEmail() ?? '' },
      (queue) => this.registerJobHandlers(queue),
      forceRestart,
      maxDurationMs
    );
  }
}
```

- [ ] **Step 5: Run the service tests to verify they pass**

Run: `npx jest --config jest.config.cjs test/unit/application/action-batch-service.test.ts`
Expected: PASS (9 tests). If the `ContextEngineFactory.create` stub arguments in the test don't satisfy the real factory, replace the factory call with `new ContextBuilder()` plus the minimum provider registration the recipe needs — the assertions are about iteration, gating, LOG_JOB and resume, not about CDU content.

- [ ] **Step 6: Run the full gate**

Run: `npm run typecheck && npm run lint && npm test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/application/services/ActionBatchService.ts src/application/context-engine/Recipe.ts src/application/context-engine/Cdu.ts src/application/context-engine/ContextBuilder.ts test/unit/application/action-batch-service.test.ts
git commit -m "feat(azioni): add ActionBatchService (ESECUZIONE_AZIONI job)"
```

---

### Task 7: Wiring — container, launchers, menu, entrypoints

**Files:**

- Modify: `src/config/Bootstrap.ts`
- Modify: `src/presentation/Menu.ts`
- Modify: `src/index.ts`
- Modify: `src/entrypoints/EntryPoints_Menu.ts`
- Modify: `src/entrypoints/EntryPoints_User.ts`
- Test: `test/unit/presentation/menu.test.ts`
- Test: `test/unit/config/bootstrap.test.ts`
- Test: `test/unit/index.test.ts`

**Interfaces:**

- Consumes: `ActionBatchService`, `JOB_TYPE_ESECUZIONE_AZIONI` (Task 6).
- Produces:
  - container key `'actionBatchService'`
  - `export function avviaAzioniDataDriven(c: ServiceContainer, azioneIds: string[], runner: JobRunnerService, maxDurationMs?: number): unknown`
  - `export function elencoAzioniAttive(c: ServiceContainer): Array<{ id: string; tipo: string }>`
  - `export function menuEsecuzioneAzioni(ui: IUiFacade, attive: Array<{ id: string; tipo: string }>, avvia: (azioneIds: string[]) => void): void`
  - globals: `avviaAzioniDataDriven`, `elencoAzioniAttive`, `menuEsecuzioneAzioni`, `menu_esecuzioneAzioni`, `avviaAzione`, `avviaTutteAzioni`
  - menu entry `{ etichetta: 'ESEGUI AZIONI', funzione: 'menu_esecuzioneAzioni' }`

- [ ] **Step 1: Write the failing menu test**

Append to `test/unit/presentation/menu.test.ts`:

```ts
import { menuEsecuzioneAzioni, PAROLA_TUTTE } from '../../../src/presentation/Menu';

test('costruisciMenu exposes the ESEGUI AZIONI launcher', () => {
  const ui = new FakeUiFacade();
  costruisciMenu(ui);
  expect(ui.menus[0]!.voci.map((v) => v.funzione)).toContain('menu_esecuzioneAzioni');
});

test('menuEsecuzioneAzioni lists the active actions and delegates the chosen id', () => {
  const ui = new FakeUiFacade();
  ui.risposteInput.push('SANIFICA_TRIM');
  const avviati: string[][] = [];
  menuEsecuzioneAzioni(ui, [{ id: 'SANIFICA_TRIM', tipo: 'MANUTENZIONE' }], (ids) =>
    avviati.push(ids)
  );
  expect(avviati).toEqual([['SANIFICA_TRIM']]);
  expect(ui.sidebars).toEqual([
    { jobId: 'azioni_SANIFICA_TRIM', titolo: 'Monitoraggio — ESEGUI AZIONI' }
  ]);
});

test('menuEsecuzioneAzioni runs every active action when TUTTE is typed', () => {
  const ui = new FakeUiFacade();
  ui.risposteInput.push(PAROLA_TUTTE);
  const avviati: string[][] = [];
  menuEsecuzioneAzioni(
    ui,
    [
      { id: 'A', tipo: 'T' },
      { id: 'B', tipo: 'T' }
    ],
    (ids) => avviati.push(ids)
  );
  expect(avviati).toEqual([['A', 'B']]);
});

test('menuEsecuzioneAzioni refuses an unknown id without delegating', () => {
  const ui = new FakeUiFacade();
  ui.risposteInput.push('NON_ESISTE');
  const avviati: string[][] = [];
  menuEsecuzioneAzioni(ui, [{ id: 'A', tipo: 'T' }], (ids) => avviati.push(ids));
  expect(avviati).toEqual([]);
  expect(ui.messaggi[0]!.messaggio).toContain('NON_ESISTE');
});

test('menuEsecuzioneAzioni reports when there is nothing to run', () => {
  const ui = new FakeUiFacade();
  const avviati: string[][] = [];
  menuEsecuzioneAzioni(ui, [], (ids) => avviati.push(ids));
  expect(avviati).toEqual([]);
  expect(ui.messaggi[0]!.messaggio).toContain('nessuna azione');
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest --config jest.config.cjs test/unit/presentation/menu.test.ts`
Expected: FAIL — `menuEsecuzioneAzioni` is not exported.

- [ ] **Step 3: Add the menu entry and wrapper**

In `src/presentation/Menu.ts`, add the voice to `vociMenu()` (after `menu_bloccaDocumenti`):

```ts
    { etichetta: 'ESEGUI AZIONI', funzione: 'menu_esecuzioneAzioni' }
```

and append:

```ts
export const PAROLA_TUTTE = 'TUTTE';

/**
 * Wrapper for the CONF_AZIONI launcher (15 §4 variant): the prompt lists the
 * enabled actions and accepts either one ID or TUTTE. Still logic-free — the
 * list and the launcher closure are both supplied by the caller.
 */
export function menuEsecuzioneAzioni(
  ui: IUiFacade,
  attive: Array<{ id: string; tipo: string }>,
  avvia: (azioneIds: string[]) => void
): void {
  const titolo = 'ESEGUI AZIONI';
  if (attive.length === 0) {
    ui.mostraMessaggio(titolo, 'Operazione annullata: nessuna azione attiva in CONF_AZIONI.');
    return;
  }
  const elenco = attive.map((a) => `• ${a.id} (${a.tipo})`).join('\n');
  const scelta = ui.chiediInput(
    titolo,
    `Azioni attive:\n${elenco}\n\nScrivi un ID, oppure ${PAROLA_TUTTE} per eseguirle tutte.`
  );
  if (scelta === '') {
    ui.mostraMessaggio(titolo, 'Operazione annullata: nessuna azione selezionata.');
    return;
  }
  const tutte = scelta.toUpperCase() === PAROLA_TUTTE;
  if (!tutte && !attive.some((a) => a.id === scelta)) {
    ui.mostraMessaggio(titolo, `Azione "${scelta}" non trovata tra quelle attive.`);
    return;
  }
  const ids = tutte ? attive.map((a) => a.id) : [scelta];
  ui.mostraSidebarMonitoraggio(
    `azioni_${tutte ? PAROLA_TUTTE : scelta}`,
    `Monitoraggio — ${titolo}`
  );
  try {
    avvia(ids);
  } catch (e) {
    ui.mostraMessaggio(titolo, `Errore: ${e instanceof Error ? e.message : String(e)}`);
  }
}
```

- [ ] **Step 4: Run the menu test to verify it passes**

Run: `npx jest --config jest.config.cjs test/unit/presentation/menu.test.ts`
Expected: PASS. Note the existing "five launchers" test now expects six entries — update its expected array to include `'menu_esecuzioneAzioni'` and retitle it to "the six launchers".

- [ ] **Step 5: Register the service and the launchers in Bootstrap**

In `src/config/Bootstrap.ts`, add the import:

```ts
import { ActionBatchService } from '../application/services/ActionBatchService';
```

register the service next to `lockDocumentsService`:

```ts
c.register(
  'actionBatchService',
  (container) =>
    new ActionBatchService({
      db: deps.db,
      contextBuilder: container.get<ContextBuilder>('contextBuilder'),
      expressionEngine: deps.expressionEngine,
      templates: deps.templates,
      drive: deps.drive,
      roles: container.get<RisolutoreRuoliService>('risolutoreRuoli'),
      classi: container.get<ClasseRepository>('classi'),
      alunni: container.get<AlunnoRepository>('alunni'),
      dipartimenti: container.get<DipartimentoRepository>('dipartimenti'),
      teachingAssignments: container.get<ITeachingAssignmentResolver>('teachingAssignmentResolver'),
      now: deps.now,
      storico: container.get<StoricoDocumentiService>('storicoDocumenti'),
      // VALIDA_DB is unavailable off-GAS for the same reason as the menu
      // validation launcher: no SpreadsheetService, no report sheet.
      ...(c.has('databaseValidationService')
        ? { validator: container.get<DatabaseValidationService>('databaseValidationService') }
        : {}),
      logger,
      logJob: container.get<LogJobRepository>('logJob'),
      activeUser
    })
);
```

add the launchers next to the other data-driven launchers:

```ts
/** Data-driven launcher (15 §4): standalone azioni for one or more CONF_AZIONI ids. */
export function avviaAzioniDataDriven(
  c: ServiceContainer,
  azioneIds: string[],
  runner: JobRunnerService,
  maxDurationMs?: number
): unknown {
  const service = c.get<ActionBatchService>('actionBatchService');
  for (const id of azioneIds) {
    const azione = service.findAzione(id);
    if (azione === null) throw new ConfigurationError(`CONF_AZIONI ${id} non trovata`);
    if (!azione.isAttivo()) throw new ConfigurationError(`CONF_AZIONI ${id} non è attiva`);
  }
  const jobName = azioneIds.length === 1 ? `azioni_${azioneIds[0]!}` : 'azioni_TUTTE';
  return service.start(runner, jobName, azioneIds, false, maxDurationMs);
}

/** The enabled CONF_AZIONI rows, for the menu dialog and the user entrypoints. */
export function elencoAzioniAttive(c: ServiceContainer): Array<{ id: string; tipo: string }> {
  return c.get<ActionBatchService>('actionBatchService').elencoAttive();
}
```

and register the handler in `riprendiJobSospeso`:

```ts
const azioni = c.get<ActionBatchService>('actionBatchService');
```

```ts
azioni.registerJobHandlers(queue);
```

- [ ] **Step 6: Expose the globals**

In `src/index.ts`, add to the Bootstrap import list `avviaAzioniDataDriven, elencoAzioniAttive`, to the Menu import list `menuEsecuzioneAzioni`, and add:

```ts
(globalThis as any).avviaAzioniDataDriven = avviaAzioniDataDriven;
(globalThis as any).elencoAzioniAttive = elencoAzioniAttive;
(globalThis as any).menuEsecuzioneAzioni = menuEsecuzioneAzioni;
```

In `src/entrypoints/EntryPoints_Menu.ts`, add the ambient declarations and the handler:

```ts
declare function menuEsecuzioneAzioni(
  ui: unknown,
  attive: Array<{ id: string; tipo: string }>,
  avvia: (azioneIds: string[]) => void
): void;
declare function elencoAzioniAttive(container: unknown): Array<{ id: string; tipo: string }>;
declare function avviaAzioniDataDriven(
  container: unknown,
  azioneIds: string[],
  runner: JobRunnerService,
  maxDurationMs?: number
): unknown;
```

```ts
/** Lists the active CONF_AZIONI rows and runs the chosen one (or all of them). */
function menu_esecuzioneAzioni(): void {
  const container = initAldo();
  menuEsecuzioneAzioni(new GasUiFacade(), elencoAzioniAttive(container), (azioneIds) =>
    avviaAzioniDataDriven(
      container,
      azioneIds,
      creaJobRunner(),
      (globalThis as { MAX_JOB_EXECUTION_TIME_MS?: number }).MAX_JOB_EXECUTION_TIME_MS
    )
  );
}
```

```ts
(globalThis as any).menu_esecuzioneAzioni = menu_esecuzioneAzioni;
```

In `src/entrypoints/EntryPoints_User.ts`, add the ambient declarations plus a new section:

```ts
declare function elencoAzioniAttive(container: unknown): Array<{ id: string; tipo: string }>;
declare function avviaAzioniDataDriven(
  container: unknown,
  azioneIds: string[],
  runner: unknown,
  maxDurationMs?: number
): unknown;
declare function creaJobRunner(): unknown;
```

```ts
// ── AZIONI ───────────────────────────────────────────────────────────

/** UI-free launch of one CONF_AZIONI action by id. Future scheduled triggers point here. */
function avviaAzione(id: string): void {
  avviaAzioniDataDriven(initAldo(), [id], creaJobRunner());
}

/** UI-free launch of every enabled CONF_AZIONI action. */
function avviaTutteAzioni(): void {
  const container = initAldo();
  const ids = elencoAzioniAttive(container).map((azione) => azione.id);
  if (ids.length === 0) {
    Logger.log('Esecuzione azioni: nessuna azione attiva in CONF_AZIONI.');
    return;
  }
  avviaAzioniDataDriven(container, ids, creaJobRunner());
}
```

```ts
// ── AZIONI
(globalThis as any).avviaAzione = avviaAzione;
(globalThis as any).avviaTutteAzioni = avviaTutteAzioni;
```

- [ ] **Step 7: Write the wiring assertions**

Append to `test/unit/config/bootstrap.test.ts` (adapting `buildAldoContainer`'s dep object to whatever helper the file already uses):

```ts
test('registers actionBatchService and resolves it', () => {
  const c = buildTestContainer();
  expect(c.has('actionBatchService')).toBe(true);
  expect(c.get('actionBatchService')).toBeDefined();
});

test('avviaAzioniDataDriven refuses an unknown or disabled CONF_AZIONI id', () => {
  const c = buildTestContainer();
  const runner = { run: jest.fn() } as unknown as JobRunnerService;
  expect(() => avviaAzioniDataDriven(c, ['NON_ESISTE'], runner)).toThrow(ConfigurationError);
  expect(runner.run).not.toHaveBeenCalled();
});

test('riprendiJobSospeso registers the ESECUZIONE_AZIONI handler', () => {
  const c = buildTestContainer();
  const registered: string[] = [];
  const runner = {
    resume: (
      _name: string,
      register: (queue: { registerJobHandler: (t: string) => void }) => void
    ) => {
      register({ registerJobHandler: (t: string) => registered.push(t) });
    }
  } as unknown as JobRunnerService;
  riprendiJobSospeso(c, runner);
  expect(registered).toContain(JOB_TYPE_ESECUZIONE_AZIONI);
});
```

Append to `test/unit/index.test.ts` (and add the three new names to the two `jest.mock` factories at the top of the file, otherwise the import throws):

```ts
test('exposes the azioni launchers and menu wrapper as GAS globals', () => {
  const g = globalThis as Record<string, unknown>;
  expect(typeof g['avviaAzioniDataDriven']).toBe('function');
  expect(typeof g['elencoAzioniAttive']).toBe('function');
  expect(typeof g['menuEsecuzioneAzioni']).toBe('function');
});
```

- [ ] **Step 8: Run the affected suites**

Run: `npx jest --config jest.config.cjs test/unit/config/bootstrap.test.ts test/unit/index.test.ts test/unit/presentation/menu.test.ts`
Expected: PASS.

Run: `npm run typecheck && npm run lint && npm test`
Expected: PASS.

- [ ] **Step 9: Verify the readable build still produces valid GAS output**

Run: `npm run build:readable`
Expected: build succeeds; `dist/EntryPoints.js` contains `menu_esecuzioneAzioni`, `avviaAzione` and `avviaTutteAzioni`.

Run: `grep -c "avviaTutteAzioni" dist/EntryPoints.js`
Expected: at least 1. (Do not edit `dist/`; it is generated.)

- [ ] **Step 10: Commit**

```bash
git add src/config/Bootstrap.ts src/presentation/Menu.ts src/index.ts src/entrypoints test/unit/config/bootstrap.test.ts test/unit/index.test.ts test/unit/presentation/menu.test.ts
git commit -m "feat(azioni): wire ActionBatchService into the container, menu and entrypoints"
```

---

### Task 8: Governance documentation

**Files:**

- Modify: `SPECS_ALDO/01_SCHEMA_DATABASE.md`
- Modify: `SPECS_ALDO/00_PANORAMICA.md`

**Interfaces:**

- Consumes: the final shape of `COL_CONF_AZIONI` and the action catalogue from Tasks 2–6.
- Produces: no code.

- [ ] **Step 1: Add the CONF_AZIONI section to the schema spec**

In `SPECS_ALDO/01_SCHEMA_DATABASE.md`, after the `CONF_IMP` section, add a `CONF_AZIONI` section in the same style as the surrounding ones (Italian, uppercase names), documenting:

- PK `ID`; `TIPO` (free category label, written to `LOG_JOB.NOME_CONFIG`); `ASSE` (the `CONF_DOC.GENERATORE` dictionary plus `SINGOLA`); `CONDIZIONE` (same expression engine as `CONF_DOC.CONDIZIONE`, gates the whole action); `ATTIVO` (default `true`); `AZIONI` (JSON array, shared azioni grammar); `PERIODICITA` (reserved for future scheduling, ignored in v1).
- The action-type catalogue: `INSERISCI_TIMESTAMP`, `AGGIORNA_CAMPO`, `AGGIORNA_STATO_DOC`, `AGGIORNA_PERMESSI_STORICI`, `TRASFORMA_CAMPO`, `AGGIORNA_PERMESSI`, `RIDUCI_PERMESSI`, `VALIDA_DB`, with the JSON field of each.
- The note that `POST_PROCESSO` keeps its physical name and shares this grammar.
- Logging: `LOG_JOB` only, `TIPO='ESECUZIONE_AZIONI'`, `ID_CONFIG=CONF_AZIONI.ID`, `NOME_CONFIG=CONF_AZIONI.TIPO`.

- [ ] **Step 2: Mention CONF_AZIONI in the overview**

In `SPECS_ALDO/00_PANORAMICA.md`, add `CONF_AZIONI` wherever the data-driven configuration tables (`CONF_DOC`, `CONF_MAIL`, `CONF_IMP`) are listed, with one sentence: standalone actions (permissions, validation, sanitisation) configured as rows, launched manually from the menu or from `avviaAzione`/`avviaTutteAzioni`.

- [ ] **Step 3: Verify nothing else references the old module name**

Run: `grep -rn "postProcessActions\|executePostProcess\|PostProcessAction\b" src/ test/ SPECS_ALDO/ docs/ --include="*.ts" --include="*.md" | grep -v "docs/superpowers"`
Expected: no matches (the physical `POST_PROCESSO` column name still appears and is correct — only the ALDO identifiers must be gone).

- [ ] **Step 4: Final full gate**

Run: `npm run typecheck && npm run lint && npm test && npm run test:integration && npm run test:build`
Expected: PASS on all four.

- [ ] **Step 5: Commit**

```bash
git add SPECS_ALDO/01_SCHEMA_DATABASE.md SPECS_ALDO/00_PANORAMICA.md
git commit -m "docs(conf-azioni): document the CONF_AZIONI table and the shared azioni grammar"
```
