# Production split build (Code.js + EntryPoints.js) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `npm run build:production` emit `dist/Code.js` (vendor + ALDO core, minified, comment-free) and a separate `dist/EntryPoints.js` (the document-generation/email-sending launchers, readable, commented, extendable) instead of one fully-minified file, while `testing`/`testoffline` modes keep producing a single merged `Code.js` as today.

**Architecture:** Split `src/index.ts` into a "core" entry (everything except the two launcher functions) and a new `src/entrypoints/EntryPoints.ts` "entry point" file that calls core's functionality via ambient global declarations (no runtime import) — mirroring how GAS shares one global namespace across script files. `webpack.config.cjs` becomes a two-config array (`core`, minified; `entrypoints`, never minified). `scripts/build-and-prepare.cjs` composes the two bundles differently per mode: merged into one `Code.js` for `testing`/`testoffline`, kept as `Code.js` + separate `EntryPoints.js` for `production` (with the vendor prelude minified in-memory via `terser` at concat time for `production` only).

**Tech Stack:** TypeScript (Babel-transpiled, GAS V8 target), Webpack 5, `gas-webpack-plugin`, `minimizer-webpack-plugin` (Terser, webpack's internal minifier package), `terser` (standalone, for vendor-prelude minification), Jest.

## Global Constraints

- Target is GAS V8: only synchronous code, no Node-specific APIs (`CLAUDE.md`).
- Native GAS service globals (`DriveApp`, `SpreadsheetApp`, etc.) may only be touched inside `GoogleApiWrapper`/facades — enforced by ESLint `no-restricted-globals` (`CLAUDE.md`, `eslint.config.js`).
- Never edit `dist/*` — it is generated (`CLAUDE.md`).
- No test files (offline or online) may appear in any build output, in any mode (design spec).
- `testing` and `testoffline` modes must keep their current single-`Code.js`, fully-merged, fully-readable observable output (design spec — regression constraint).
- `tsconfig.json` has `verbatimModuleSyntax: true` — type-only imports must use `import type` explicitly (confirmed existing convention, e.g. `src/presentation/Menu.ts:1`).
- `eslint.config.js` test-file exemptions (`@typescript-eslint/no-explicit-any` off, etc.) apply only under `test/**/*.ts`.

---

### Task 1: Add `terser` and `minimizer-webpack-plugin` as explicit devDependencies

Both packages are already present in `node_modules`/`package-lock.json` as transitive dependencies of `webpack` (versions `terser@5.48.0`, `minimizer-webpack-plugin@5.6.1` — confirmed via `node -e "console.log(require('terser').minify_sync)"` and `node_modules/minimizer-webpack-plugin/package.json`). This task makes them explicit first-class dependencies so `webpack.config.cjs` and `scripts/build-and-prepare.cjs` can `require()` them directly without relying on webpack's internal resolution, and so `npm ci` stays reproducible.

**Files:**
- Modify: `package.json`

**Interfaces:**
- Produces: `require('terser')` and `require('minimizer-webpack-plugin')` resolvable from the project root for Tasks 4 and 5.

- [ ] **Step 1: Add the two packages to `package.json` devDependencies**

Open `package.json` and add these two lines to `devDependencies` (alphabetically, matching the existing sorted list):

```json
    "jest": "^30.2.0",
    "minimizer-webpack-plugin": "^5.6.1",
    "prettier": "^3.7.4",
    "terser": "^5.48.0",
```

(Insert `"minimizer-webpack-plugin": "^5.6.1",` right after the `"jest"` line, and `"terser": "^5.48.0",` right after the existing `"ts-jest"` line, keeping the block alphabetically sorted.)

- [ ] **Step 2: Run `npm install` to sync the lockfile**

Run: `npm install`
Expected: exits 0, no network fetches needed (both packages already resolved in `package-lock.json`), `package.json` and `package-lock.json` now list both as direct devDependencies.

- [ ] **Step 3: Verify both are requirable**

Run: `node -e "console.log(typeof require('terser').minify_sync, typeof require('minimizer-webpack-plugin'))"`
Expected output: `function function`

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "build: add terser and minimizer-webpack-plugin as explicit devDependencies"
```

---

### Task 2: Split `src/index.ts` — move launcher functions out, expose cross-file globals

`src/index.ts` currently defines all six GAS entry points and imports the whole app graph. This task removes `menu_avvioGenerazioneDocumenti` and `menu_avvioComunicazioniEmail` (moved to Task 3's new file) and adds `globalThis` assignments for the six identifiers `EntryPoints.ts` will call without importing: `initAldo`, `creaJobRunner`, `avviaGenerazioneDataDriven`, `avviaInvioNotificheDataDriven`, `menuGenerazioneDocumenti`, `menuComunicazioniEmail`, `GasUiFacade`.

**Files:**
- Modify: `src/index.ts`
- Test: `test/unit/index.test.ts` (no changes needed — already only tests `aldoPing`; run to confirm it still passes)

**Interfaces:**
- Produces (as GAS/webpack globals, consumed by Task 3's `EntryPoints.ts` at runtime): `initAldo(now?, props?): ServiceContainer`, `creaJobRunner(): JobRunnerService`, `avviaGenerazioneDataDriven(c: ServiceContainer, configId: string, runner: JobRunnerService): unknown`, `avviaInvioNotificheDataDriven(c: ServiceContainer, patternId: string, runner: JobRunnerService): unknown`, `menuGenerazioneDocumenti(ui: IUiFacade, avvia: (configId: string) => void): void`, `menuComunicazioniEmail(ui: IUiFacade, avvia: (patternId: string) => void): void`, `GasUiFacade` (class, `new GasUiFacade(): IUiFacade`).
- Retains: `aldoPing()`, `onOpen()`, `menu_avvioImportazioni()`, `resumeJob()` (unchanged bodies).

- [ ] **Step 1: Run the existing test to confirm current baseline passes**

Run: `npx jest --config jest.config.cjs test/unit/index.test.ts`
Expected: PASS (1 test) — this is the baseline before editing.

- [ ] **Step 2: Rewrite `src/index.ts`**

Replace the full file content with:

```typescript
// ALDO entry points (15 §2-§5). GAS calls top-level global functions by name;
// gas-webpack-plugin hoists the `(globalThis as any).<name> = ...` assignments
// to true globals. Everything below is delegation: onOpen builds the menu only
// (no DI init, 15 §2); menu_avvioImportazioni is a data-driven launcher wrapper;
// `resumeJob` is the JobRunnerLib timed trigger target (the library resolves the
// suspended job from the trigger id). The document-generation and email-sending
// launchers live in src/entrypoints/EntryPoints.ts, a separate, human-readable
// GAS script file — this file exposes the identifiers that file calls as true
// globals (GAS shares one global namespace across every script file).
import {
  initAldo,
  creaJobRunner,
  avviaGenerazioneDataDriven,
  avviaInvioNotificheDataDriven,
  avviaImportazioneDataDriven,
  riprendiJobSospeso
} from './config/Bootstrap';
import { costruisciMenu, menuGenerazioneDocumenti, menuComunicazioniEmail, menuImportazioni } from './presentation/Menu';
import { GasUiFacade } from './infrastructure/facades/UiFacade';

export function aldoPing(): string {
  return 'ALDO OK';
}

export function onOpen(): void {
  costruisciMenu(new GasUiFacade());
}

export function menu_avvioImportazioni(): void {
  menuImportazioni(new GasUiFacade(), (configId) => avviaImportazioneDataDriven(initAldo(), configId));
}

/** JobRunnerLib resume trigger target (15 §5): the job name is resolved from the trigger context. */
export function resumeJob(): void {
  riprendiJobSospeso(initAldo(), creaJobRunner());
}

/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access */
(globalThis as any).aldoPing = aldoPing;
(globalThis as any).onOpen = onOpen;
(globalThis as any).menu_avvioImportazioni = menu_avvioImportazioni;
(globalThis as any).resumeJob = resumeJob;

// Exposed for src/entrypoints/EntryPoints.ts (production split build, docs/superpowers/specs/2026-07-11-production-split-build-design.md):
// that file calls these by name as ambient globals instead of importing them,
// so it stays a small, standalone, human-readable GAS script file.
(globalThis as any).initAldo = initAldo;
(globalThis as any).creaJobRunner = creaJobRunner;
(globalThis as any).avviaGenerazioneDataDriven = avviaGenerazioneDataDriven;
(globalThis as any).avviaInvioNotificheDataDriven = avviaInvioNotificheDataDriven;
(globalThis as any).menuGenerazioneDocumenti = menuGenerazioneDocumenti;
(globalThis as any).menuComunicazioniEmail = menuComunicazioniEmail;
(globalThis as any).GasUiFacade = GasUiFacade;
/* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access */
```

- [ ] **Step 3: Run the existing test again to confirm it still passes**

Run: `npx jest --config jest.config.cjs test/unit/index.test.ts`
Expected: PASS (1 test) — `aldoPing` behavior is untouched.

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: exits 0. (`menu_avvioGenerazioneDocumenti`/`menu_avvioComunicazioniEmail` are no longer defined here — that's expected and fine, since Task 3 defines them in the new file within the same TS program.)

- [ ] **Step 5: Lint**

Run: `npm run lint`
Expected: exits 0.

- [ ] **Step 6: Commit**

```bash
git add src/index.ts
git commit -m "refactor(index): move document-gen/email-sending launchers out, expose cross-file globals"
```

---

### Task 3: Create `src/entrypoints/EntryPoints.ts`

The new human-readable entry-point file: the two launcher functions moved verbatim from `src/index.ts` (JSDoc included), plus `onOpen`'s menu still resolves them by name since GAS shares one global namespace across script files (no wiring needed there — `costruisciMenu` in `src/presentation/Menu.ts` already references `'menu_avvioGenerazioneDocumenti'`/`'menu_avvioComunicazioniEmail'` as strings). This file also ships two example non-interactive launchers demonstrating the extension pattern for a specific `CONF_DOC`/`CONF_MAIL` row.

**Files:**
- Create: `src/entrypoints/EntryPoints.ts`

**Interfaces:**
- Consumes (ambient globals declared in this file, provided by Task 2's `src/index.ts`): `initAldo`, `creaJobRunner`, `avviaGenerazioneDataDriven`, `avviaInvioNotificheDataDriven`, `menuGenerazioneDocumenti`, `menuComunicazioniEmail`, `GasUiFacade` — signatures as listed in Task 2.
- Consumes (types only, erased at compile time via `import type`): `IUiFacade` from `../infrastructure/facades/UiFacade`, `ServiceContainer` from `../config/ServiceContainer`.
- Produces (GAS globals): `menu_avvioGenerazioneDocumenti()`, `menu_avvioComunicazioniEmail()`, `generaPagelle()`, `inviaNotificaAssenze()`.

- [ ] **Step 1: Create the directory and file**

Create `src/entrypoints/EntryPoints.ts` with this content:

```typescript
// ALDO document-generation / email-sending entry points (15 §2-§5).
//
// This file is deliberately kept separate from the rest of the ALDO bundle
// and shipped UNMINIFIED with comments in production builds (see
// docs/superpowers/specs/2026-07-11-production-split-build-design.md) so a
// human can open it directly in the Apps Script editor, read what each
// function does, and run one manually — either via the "AVVIA PROCESSI" menu
// (the two interactive functions below) or by selecting a specific launcher
// from the editor's "Run" dropdown (the non-interactive examples further
// down).
//
// It does not import any ALDO/library code. Everything it calls is declared
// as an ambient global below and provided at runtime by src/index.ts, which
// is bundled separately and loaded first — GAS shares one global namespace
// across every script file in a project, exactly like this project's other
// vendored-library ambient globals (see types/gaslibs/index.d.ts).

import type { IUiFacade } from '../infrastructure/facades/UiFacade';
import type { ServiceContainer } from '../config/ServiceContainer';

declare global {
  function initAldo(now?: Date, props?: unknown): ServiceContainer;
  function creaJobRunner(): JobRunnerService;
  function avviaGenerazioneDataDriven(c: ServiceContainer, configId: string, runner: JobRunnerService): unknown;
  function avviaInvioNotificheDataDriven(c: ServiceContainer, patternId: string, runner: JobRunnerService): unknown;
  function menuGenerazioneDocumenti(ui: IUiFacade, avvia: (configId: string) => void): void;
  function menuComunicazioniEmail(ui: IUiFacade, avvia: (patternId: string) => void): void;
  const GasUiFacade: new () => IUiFacade;
}

/** Menu wrapper (15 §4): prompts for a CONF_DOC.ID, then starts batch document generation. */
export function menu_avvioGenerazioneDocumenti(): void {
  menuGenerazioneDocumenti(new GasUiFacade(), (configId) =>
    avviaGenerazioneDataDriven(initAldo(), configId, creaJobRunner())
  );
}

/** Menu wrapper (15 §4): prompts for a CONF_MAIL.ID, then starts a mass email send. */
export function menu_avvioComunicazioniEmail(): void {
  menuComunicazioniEmail(new GasUiFacade(), (patternId) =>
    avviaInvioNotificheDataDriven(initAldo(), patternId, creaJobRunner())
  );
}

/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access */
(globalThis as any).menu_avvioGenerazioneDocumenti = menu_avvioGenerazioneDocumenti;
(globalThis as any).menu_avvioComunicazioniEmail = menu_avvioComunicazioniEmail;
/* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access */

// ---------------------------------------------------------------------------
// Non-interactive launchers — one per document/email pattern.
//
// The two functions above prompt for a CONF_DOC.ID / CONF_MAIL.ID via a
// dialog. Once a document type or email pattern is stable, copy one of the
// examples below, rename it, and hardcode its id — that gives you a single
// function you can run directly from the Apps Script editor's "Run" dropdown
// (or wire to a time-driven trigger), with no dialog prompt.
//
// Example — replace 'PAGELLE_1Q' / 'ASSENZE_SETTIMANALI' with a real row id
// from CONF_DOC / CONF_MAIL before relying on these two functions; they are
// templates, not verified against live configuration data.
// ---------------------------------------------------------------------------

/** Launches document generation for the CONF_DOC row "PAGELLE_1Q" (example — edit the id before use). */
export function generaPagelle(): void {
  avviaGenerazioneDataDriven(initAldo(), 'PAGELLE_1Q', creaJobRunner());
}

/** Sends the CONF_MAIL "ASSENZE_SETTIMANALI" notification pattern (example — edit the id before use). */
export function inviaNotificaAssenze(): void {
  avviaInvioNotificheDataDriven(initAldo(), 'ASSENZE_SETTIMANALI', creaJobRunner());
}

/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access */
(globalThis as any).generaPagelle = generaPagelle;
(globalThis as any).inviaNotificaAssenze = inviaNotificaAssenze;
/* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access */
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: exits 0. (`JobRunnerService` resolves as an ambient global from `types/gaslibs/index.d.ts` — no import needed, matching `src/config/Bootstrap.ts`'s existing usage.)

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: exits 0.

- [ ] **Step 4: Run the full unit suite to confirm nothing else broke**

Run: `npm test`
Expected: all existing suites PASS, including `test/unit/presentation/menu.test.ts` (unaffected — it tests `src/presentation/Menu.ts` directly, not the removed/moved wiring).

- [ ] **Step 5: Commit**

```bash
git add src/entrypoints/EntryPoints.ts
git commit -m "feat(entrypoints): add human-readable document-gen/email-sending entry points"
```

---

### Task 4: Split `webpack.config.cjs` into `core` + `entrypoints` configs

**Files:**
- Modify: `webpack.config.cjs`

**Interfaces:**
- Produces: `dist/aldo-core.js` (+`.map`), from entry `src/index.ts`, minified unless `--env readable`, comment-free either way (Terser strips them).
- Produces: `dist/EntryPoints.js` (+`.map`), from entry `src/entrypoints/EntryPoints.ts`, never minified, comments preserved.
- Consumes: `minimizer-webpack-plugin` (Task 1).

- [ ] **Step 1: Read the current file to confirm no drift since this plan was written**

Run: `cat webpack.config.cjs`
Expected: matches the single-config version described in the design spec (entry `./src/index.ts`, output `aldo.js`, `optimization: { minimize: !readable }`, `GasPlugin({ autoGlobalExportsFiles: [...], comments: false })`).

- [ ] **Step 2: Replace the file content**

```javascript
const path = require('path');
const GasPlugin = require('gas-webpack-plugin');
const TerserPlugin = require('minimizer-webpack-plugin');

const babelRule = {
  test: /\.ts$/,
  exclude: [/node_modules/, /\.test\.ts$/],
  use: {
    loader: 'babel-loader',
    options: {
      presets: [
        ['@babel/preset-env', { targets: { chrome: '80' }, modules: false }],
        ['@babel/preset-typescript', {}]
      ]
    }
  }
};

module.exports = (env) => {
  const readable = !!(env && env.readable);

  const coreConfig = {
    name: 'core',
    mode: 'production',
    entry: './src/index.ts',
    devtool: 'source-map',
    output: {
      filename: 'aldo-core.js',
      path: path.resolve(__dirname, 'dist'),
      library: { type: 'this' },
      clean: false
    },
    resolve: { extensions: ['.ts', '.js', '.json'] },
    module: { rules: [babelRule] },
    optimization: {
      minimize: !readable,
      minimizer: [
        new TerserPlugin({
          extractComments: false,
          terserOptions: { format: { comments: false } }
        })
      ]
    },
    plugins: [new GasPlugin({ autoGlobalExportsFiles: [path.resolve(__dirname, 'src/index.ts')], comment: false })]
  };

  // Document-generation/email-sending entry points (docs/superpowers/specs/
  // 2026-07-11-production-split-build-design.md): always readable, always
  // commented, regardless of --env readable or the ALDO build mode — this
  // file is meant to be opened and read/extended by a human.
  const entrypointsConfig = {
    name: 'entrypoints',
    mode: 'production',
    entry: './src/entrypoints/EntryPoints.ts',
    devtool: 'source-map',
    output: {
      filename: 'EntryPoints.js',
      path: path.resolve(__dirname, 'dist'),
      library: { type: 'this' },
      clean: false
    },
    resolve: { extensions: ['.ts', '.js', '.json'] },
    module: { rules: [babelRule] },
    optimization: { minimize: false },
    plugins: [
      new GasPlugin({ autoGlobalExportsFiles: [path.resolve(__dirname, 'src/entrypoints/EntryPoints.ts')], comment: true })
    ]
  };

  return [coreConfig, entrypointsConfig];
};
```

- [ ] **Step 3: Run webpack directly (readable env) to confirm the multi-config build works**

Run: `npx webpack --env readable`
Expected: exits 0, prints two compilation summaries (one per config, named `core` and `entrypoints`), and produces `dist/aldo-core.js`, `dist/aldo-core.js.map`, `dist/EntryPoints.js`, `dist/EntryPoints.js.map`.

- [ ] **Step 4: Inspect the two output files**

Run: `head -c 300 dist/aldo-core.js; echo; echo ---; head -c 300 dist/EntryPoints.js`
Expected: `aldo-core.js` starts with dense/compact code (readable env, so not minified, but still no source comments from `comment:false`); `EntryPoints.js` starts with the file's leading comment block (`// ALDO document-generation / email-sending entry points...`) intact.

- [ ] **Step 5: Run webpack in production (non-readable) env to confirm minification**

Run: `rm -rf dist && npx webpack`
Expected: exits 0. `dist/aldo-core.js` is a single dense minified line (or near it); `dist/EntryPoints.js` is still multi-line and readable with comments (never minified, per config).

- [ ] **Step 6: Clean up manual dist output (build-and-prepare.cjs owns dist/ from here on)**

Run: `rm -rf dist`

- [ ] **Step 7: Commit**

```bash
git add webpack.config.cjs
git commit -m "build(webpack): split into core (minified) + entrypoints (readable) configs"
```

---

### Task 5: Update `scripts/build-and-prepare.cjs` for the two-bundle composition

Per-mode output composition: `testing`/`testoffline` keep merging vendor+core+entrypoints into one `Code.js` (regression-safe, matches today's behavior); `production` minifies the vendor prelude with `terser`, merges vendor(minified)+core into `Code.js`, and leaves `EntryPoints.js` as its own file. Also adds a production-only verification step (Task 6 will exercise it) and a light V8-compat *scan* (no rewrite) over `EntryPoints.js`.

**Files:**
- Modify: `scripts/build-and-prepare.cjs`

**Interfaces:**
- Consumes: `dist/aldo-core.js`, `dist/EntryPoints.js` (Task 4's webpack output).
- Consumes: `require('terser').minify_sync` (Task 1).
- Produces: `dist/Code.js` (all modes), `dist/EntryPoints.js` (production mode only, left in place).

- [ ] **Step 1: Update the file-path constants**

In `scripts/build-and-prepare.cjs`, find:

```javascript
const vendorBundle = path.join(rootDir, 'vendor', 'gaslibs.Code.js');
const aldoBundle = path.join(distDir, 'aldo.js');
```

Replace with:

```javascript
const vendorBundle = path.join(rootDir, 'vendor', 'gaslibs.Code.js');
const aldoCoreBundle = path.join(distDir, 'aldo-core.js');
const entryPointsBundle = path.join(distDir, 'EntryPoints.js');
```

- [ ] **Step 2: Add the `terser` require near the top**

Find the existing requires block:

```javascript
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
```

Replace with:

```javascript
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { minify_sync } = require('terser');
```

- [ ] **Step 3: Update `TOTAL_STEPS`**

Find:

```javascript
// Steps: Clean, Vendor verify, Webpack, Prelude concat, Copy appsscript.json,
// V8 patch, Configure deployment files, Source map index, [offline tests], Summary
const TOTAL_STEPS = mode === 'testoffline' ? 10 : 9;
```

Replace with:

```javascript
// Steps: Clean, Vendor verify, Webpack, Compose Code.js/EntryPoints.js,
// Copy appsscript.json, V8 patch, Configure deployment files, Source map
// index, [production verify | testoffline offline tests], Summary
const TOTAL_STEPS = mode === 'testing' ? 9 : 10;
```

- [ ] **Step 4: Update the mode banner**

Find:

```javascript
heading('ALDO (SGSA) - Build and Prepare');
info(`Mode:         ${c.bold}${mode.toUpperCase()}${c.reset}`);
if (mode === 'testoffline') {
  info(`Code.js:      Readable (not minified), no comments`);
  info(`Offline tests: Will run after build (unit + integration)`);
} else {
  info(
    `Code.js:      ${mode === 'production' ? 'Minified (Terser), no comments' : 'Readable (not minified), no comments'}`
  );
}
```

Replace with:

```javascript
heading('ALDO (SGSA) - Build and Prepare');
info(`Mode:         ${c.bold}${mode.toUpperCase()}${c.reset}`);
if (mode === 'testoffline') {
  info(`Code.js:      Vendor + ALDO core + ALDO entry points, merged, readable`);
  info(`Offline tests: Will run after build (unit + integration)`);
} else if (mode === 'production') {
  info(`Code.js:      Vendor + ALDO core — minified (Terser), no comments`);
  info(`EntryPoints.js: ALDO document-gen/email-sending launchers — readable, with comments`);
} else {
  info(`Code.js:      Vendor + ALDO core + ALDO entry points, merged, readable`);
}
```

- [ ] **Step 5: Replace the webpack-output existence check + concatenation step**

Find (this spans the old step 3's tail check through step 4):

```javascript
if (!fs.existsSync(aldoBundle)) {
  fail('dist/aldo.js was not produced by Webpack');
  process.exit(1);
}

step(4, TOTAL_STEPS, 'Concatenating vendor prelude + ALDO bundle into Code.js...');

{
  const prelude = fs.readFileSync(vendorBundle, 'utf8');
  const aldo = fs.readFileSync(aldoBundle, 'utf8');
  fs.writeFileSync(codeJsPath, prelude + '\n;\n' + aldo, 'utf8');
  fs.rmSync(aldoBundle, { force: true });
  fs.rmSync(aldoBundle + '.map', { force: true });
  ok('Wrote dist/Code.js (vendor prelude + ALDO bundle)');
}
```

Replace with:

```javascript
if (!fs.existsSync(aldoCoreBundle)) {
  fail('dist/aldo-core.js was not produced by Webpack');
  process.exit(1);
}
if (!fs.existsSync(entryPointsBundle)) {
  fail('dist/EntryPoints.js was not produced by Webpack');
  process.exit(1);
}

step(4, TOTAL_STEPS, 'Composing GAS deployment file(s)...');

{
  const prelude = fs.readFileSync(vendorBundle, 'utf8');
  const core = fs.readFileSync(aldoCoreBundle, 'utf8');

  if (mode === 'production') {
    const minified = minify_sync(prelude, { format: { comments: false } });
    if (minified.error || typeof minified.code !== 'string') {
      fail(`Failed to minify vendor prelude: ${minified.error ? minified.error.message : 'no code produced'}`);
      process.exit(1);
    }
    fs.writeFileSync(codeJsPath, minified.code + '\n;\n' + core, 'utf8');
    ok('Wrote dist/Code.js (vendor prelude minified + ALDO core, minified, no comments)');
    ok('Kept dist/EntryPoints.js separate (readable, with comments)');
    fs.rmSync(aldoCoreBundle, { force: true });
    fs.rmSync(aldoCoreBundle + '.map', { force: true });
    fs.rmSync(entryPointsBundle + '.map', { force: true });
  } else {
    const entrypoints = fs.readFileSync(entryPointsBundle, 'utf8');
    fs.writeFileSync(codeJsPath, prelude + '\n;\n' + core + '\n;\n' + entrypoints, 'utf8');
    ok('Wrote dist/Code.js (vendor prelude + ALDO core + ALDO entry points)');
    fs.rmSync(aldoCoreBundle, { force: true });
    fs.rmSync(aldoCoreBundle + '.map', { force: true });
    fs.rmSync(entryPointsBundle, { force: true });
    fs.rmSync(entryPointsBundle + '.map', { force: true });
  }
}
```

- [ ] **Step 6: Add the EntryPoints.js V8-compat scan (production only, scan-only, no rewrite)**

Find the end of the existing V8 patch block — the `if (warningCount > 0) { warn(...) }` right before `step(7, TOTAL_STEPS, 'Configuring deployment files...');`:

```javascript
if (warningCount > 0) {
  warn(
    `${warningCount} compatibility warning(s) detected — review above for details`
  );
}

step(7, TOTAL_STEPS, 'Configuring deployment files...');
```

Replace with:

```javascript
if (mode === 'production') {
  const entryPointsFinalPath = path.join(distDir, 'EntryPoints.js');
  const entryPointsCode = fs.readFileSync(entryPointsFinalPath, 'utf8');
  let entryWarnings = 0;
  for (const { label, regex, reason } of scanPatterns) {
    const matches = entryPointsCode.match(regex);
    if (matches) {
      warn(`EntryPoints.js: found ${matches.length} instance(s) of ${c.bold}${label}${c.reset}`);
      info(`  Reason: ${reason}`);
      entryWarnings += matches.length;
    }
  }
  if (entryWarnings === 0) {
    ok('EntryPoints.js: no GAS V8 compatibility issues detected (scan-only, not rewritten)');
  }
  warningCount += entryWarnings;
}

if (warningCount > 0) {
  warn(
    `${warningCount} compatibility warning(s) detected — review above for details`
  );
}

step(7, TOTAL_STEPS, 'Configuring deployment files...');
```

- [ ] **Step 7: Add the production split-output verification step**

Find the end of step 8 (source map index generation) — the closing of that block, right before:

```javascript
let offlineTestsPassed = false;

if (mode === 'testoffline') {
```

Insert this new block immediately before `let offlineTestsPassed = false;`:

```javascript
if (mode === 'production') {
  step(9, TOTAL_STEPS, 'Verifying production split output...');

  let productionVerifyPassed = true;
  const codeJsContent = fs.readFileSync(codeJsPath, 'utf8');
  const entryPointsFinalPath = path.join(distDir, 'EntryPoints.js');
  const entryPointsContent = fs.existsSync(entryPointsFinalPath) ? fs.readFileSync(entryPointsFinalPath, 'utf8') : '';

  const launcherNames = ['menu_avvioGenerazioneDocumenti', 'menu_avvioComunicazioniEmail', 'generaPagelle', 'inviaNotificaAssenze'];
  // menu_avvioGenerazioneDocumenti/menu_avvioComunicazioniEmail legitimately
  // appear in Code.js as STRING data: src/presentation/Menu.ts's vociMenu()
  // (bundled into core) registers GAS menu items by function-name string
  // (menu.addItem(label, 'funcName')), and that file is part of core, not
  // EntryPoints.ts. Only the two non-interactive example launchers — never
  // referenced anywhere in core — are safe to check by bare name.
  const namesForbiddenInCodeJs = ['generaPagelle', 'inviaNotificaAssenze'];

  const leakedIntoCodeJs = namesForbiddenInCodeJs.filter((name) => codeJsContent.includes(name));
  if (leakedIntoCodeJs.length > 0) {
    fail(`Code.js unexpectedly contains launcher source: ${leakedIntoCodeJs.join(', ')}`);
    productionVerifyPassed = false;
  } else {
    ok('Code.js does not contain document-generation/email-sending launcher source');
  }

  if (codeJsContent.includes('/**')) {
    fail('Code.js contains JSDoc comment blocks — expected fully comment-stripped minified output');
    productionVerifyPassed = false;
  } else {
    ok('Code.js contains no JSDoc comment blocks (minified, comment-free)');
  }

  if (!fs.existsSync(entryPointsFinalPath)) {
    fail('dist/EntryPoints.js was not produced');
    productionVerifyPassed = false;
  } else {
    if (!entryPointsContent.includes('/**')) {
      fail('EntryPoints.js contains no JSDoc comment blocks — expected readable, commented output');
      productionVerifyPassed = false;
    } else {
      ok('EntryPoints.js retains JSDoc comment blocks');
    }

    const missingFromEntryPoints = launcherNames.filter((name) => !entryPointsContent.includes(name));
    if (missingFromEntryPoints.length > 0) {
      fail(`EntryPoints.js is missing expected launcher(s): ${missingFromEntryPoints.join(', ')}`);
      productionVerifyPassed = false;
    } else {
      ok('EntryPoints.js contains all expected launcher functions');
    }

    const lineCount = entryPointsContent.split('\n').length || 1;
    const avgLineLength = entryPointsContent.length / lineCount;
    if (avgLineLength > 200) {
      fail(`EntryPoints.js looks minified (avg line length ${avgLineLength.toFixed(0)} chars) — expected readable multi-line output`);
      productionVerifyPassed = false;
    } else {
      ok(`EntryPoints.js is readable (avg line length ${avgLineLength.toFixed(0)} chars over ${lineCount} lines)`);
    }
  }

  const testLeakLabels = [
    ['Code.js', codeJsContent],
    ['EntryPoints.js', entryPointsContent]
  ];
  let testLeakFound = false;
  for (const [label, content] of testLeakLabels) {
    if (content.includes('__tests__') || content.includes('.test.ts')) {
      fail(`${label} contains test-file references — test code leaked into the production bundle`);
      productionVerifyPassed = false;
      testLeakFound = true;
    }
  }
  if (!testLeakFound) {
    ok('No test-file references found in production output');
  }

  if (!productionVerifyPassed) {
    fail('Production split verification failed — see above');
    process.exit(1);
  }
}

let offlineTestsPassed = false;

if (mode === 'testoffline') {
```

- [ ] **Step 8: Renumber the testoffline offline-tests step**

Find:

```javascript
if (mode === 'testoffline') {
  step(9, TOTAL_STEPS, 'Running offline tests (unit + integration)...');
```

This is already step `9` and `TOTAL_STEPS` is now `10` for `testoffline` too (Step 3 above), so no numeric change is needed here — confirm it still reads `step(9, TOTAL_STEPS, ...)` unchanged.

- [ ] **Step 9: Update the summary step number reference**

Find:

```javascript
const summaryStep = TOTAL_STEPS;
step(summaryStep, TOTAL_STEPS, 'Build summary');
```

No change needed — `summaryStep` is already computed from `TOTAL_STEPS`, which now correctly evaluates to `9` for `testing` and `10` for `testoffline`/`production` (Step 3 above already updated this).

- [ ] **Step 10: Commit**

```bash
git add scripts/build-and-prepare.cjs
git commit -m "build(prepare): compose Code.js + EntryPoints.js per mode, verify production split"
```

---

### Task 6: End-to-end verification of all three modes

Run all three build modes and manually confirm the produced files match the design spec, as a final regression + new-behavior check beyond what's automated inside `build-and-prepare.cjs` itself.

**Files:**
- None (verification only — no source changes).

- [ ] **Step 1: Regression check — `testing` mode**

Run: `npm run build:testing`
Expected: exits 0, ends with "Build Complete — Ready for Deployment". `dist/` contains `Code.js`, `appsscript.json`, `.claspignore`, `source-map-index.json` — no separate `EntryPoints.js` (it was merged in).

- [ ] **Step 2: Confirm `testing` mode's `Code.js` contains the entry-point functions merged in**

Run: `grep -c "menu_avvioGenerazioneDocumenti\|generaPagelle\|inviaNotificaAssenze" dist/Code.js`
Expected: a non-zero count (functions are present, merged into the single file, as in current/unchanged behavior for this mode).

- [ ] **Step 3: Regression check — `testoffline` mode (runs the full offline test suite)**

Run: `npm run build:testoffline`
Expected: exits 0, ends with "Build & Test Complete — All Tests Passed". This is the authoritative regression gate: it re-runs `npm test` and `npm run test:integration` against the newly-split source, so any behavioral regression from Tasks 2–3 surfaces here.

- [ ] **Step 4: New behavior — `production` mode**

Run: `npm run build:production`
Expected: exits 0, ends with "Build Complete — Ready for Deployment", and step 9/10 prints "Verifying production split output..." with all `ok()` lines (no `fail()` lines) before the summary. `dist/` now contains both `Code.js` and `EntryPoints.js`.

- [ ] **Step 5: Manually confirm `dist/Code.js` is minified and comment-free**

Run: `wc -l dist/Code.js && grep -c "/\*\*" dist/Code.js`
Expected: line count is very low relative to file size (dense minified output — for reference, the vendor bundle alone is ~74k lines readable, expect `Code.js` line count in the tens, not tens-of-thousands); the `/**` grep count is `0`.

- [ ] **Step 6: Manually confirm `dist/EntryPoints.js` is readable and commented**

Run: `wc -l dist/EntryPoints.js && grep -c "/\*\*" dist/EntryPoints.js && grep -n "menu_avvioGenerazioneDocumenti\|menu_avvioComunicazioniEmail\|generaPagelle\|inviaNotificaAssenze" dist/EntryPoints.js`
Expected: a substantial line count (multi-line, readable — dozens of lines, not one dense line), `/**` count `> 0`, and all four function names present with their `grep -n` line numbers spread across the file (not all crammed onto one line, confirming it is not minified).

- [ ] **Step 7: Confirm `dist/Code.js` does NOT contain the launcher source in `production` mode**

Note: `menu_avvioGenerazioneDocumenti`/`menu_avvioComunicazioniEmail` legitimately appear in `Code.js` as plain string data (`src/presentation/Menu.ts`'s `vociMenu()`, bundled into core, registers GAS menu items via `menu.addItem(label, 'funcName')` — a string reference, not a function definition). Only the two non-interactive example launchers, never referenced anywhere in core, must be absent by name.

Run: `grep -c "generaPagelle\|inviaNotificaAssenze" dist/Code.js`
Expected: `0`.

- [ ] **Step 8: Confirm no test-file leakage in either production output file**

Run: `grep -c "__tests__\|\.test\.ts" dist/Code.js dist/EntryPoints.js`
Expected: `0` for both files.

- [ ] **Step 9: Clean up the local verification build**

Run: `rm -rf dist`

(No commit for this task — it's verification-only. If any step fails, return to Task 5 and fix the underlying script before re-running.)

---

### Task 7: Update `.claspignore` intent check and final full-repo gate

One last check that the whole repo (not just the touched files) is still green, since Tasks 2–5 touched build tooling that other npm scripts depend on.

**Files:**
- None (verification only).

- [ ] **Step 1: Full lint**

Run: `npm run lint`
Expected: exits 0.

- [ ] **Step 2: Full typecheck**

Run: `npm run typecheck`
Expected: exits 0.

- [ ] **Step 3: Full unit test suite**

Run: `npm test`
Expected: all suites PASS (this includes `test/unit/index.test.ts`, `test/unit/presentation/menu.test.ts`, `test/unit/config/bootstrap.test.ts`, `test/unit/harness/gaslibs.test.ts`, `test/unit/infrastructure/email-steps.test.ts`, and every other existing suite — none of them import the two moved functions directly, so none should need changes).

- [ ] **Step 4: Full integration test suite**

Run: `npm run test:integration`
Expected: PASS.

- [ ] **Step 5: Confirm git status is clean except for the expected commits from Tasks 1–5**

Run: `git status --short`
Expected: no unstaged/untracked changes (everything from this plan was committed at the end of its task; `dist/` is gitignored and was cleaned up in Task 6).

- [ ] **Step 6: Review the commit log for this work**

Run: `git log --oneline -6`
Expected: the six commits from Tasks 1–5 (one per task) are visible, most recent first.
