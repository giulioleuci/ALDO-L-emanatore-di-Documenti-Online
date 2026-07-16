# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this workspace is

This is an **implementation workspace**, not a single codebase. The task is to build **SGSA (Sistema di Gestione Scolastica Automatizzata)** — a modular school-management ERP for Google Workspace, internal codename **ALDO** — by following the specifications in `SPECS_ALDO/` and building on the reusable libraries in `GasLibraryFactory/`.

Two top-level directories:

- **`SPECS_ALDO/`** — The authoritative design spec for SGSA (17 Markdown files, **written in Italian**). This describes the domain, database, and services to be _implemented_. As of now the application itself is largely unimplemented; these documents are the blueprint.
- **`GasLibraryFactory/`** — A mature, self-contained monorepo of 16 Google Apps Script libraries (its own git repo, build, and tests). SGSA _references and extends_ these libraries; it must not reimplement functionality they already provide. This directory has **its own `CLAUDE.md`** with deep detail on the build pipeline, GAS V8 compatibility patches, source maps, and library-debugging workflow — read it before touching library source. You MUST **ONLY** use the docs in `GasLibraryFactory/DOCS_LIBS` and not read the library code if not extremely necessary.

`src/` (this repo's actual application code), `test/`, and the build tooling below are the implementation of SGSA itself, layered on top of those two reference directories.

## GasLibraryFactory-first: the most important constraint

Along with GAS-online compatibility, this is the single most important constraint of the entire project: **`GasLibraryFactory` must always be used wherever possible, and application code must never reimplement logic it already provides.** The long-term goal is not just to build SGSA, but to grow `GasLibraryFactory` into a maximally-reusable monorepo that other projects can build on — every case handled in ALDO with custom code instead of a library extension is coverage `GasLibraryFactory` permanently doesn't gain.

This means, for **every** non-trivial coding choice, before writing implementation code you MUST:

1. **Check `GasLibraryFactory/DOCS_LIBS` first** for existing logic, utilities, facades, or patterns that already solve (or nearly solve) the problem. Do this before designing a solution in `src/`, not after.
2. **If a full match exists**, use it directly — do not wrap, re-derive, or partially copy its logic into ALDO.
3. **If only a partial match exists** (the library covers part of the need, or covers a similar case but not quite this one), **stop and ask the user** whether they want `GasLibraryFactory` extended to cover the new case, rather than defaulting to writing custom logic in `src/`. Do not silently choose the custom-code path.
4. **Only write ALDO-local code** when the user confirms extending the library is out of scope for the case at hand, or the logic is genuinely SGSA-domain-specific (e.g. CDU shape, `CONF_DOC`/`CONF_MAIL` interpretation) and has no place in a general-purpose GAS library.

When in doubt about whether something belongs in the library or in ALDO, ask — don't guess.

## Codebase Analysis via codebase-memory-mcp (MANDATORY)

You have access to the `codebase-memory-mcp` tool, which maintains a compiled Knowledge Graph of this entire ecosystem (powered by tree-sitter and SQLite). **You MUST use this MCP to navigate, query, trace, and review the code** rather than reading raw text files or relying on simple text searches. This prevents context-window bloat, hallucinations, and missed dependencies.

There are two indexed project graphs you can query:
- `"GasLibraryFactory-Only"`: Contains only the library code. Use this to discover reusable functions and extension points.
- `"ALDO-Combined"`: Contains both ALDO and GasLibraryFactory. Use this to map how ALDO consumes the library.

**When working on this codebase, strictly use the MCP tools for the following tasks:**
1. **Bypass Detection:** Use `query_graph` on `ALDO-Combined` to ensure no ALDO module directly calls native Google Apps Script globals (e.g., `SpreadsheetApp`, `DriveApp`, `MailApp` and the advanced API). All such calls MUST route through `GasLibraryFactory`.
2. **Dead Code Analysis:** Use the MCP's built-in tools (or graph queries) to find functions/methods within ALDO that have 0 incoming `[:CALLS]` edges and are not standard GAS triggers (like `doGet`, `onOpen`).
3. **Linkage & Error Checking:** Use `search_graph` and `trace_path` to verify that ALDO's calls to `GasLibraryFactory` match existing functions and exact parameter signatures.
4. **Architecture Review:** Use `get_architecture` to detect circular dependencies between ALDO modules, evaluate module cohesion, and trace long execution chains.

If you need to understand how components interact, *always query the graph first*.

## Sources of truth

When any SGSA spec document conflicts with another, these two win, in order:

1. **`SPECS_ALDO/01_SCHEMA_DATABASE.md`** — physical DB schema. All table and column names are UPPERCASE.
2. **`SPECS_ALDO/02_CDU_STRUTTURA.md`** — canonical structure of the _Contesto Dati Unificato_ (CDU). Every context access path (e.g. `focus.classe.anagrafica.nome`) derives from this.

## Core domain concepts (from the specs)

- **Google Sheets as a relational DB** — each sheet is a table, columns are typed fields, emails are primary/foreign keys. `SheetDBLib` (L2) abstracts persistence into domain objects.
- **CDU (Contesto Dati Unificato)** — before any operation (document generation, email), the system assembles one aggregated context object; templates and email boxes operate only on this serialized context. Built via `ContextEngine`.
- **Role resolution hierarchy** — the active teacher for a class/subject/date is resolved by querying three sources in descending priority: `SUPPLENZE` (1) → `VARIAZIONI_CATTEDRA` (2) → `CLASSI` (3, nominal fallback). See `RoleResolutionLib`.
- **Data-driven, not hard-coded** — document types, Drive templates, destination folders, ACLs, and email patterns live in DB tables (`CONF_DOC`, `CONF_MAIL`). Adding a document type or email pattern means inserting a DB record, not editing code.
- **Long jobs via `JobRunnerLib`** — GAS caps execution at 6/30 min. Batch work is written as generator functions whose state is serialized to `ScriptProperties` at each checkpoint and resumed by a timed trigger.

The domain is Clean Architecture: Presentation → Application Services → Domain (entities, value objects, aggregates, repositories, specifications) → Infrastructure. The Domain layer is agnostic of Google Sheets/Drive/Gmail.

## Repository layout (`src/`)

- `src/domain/` — entities, value objects, specifications, repository interfaces, `DomainError`. No GAS/library imports.
- `src/application/` — use-case services (`services/`), document-generation strategies (`strategies/`, one class per `CONF_DOC` generator type), the CDU assembler (`context-engine/`, with `providers/`, `mappers/`, `interceptors/` subfolders), and data-import orchestration (`import/`).
- `src/infrastructure/` — `facades/` wrap `GasLibraryFactory` library calls and native GAS services behind ALDO-owned interfaces (e.g. `IDriveFacade`, `IGmailFacade`, `ITemplateEngine`); `repositories/` implement the domain repository interfaces over `SheetDbAdapter`; `steps/` and `services/` hold infra-level helpers (e.g. `AlberoCartelle`).
- `src/presentation/Menu.ts` — builds the Sheets UI menu; takes a UI facade, contains no business logic.
- `src/config/` — the composition root: `ServiceContainer.ts` (thin typed wrapper over `CoreUtilsLib.LazyServiceContainer`), `Bootstrap.ts` (`initAldo()` wires every real facade/service/repository), `schema.ts`.
- `src/entrypoints/EntryPoints.ts` — a deliberately separate, human-readable GAS script file. It calls functions like `initAldo`, `avviaGenerazioneDataDriven` as ambient globals (not imports) because GAS shares one global namespace across script files in a project.
- `src/index.ts` — the other half of the entrypoint split: declares/imports the real functions and assigns them onto `globalThis` so GAS can call them by name (`onOpen`, `menu_avvioImportazioni`, `resumeJob`, plus everything `EntryPoints.ts` needs exposed). `onOpen` only builds the menu — it never triggers `initAldo()` eagerly.
- `src/onlinetests/` — a separate webpack entry (`checks/`) of live-GAS smoke tests, built only in `--mode=online`; see Build modes below.

Test tree mirrors `src/` under `test/unit/`; `test/integration/` and `test/build/` are separate Jest projects (see below). `test/fakes/` and `test/fixtures/` hold shared test doubles/data.

## Critical constraints when writing code

- **Target is GAS V8**, not Node. ONLY synchronous code; avoid Node-specific and unsupported browser APIs. Source uses modern TS but is transpiled (Babel → Chrome 80) and patched for GAS by `scripts/build-and-prepare.cjs`.
- **Native GAS service globals** (`DriveApp`, `SpreadsheetApp`, `DocumentApp`, `PropertiesService`, `CacheService`, `UrlFetchApp`, `Utilities`, `Session`, `ScriptApp`, `LockService`, `MailApp`) may only be touched inside **`GoogleApiWrapper` (L2)**. Everything else routes through a wrapper service. This is enforced by ESLint (`no-restricted-globals`); leaks fail `npm run lint`. (Narrow sanctioned exceptions exist — documented in `GasLibraryFactory/CLAUDE.md`.)
- **Never edit `dist/*`** — it is generated. Fix source modules only.
- The library dependency graph is strictly layered (L0→L4) with **no circular dependencies**; keep new code within its layer's allowed dependencies.
- New services/repositories/facades are wired in `src/config/Bootstrap.ts` and resolved through `ServiceContainer`, never constructed ad hoc inside application code.

## Commands

```bash
npm run typecheck          # tsc --noEmit
npm run lint               # eslint .
npm run lint:fix
npm run format              # prettier --write .

npm test                    # unit tests (test/unit/**, jest.config.cjs)
npm run test:integration    # test/integration/**, jest.integration.config.cjs
npm run test:build          # test/build/**, jest.build.config.cjs — validates build output shape

npm run build:testing       # scripts/build-and-prepare.cjs --mode=testing (default)
npm run build:testoffline   # --mode=testoffline
npm run build:production    # --mode=production
npm run build:online        # --mode=online (also runs the offline test suite as a push gate)

npm run push:testing        # build:testing then clasp push
npm run push:online         # build:online then clasp push

npm run refresh:vendor      # scripts/refresh-vendor.cjs — pulls GasLibraryFactory's built bundle into vendor/
npm run verify:vendor       # scripts/verify-vendor.cjs
```

Run a single test file: `npx jest --config jest.config.cjs path/to/File.test.ts` (swap the config for the integration/build variants as needed). Run a single test by name: add `-t "test name"`.

All four jest configs share `test/setup/load-gaslibs.cjs` as a setup file and use `ts-jest` against `tsconfig.eslint.json`.

## Build modes

`scripts/build-and-prepare.cjs --mode=<production|testing|testoffline|online>` bundles `src/` (via webpack) together with the prebuilt `vendor/gaslibs.Code.js` library bundle into `dist/Code.js`, plus `dist/EntryPoints.js` from `src/entrypoints/EntryPoints.ts`. Key differences:

- `testing`/`testoffline`/`production` build only the main webpack entry; `online` additionally builds the `onlinetests` entry into `OnlineTests.js` and applies V8-compat patches to it, then discards it for every other mode.
- `online` mode generates `gas-source-map.json`, mapping minified `Code.js`/`OnlineTests.js` lines back to original TS source, and runs the full offline test suite as a pre-push gate (`push:online` fails if offline tests fail).
- `production` mode minifies via Terser; `testing`/`testoffline` keep readable output for debugging in the Apps Script editor.

`clasp push` excludes `gas-source-map.json` (it's a debugging artifact, not a deployable file).
