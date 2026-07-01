# SGSA / ALDO — Implementation Design

**Date:** 2026-07-01
**Status:** Approved (design phase)
**Scope:** How to implement SGSA (codename ALDO) in TypeScript on Google Apps Script V8, building on the vendored `GasLibraryFactory` libraries.

Authoritative sources (precedence): `SPECS_ALDO/01_SCHEMA_DATABASE.md`, then `SPECS_ALDO/02_CDU_STRUTTURA.md`. Navigation index: `SPECS_ALDO/00_PANORAMICA.md`.

---

## 1. Decisions locked

| # | Decision | Choice |
|---|----------|--------|
| D1 | Library linking | **Vendor + single bundle** (no GAS library references) |
| D2 | TypeScript strictness | **Max strict** |
| D3 | Plan scope | **Full phased roadmap** + one fully-detailed vertical slice |
| D4 | Vendoring mechanism | **Prelude concatenation** (see §2) |
| D5 | Vertical slice | **Verbale del Consiglio di Classe** for one class (see §9) |

---

## 2. Vendoring model — prelude concatenation

The 16 GasLibraryFactory libraries are JS/ESM source in their own monorepo and expose every public class as a **runtime global** (`src/index.js` does `Object.assign(global, Lib)`). ALDO is max-strict TypeScript. To marry the two without pulling JS-ESM source into ALDO's TypeScript webpack build:

1. **Build the libraries once** in the monorepo (`npm run build:testing` → readable `dist/Code.js`) and **vendor that artifact** into ALDO at `vendor/gaslibs.Code.js`, pinned by `vendor/VERSION` and `vendor/CHECKSUM` (sha256).
2. **ALDO's webpack** bundles **only ALDO's own TypeScript** → `dist/aldo.js`.
3. The adapted **`build-and-prepare.cjs`** concatenates `vendor prelude + '\n' + dist/aldo.js` → a single `dist/Code.js`, then applies the V8 compatibility patches over the **whole** file.
4. ALDO references library classes as **globals** (no runtime import), typed at compile time by **hand-written ambient `.d.ts`** in `types/gaslibs/`, one file per library, authored from `GasLibraryFactory/DOCS_LIBS/*_docs.md`.

Rationale: keeps ALDO's TypeScript build clean and fast, avoids re-running the libraries' own V8 patches, gives full compile-time typing over a JS runtime, and produces exactly one deployable `Code.js` (D1).

**Vendor refresh procedure:** rebuild the monorepo, copy its `dist/Code.js` to `vendor/gaslibs.Code.js`, update `VERSION` + `CHECKSUM`, re-run ALDO's full test + build gate. A checksum mismatch fails the build (§6, Step 0).

---

## 3. Repository layout

```
ALDO/  (its own git repo)
  src/
    domain/
      entities/        Alunno.ts, Docente.ts, Classe.ts, ...        # 04
      value-objects/   Email.ts, ClasseId.ts, AnnoCorso.ts, ...     # 03
      repositories/    (interfaces) AlunnoRepository.ts, ...        # 06
      specifications/  AlunniAttiviSpec.ts, ...                     # 07
    application/
      services/        DocumentGenerationService.ts, ...           # 12
      providers/       ClasseProvider.ts, StudentiProvider.ts, ... # 09
      interceptors/    SwapAndEnrichInterceptor.ts                 # 09
    infrastructure/
      facades/         DriveServiceFacade.ts, GmailServiceFacade.ts, DocumentServiceFacade.ts  # 08 §3.4
      pipelines/       DocumentoPipeline.ts, NotificaPipeline.ts   # 10, 11
      steps/           (document steps), (email steps)             # 10, 11
    config/            ServiceContainer.ts, Bootstrap.ts           # 08 §2
    ui/                Menu.ts, Dialogs.ts                         # 15
    index.ts           # entry point: flattens ALDO entry fns onto global for GAS
  types/gaslibs/       *.d.ts  (ambient decls for each vendored lib global)
  vendor/              gaslibs.Code.js, VERSION, CHECKSUM
  test/
    unit/              mirrors src/, pure, libs mocked
    integration/       service + pipeline against in-memory fakes
    fixtures/          typed rows matching 01_SCHEMA_DATABASE.md
  scripts/             build-and-prepare.cjs (adapted), verify-vendor.cjs
  tsconfig.json  eslint.config.js  webpack.config.cjs
  jest.config.cjs  jest.integration.config.cjs
  appsscript.json  package.json
```

The `/src` tree mirrors the structure prescribed in `08_ARCHITETTURA_DI_PATTERN.md §4`.

---

## 4. Toolchain (Phase 0)

- **TypeScript, max strict.** `tsconfig.json` flags: `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, `noImplicitReturns`, `noFallthroughCasesInSwitch`, `noUnusedLocals`, `noUnusedParameters`, `isolatedModules`, `verbatimModuleSyntax`, `forceConsistentCasingInFileNames`. `target: ES2019`, `module: ESNext` (webpack + Babel lower to Chrome 80, matching the monorepo's `babel.config.cjs`).
- **`@types/google-apps-script`** provides native service typings. Those types may only be *named* inside `src/infrastructure/facades/**`.
- **Ambient library types** in `types/gaslibs/` — one `.d.ts` per library, declaring each exported class as a global `declare class` / `declare namespace`, authored from `DOCS_LIBS/*_docs.md`. These are the compile-time contract for the vendored runtime globals.
- Node ≥ 18, npm ≥ 9 (matches monorepo `engines`).

---

## 5. Lint rules — authored FIRST, before any feature code

ESLint flat config (`eslint.config.js`), building on the monorepo's config, adding ALDO-specific hard gates. These land in Phase 0 and gate every later phase.

- **`no-restricted-globals`** for all native GAS globals — `DriveApp`, `SpreadsheetApp`, `DocumentApp`, `MailApp`, `GmailApp`, `PropertiesService`, `CacheService`, `UrlFetchApp`, `Utilities`, `Session`, `ScriptApp`, `LockService` — **allowed only under `src/infrastructure/facades/**`** (ALDO's Facade layer, `08 §3.4`). Any other file that touches a native global fails lint. This mirrors the monorepo's `GoogleApiWrapper`-only rule, adapted to ALDO's facade boundary.
- **Layer boundary rule** (`no-restricted-imports` + import path guards): `src/domain/**` must not import from `application/**`, `infrastructure/**`, `config/**`, `ui/**`, nor reference any library global — enforcing `08 §1` (Domain layer is infrastructure-agnostic). Each layer may depend only on the one immediately below it.
- **Typed exceptions only:** ban `throw new Error(...)` outside a narrow allowlist; require the libraries' specialized exceptions (`ValidationException`, `QuotaExceededException`, …) per `LIBRERIE_GESTIONE.md` golden rule #6.
- `@typescript-eslint` **recommended-type-checked**, `eslint-plugin-prettier`, `eslint-config-prettier`, `eslint-plugin-jest` for test files.
- **CI ordering:** `npm run lint` must be clean before the test job runs.

---

## 6. Build + V8 conversion script

Adapted from the proven `GasLibraryFactory/scripts/build-and-prepare.cjs`. **Retain all** of its behaviour: the V8 patches (`Object.hasOwn` → `hasOwnProperty.call`; `.replaceAll(lit, …)` → `.split().join()`; es-toolkit `CASE_SPLIT_PATTERN` fallback; Zod emoji regex fallback; `new URL()` shim), the ES2021+ compatibility **scanner** (warns on `structuredClone`, `.at()`, `findLast`, logical-assignment, etc.), the **6 MB file-size guard**, `.claspignore` generation, and `source-map-index.json`. Additions:

- **Step 0 — vendor verify:** compute sha256 of `vendor/gaslibs.Code.js`; fail if it ≠ `vendor/CHECKSUM`.
- **Step 2b — prelude concat:** after ALDO's webpack build, set `Code.js = vendor/gaslibs.Code.js + '\n' + dist/aldo.js` **before** patching, so the V8 patches and the size guard cover the vendored prelude as well.
- **Modes preserved:** `production | testing | testoffline`. In `testoffline` the script runs the Jest **unit + integration** suites and **exits non-zero on any failure** — this is the machine-enforced "don't continue until tests pass" gate.

`package.json` scripts mirror the monorepo: `build:production`, `build:testing`, `build:testoffline`, `lint`, `test`, `test:integration`, `push:*`.

---

## 7. Testing strategy — unit AND integration, TDD-gated

- **Unit tests** (`ts-jest`, run on TS source, `jest.config.cjs`): pure domain — Value Objects and Enums (`03`), entities and role logic (`04`), aggregate invariants incl. classi articolate (`05`), Specifications and their `toQueryObject()` (`07`), and each pipeline step / generator Strategy in isolation with libraries mocked.
- **Integration tests** (`jest.integration.config.cjs`): full service + pipeline wiring against **in-memory fakes** of the three Facades (Drive / Gmail / Document) and a fake `SheetDB` seeded from fixture tables, exercising the **real** `ServiceContainer`/`Bootstrap`, the **real** `ContextBuilder` → CDU, and the **real** `DocumentoPipeline`. Assertions verify that CDU access paths exactly match `02_CDU_STRUTTURA.md` and that written columns match `01_SCHEMA_DATABASE.md`.
- **Fixtures** (`test/fixtures/`): typed rows whose keys are the UPPERCASE column names from `01`, serving as the single source of fake data for both suites.
- **Online tests** (`GasOnlineTestFramework`): deferred to a later phase as real-GAS smoke tests over the built bundle.
- **Gate:** every phase's exit criterion includes "all unit + integration green"; `build:testoffline` enforces it in the build itself.

---

## 8. Phased roadmap (each phase cites its authoritative specs)

| Phase | Deliverable | Primary specs |
|---|---|---|
| **0** | Toolchain: `tsconfig`, ESLint gates (§5), webpack, adapted build script (§6), Jest configs, ambient lib `.d.ts` (§4), vendor pipeline (§2), CI | `GasLibraryFactory/CLAUDE.md`, `DOCS_LIBS/*` |
| **1** | Schema constants (table/column name types) + Value Objects + Enums | `01`, `03`, `MAT_NON_STANDARD` |
| **2** | Entities, role logic, aggregates + invariants (incl. classi articolate) | `04`, `05` |
| **3** | 21 Repositories + 64+ Specifications | `06`, `07` |
| **4** | `ServiceContainer`/`Bootstrap`, ContextEngine (Providers, Interceptors, Recipes) → CDU; Role resolution | `08`, `09`, `14`, `02` |
| **5** | Document pipeline (10 steps + 6 Strategies) & Email pipeline (8 steps + Box system) | `10`, `11` |
| **6** | Application services, historical & utility services, UI menu + JobRunner monitoring | `12`, `13`, `14`, `15` |

The vertical slice (§9) is built incrementally across Phases 1→5 as the first exercise of each layer, so the architecture is proven end-to-end before breadth work begins.

---

## 9. Vertical slice (proof-of-architecture)

**Goal: generate a *Verbale del Consiglio di Classe* for one class.** Thin but complete, touching every layer:

`CLASSI` / `DOCENTI` / `MATERIE` subset (`01`)
→ Value Objects `Email`, `ClasseId`, `AnnoCorso` (`03`)
→ `Classe` / `Docente` entities + `ConsiglioDiClasse` aggregate (`04`, `05`)
→ `ClasseRepository` + `AlunniAttiviSpec` (`06`, `07`)
→ `ContextBuilder` recipe producing `focus.classe.*` per `02`
→ `DocumentoPipeline` — all 10 steps (`10`) — with `VerbaleGeneratorStrategy` selected via `CONF_DOC.GENERATORE = VERBALE_CDC`
→ `DriveServiceFacade` / `DocumentServiceFacade` over `GoogleApiWrapper`.

Coverage: unit tests per unit, plus one integration test asserting the entire chain against in-memory fakes. This slice validates the vendoring model (§2), the layer boundaries (§5), the build (§6), and the test harness (§7) before the roadmap widens.

---

## 10. Definition of done (per phase)

- `npm run lint` clean (no native-global leaks outside `facades/`, no cross-layer imports).
- `tsc --noEmit` clean under max-strict.
- Unit + integration suites green.
- `npm run build:testoffline` exits 0.
- CDU access paths verified against `02`; DB table/column names verified against `01` (UPPERCASE).

---

## 11. Open items / non-goals for this design

- **Not** covered here: exact recipe JSON for every document type, full 64+ specification catalogue, and the email Box rendering internals — these are elaborated per-phase during implementation, driven by `06`, `07`, `09`, `11`.
- **Not** doing: reimplementing anything already provided by GasLibraryFactory (`00_PANORAMICA.md §3`); GAS library references (superseded by D1); automatic Drive↔Sheet rollback beyond the single orphaned-clone cleanup (`08 §6`, `10 §8`).
