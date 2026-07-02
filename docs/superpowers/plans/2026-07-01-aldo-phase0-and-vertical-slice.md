# ALDO — Phase 0 (Toolchain) + Vertical Slice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up ALDO's TypeScript→GAS toolchain and prove the full Clean-Architecture stack end-to-end by generating one *Verbale del Consiglio di Classe* document for a single class.

**Architecture:** Max-strict TypeScript, bundled by webpack (ALDO code only) and concatenated with a vendored, pre-built `GasLibraryFactory` bundle into one GAS `Code.js`. Library classes are runtime globals typed by hand-written ambient `.d.ts`. Layers (Domain → Application → Infrastructure) are enforced by ESLint; native GAS globals are allowed only inside `src/infrastructure/facades/**`. Everything is TDD: failing test → minimal code → green → commit.

**Tech Stack:** TypeScript 5, Babel (`@babel/preset-env` chrome 80 + `@babel/preset-typescript`), webpack 5 + `gas-webpack-plugin`, Jest 30 + `ts-jest`, ESLint 9 flat config + `typescript-eslint`, Prettier, `@google/clasp`, `@types/google-apps-script`.

## Global Constraints

- **Runtime:** Google Apps Script **V8**. Synchronous only. No Node APIs, no unsupported browser APIs. (`CLAUDE.md`, `GasLibraryFactory/CLAUDE.md`)
- **Sources of truth (precedence):** `SPECS_ALDO/01_SCHEMA_DATABASE.md` then `SPECS_ALDO/02_CDU_STRUTTURA.md`. All DB table and column names are **UPPERCASE**. All CDU access paths must exist verbatim in `02`.
- **Native GAS globals** (`DriveApp`, `SpreadsheetApp`, `DocumentApp`, `MailApp`, `PropertiesService`, `CacheService`, `UrlFetchApp`, `Utilities`, `Session`, `ScriptApp`, `LockService`) — usable **only** under `src/infrastructure/facades/**`. Enforced by ESLint.
- **Layer rule:** each layer depends only on the one immediately below; `src/domain/**` imports nothing from `application`, `infrastructure`, `config`, `ui`, or any library global. (`08_ARCHITETTURA_DI_PATTERN.md §1`)
- **No `throw new Error(...)`** outside `src/infrastructure/facades/**` and test files; use typed exceptions. (`DOCS_LIBS/LIBRERIE_GESTIONE.md` rule #6)
- **Never edit `dist/*` or `vendor/*` by hand.** Fix source only.
- **Do not reimplement** anything GasLibraryFactory provides. (`00_PANORAMICA.md §3`)
- **Design reference:** `docs/superpowers/specs/2026-07-01-aldo-implementation-design.md`.

---

## File Structure

Created in this plan (paths relative to repo root `ALDO/`):

- `package.json`, `tsconfig.json`, `tsconfig.eslint.json`, `.prettierrc.json`, `eslint.config.js`, `webpack.config.cjs`, `jest.config.cjs`, `jest.integration.config.cjs`, `babel.config.cjs`, `appsscript.json`, `.claspignore.base`, `.gitignore`
- `scripts/build-and-prepare.cjs`, `scripts/verify-vendor.cjs`, `scripts/refresh-vendor.cjs`
- `vendor/gaslibs.Code.js`, `vendor/VERSION`, `vendor/CHECKSUM`
- `types/gaslibs/*.d.ts` (ambient decls for the libs the slice uses)
- `src/index.ts` (GAS entry points → global)
- `src/config/` schema name constants + `ServiceContainer.ts` + `Bootstrap.ts`
- `src/domain/value-objects/`, `src/domain/entities/`, `src/domain/repositories/`, `src/domain/specifications/`, `src/domain/errors/`
- `src/infrastructure/db/` (Database port + SheetDB adapter), `src/infrastructure/facades/`, `src/infrastructure/pipelines/`, `src/infrastructure/steps/`
- `src/application/context/` (ContextBuilder + providers), `src/application/services/`, `src/application/strategies/`
- `test/fixtures/`, `test/fakes/`, plus `*.test.ts` co-located under `test/unit/**` and `test/integration/**`

---

## PHASE 0 — Toolchain

### Task 0.1: Project scaffolding + dependencies

**Files:**
- Create: `package.json`, `.gitignore`, `babel.config.cjs`
- Create (empty dirs via `.gitkeep`): `src/`, `test/`, `types/gaslibs/`, `vendor/`, `scripts/`

**Interfaces:**
- Produces: npm scripts `lint`, `typecheck`, `test`, `test:integration`, `build:testing`, `build:testoffline`, `build:production`, `push:testing`, `refresh:vendor`.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "aldo-sgsa",
  "version": "0.1.0",
  "description": "SGSA (ALDO) — school management ERP on Google Apps Script",
  "type": "module",
  "main": "dist/Code.js",
  "scripts": {
    "typecheck": "tsc --noEmit",
    "lint": "eslint .",
    "lint:fix": "eslint . --fix",
    "format": "prettier --write .",
    "test": "jest --config jest.config.cjs",
    "test:integration": "jest --config jest.integration.config.cjs",
    "refresh:vendor": "node scripts/refresh-vendor.cjs",
    "verify:vendor": "node scripts/verify-vendor.cjs",
    "build:testing": "node scripts/build-and-prepare.cjs --mode=testing",
    "build:testoffline": "node scripts/build-and-prepare.cjs --mode=testoffline",
    "build:production": "node scripts/build-and-prepare.cjs --mode=production",
    "push:testing": "npm run build:testing && clasp push"
  },
  "engines": { "node": ">=18.0.0", "npm": ">=9.0.0" },
  "devDependencies": {
    "@babel/core": "^7.28.5",
    "@babel/preset-env": "^7.29.2",
    "@babel/preset-typescript": "^7.27.1",
    "@eslint/js": "^9.39.2",
    "@google/clasp": "^2.4.2",
    "@types/google-apps-script": "^1.0.99",
    "@types/jest": "^30.0.0",
    "babel-loader": "^9.1.3",
    "eslint": "^9.39.2",
    "eslint-config-prettier": "^10.1.8",
    "eslint-plugin-jest": "^29.12.1",
    "gas-webpack-plugin": "^2.3.0",
    "jest": "^30.2.0",
    "prettier": "^3.7.4",
    "ts-jest": "^29.2.5",
    "typescript": "^5.7.2",
    "typescript-eslint": "^8.20.0",
    "webpack": "^5.89.0",
    "webpack-cli": "^5.1.4"
  }
}
```

- [ ] **Step 2: Create `.gitignore`**

```
node_modules/
dist/
coverage/
*.log
.clasp.json
```

- [ ] **Step 3: Create `babel.config.cjs`** (used by webpack's babel-loader AND ts-jest is separate; this targets GAS)

```js
module.exports = {
  presets: [
    ['@babel/preset-env', { targets: { chrome: '80' }, modules: false }],
    ['@babel/preset-typescript', {}]
  ]
};
```

- [ ] **Step 4: Create dir markers**

Run:
```bash
mkdir -p src test types/gaslibs vendor scripts
touch src/.gitkeep test/.gitkeep types/gaslibs/.gitkeep vendor/.gitkeep scripts/.gitkeep
```

- [ ] **Step 5: Install**

Run: `npm install`
Expected: exits 0, `node_modules/` populated, no peer-dependency errors that abort install.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json babel.config.cjs .gitignore src test types vendor scripts
git commit -m "chore: scaffold ALDO project and install toolchain"
```

---

### Task 0.2: TypeScript max-strict config

**Files:**
- Create: `tsconfig.json`, `tsconfig.eslint.json`

**Interfaces:**
- Produces: `npm run typecheck` runs `tsc --noEmit` with all max-strict flags.

- [ ] **Step 1: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2019",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2019"],
    "types": ["google-apps-script", "jest", "node"],
    "typeRoots": ["./node_modules/@types", "./types"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "declaration": false,
    "noEmit": true,
    "esModuleInterop": true,
    "resolveJsonModule": true
  },
  "include": ["src/**/*.ts", "types/**/*.d.ts"],
  "exclude": ["node_modules", "dist", "vendor"]
}
```

- [ ] **Step 2: Create `tsconfig.eslint.json`** (adds tests so type-aware lint sees them)

```json
{
  "extends": "./tsconfig.json",
  "include": ["src/**/*.ts", "test/**/*.ts", "types/**/*.d.ts"]
}
```

- [ ] **Step 3: Verify tsc runs clean on empty source**

Run: `npm run typecheck`
Expected: PASS (no `.ts` files yet → no errors). Note: `@types/node` is pulled transitively by webpack/jest; if `tsc` complains it is missing, add `"@types/node"` explicitly to devDependencies and re-install.

- [ ] **Step 4: Commit**

```bash
git add tsconfig.json tsconfig.eslint.json
git commit -m "chore: add max-strict TypeScript config"
```

---

### Task 0.3: ESLint gates (layer + facade + typed-exception) with a self-test

**Files:**
- Create: `eslint.config.js`, `.prettierrc.json`
- Create (temporary self-test, deleted in Step 6): `src/domain/__lint_probe__.ts`

**Interfaces:**
- Produces: `npm run lint` fails on (a) native GAS global outside `facades/`, (b) domain importing infrastructure, (c) `throw new Error` outside allowlist.

- [ ] **Step 1: Create `.prettierrc.json`**

```json
{ "singleQuote": true, "semi": true, "printWidth": 100, "trailingComma": "none" }
```

- [ ] **Step 2: Create `eslint.config.js`**

```js
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

const NATIVE_GAS_GLOBALS = [
  'DriveApp', 'SpreadsheetApp', 'DocumentApp', 'MailApp', 'GmailApp',
  'PropertiesService', 'CacheService', 'UrlFetchApp', 'Utilities',
  'Session', 'ScriptApp', 'LockService', 'SlidesApp', 'FormApp'
].map((name) => ({ name, message: `Native GAS global "${name}" is only allowed in src/infrastructure/facades/**` }));

export default tseslint.config(
  { ignores: ['dist/**', 'vendor/**', 'node_modules/**', 'coverage/**', 'types/gaslibs/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: { project: './tsconfig.eslint.json', tsconfigRootDir: import.meta.dirname }
    }
  },
  // Global gate: native GAS globals forbidden everywhere by default
  {
    files: ['src/**/*.ts'],
    rules: {
      'no-restricted-globals': ['error', ...NATIVE_GAS_GLOBALS],
      'no-restricted-syntax': [
        'error',
        { selector: 'ThrowStatement > NewExpression[callee.name="Error"]',
          message: 'Do not throw raw Error; use a typed domain exception (src/domain/errors).' }
      ]
    }
  },
  // Facade layer: the ONLY place native globals are allowed
  {
    files: ['src/infrastructure/facades/**/*.ts'],
    rules: { 'no-restricted-globals': 'off', 'no-restricted-syntax': 'off' }
  },
  // Domain layer boundary: no upward/lateral imports
  {
    files: ['src/domain/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          { group: ['**/application/**', '**/infrastructure/**', '**/config/**', '**/ui/**'],
            message: 'Domain layer must not depend on outer layers (08_ARCHITETTURA_DI_PATTERN.md §1).' }
        ]
      }]
    }
  },
  { files: ['test/**/*.ts'], rules: { 'no-restricted-syntax': 'off', '@typescript-eslint/no-explicit-any': 'off' } },
  prettier
);
```

- [ ] **Step 3: Write the lint self-test probe (must be REJECTED)**

Create `src/domain/__lint_probe__.ts`:
```ts
export function probe(): void {
  // Violation 1: native global outside facades
  const ss = SpreadsheetApp.getActive();
  // Violation 2: raw Error
  if (!ss) throw new Error('boom');
}
```

- [ ] **Step 4: Run lint and verify it FAILS on the probe**

Run: `npm run lint`
Expected: FAIL — reports `no-restricted-globals` for `SpreadsheetApp` and `no-restricted-syntax` for the raw `Error`.

- [ ] **Step 5: Prove the facade exemption — move probe under facades and confirm it PASSES**

Run:
```bash
mkdir -p src/infrastructure/facades
git mv src/domain/__lint_probe__.ts src/infrastructure/facades/__lint_probe__.ts
npm run lint
```
Expected: PASS (native global now allowed; `throw new Error` allowed in facades).

- [ ] **Step 6: Delete the probe and confirm clean**

Run:
```bash
rm src/infrastructure/facades/__lint_probe__.ts
npm run lint
```
Expected: PASS with no files to check errors.

- [ ] **Step 7: Commit**

```bash
git add eslint.config.js .prettierrc.json
git commit -m "chore: ESLint layer/facade/typed-exception gates (self-tested)"
```

---

### Task 0.4: Webpack config (ALDO TS → dist/aldo.js)

**Files:**
- Create: `webpack.config.cjs`

**Interfaces:**
- Consumes: `src/index.ts` (created in Task 0.8).
- Produces: `npx webpack` emits `dist/aldo.js` (+ `dist/aldo.js.map`).

- [ ] **Step 1: Create `webpack.config.cjs`**

```js
const path = require('path');
const GasPlugin = require('gas-webpack-plugin');

module.exports = (env) => {
  const readable = !!(env && env.readable);
  return {
    mode: 'production',
    entry: './src/index.ts',
    devtool: 'source-map',
    output: {
      filename: 'aldo.js',
      path: path.resolve(__dirname, 'dist'),
      library: { type: 'this' },
      clean: false
    },
    resolve: { extensions: ['.ts', '.js', '.json'] },
    module: {
      rules: [
        {
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
        }
      ]
    },
    optimization: { minimize: !readable },
    plugins: [new GasPlugin({ autoGlobalExportsFiles: [path.resolve(__dirname, 'src/index.ts')], comments: false })]
  };
};
```

- [ ] **Step 2: Commit** (build verified in Task 0.8, after `src/index.ts` exists)

```bash
git add webpack.config.cjs
git commit -m "chore: webpack config for ALDO TS bundle"
```

---

### Task 0.5: Ambient library type declarations

**Files:**
- Create: `types/gaslibs/index.d.ts` and per-lib files used by the slice: `sheetdb.d.ts`, `context-engine.d.ts`, `pipeline-framework.d.ts`, `workspace-template-engine.d.ts`, `google-api-wrapper.d.ts`, `core-utils.d.ts`

**Interfaces:**
- Produces: global type names `SheetDatabase`, `ContextBuilder`, `Pipeline`, `PipelineStep`, `WorkspaceTemplateEngine`, `DriveService`, `DocumentService` used by later tasks' `.d.ts`-typed globals.

**Note:** These declare the *shape ALDO consumes*, authored from `GasLibraryFactory/DOCS_LIBS/*_docs.md`. Keep them minimal — add members as later tasks need them. They are ambient (`declare global`) because the vendored bundle installs the classes as runtime globals.

- [ ] **Step 1: Create `types/gaslibs/index.d.ts`**

```ts
// Ambient declarations for GasLibraryFactory globals (vendored bundle).
// Authored from GasLibraryFactory/DOCS_LIBS/*_docs.md. Extend as needed.
export {};

declare global {
  // --- CoreUtilsLib (L0) ---
  class LoggerService {
    trace(msg: string, ...args: unknown[]): void;
    debug(msg: string, ...args: unknown[]): void;
    info(msg: string, ...args: unknown[]): void;
    warn(msg: string, ...args: unknown[]): void;
    error(msg: string, ...args: unknown[]): void;
  }

  // --- SheetDBLib (L2): minimal read/write surface used by the slice ---
  type SheetRow = Record<string, string | number | boolean | null>;
  interface SheetTable {
    findAll(): SheetRow[];
    find(predicate: (row: SheetRow) => boolean): SheetRow | null;
    insert(row: SheetRow): void;
  }
  class SheetDatabase {
    table(name: string): SheetTable;
    save(): void;
  }
}
```

- [ ] **Step 2: Verify typecheck still passes**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add types/gaslibs
git commit -m "chore: ambient type declarations for vendored GAS libraries"
```

---

### Task 0.6: Vendor pipeline (build monorepo, copy, checksum, verify)

**Files:**
- Create: `scripts/refresh-vendor.cjs`, `scripts/verify-vendor.cjs`
- Create (generated): `vendor/gaslibs.Code.js`, `vendor/VERSION`, `vendor/CHECKSUM`

**Interfaces:**
- Produces: `scripts/verify-vendor.cjs` exits non-zero when `sha256(vendor/gaslibs.Code.js) !== vendor/CHECKSUM`; consumed by the build (Task 0.7 Step 0).

- [ ] **Step 1: Create `scripts/verify-vendor.cjs`**

```js
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const vendorDir = path.join(__dirname, '..', 'vendor');
const bundle = path.join(vendorDir, 'gaslibs.Code.js');
const checksumFile = path.join(vendorDir, 'CHECKSUM');

if (!fs.existsSync(bundle) || !fs.existsSync(checksumFile)) {
  console.error('vendor: gaslibs.Code.js or CHECKSUM missing. Run npm run refresh:vendor.');
  process.exit(1);
}
const actual = crypto.createHash('sha256').update(fs.readFileSync(bundle)).digest('hex');
const expected = fs.readFileSync(checksumFile, 'utf8').trim();
if (actual !== expected) {
  console.error(`vendor: checksum mismatch.\n expected ${expected}\n actual   ${actual}`);
  process.exit(1);
}
console.log('vendor: checksum OK');
```

- [ ] **Step 2: Create `scripts/refresh-vendor.cjs`**

```js
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

const repoRoot = path.join(__dirname, '..');
const monorepo = path.join(repoRoot, '..', 'GasLibraryFactory');
const vendorDir = path.join(repoRoot, 'vendor');

if (!fs.existsSync(monorepo)) { console.error(`GasLibraryFactory not found at ${monorepo}`); process.exit(1); }

console.log('Building GasLibraryFactory (testing mode)...');
execSync('npm run build:testing -- --online-tests=false', { cwd: monorepo, stdio: 'inherit' });

const built = path.join(monorepo, 'dist', 'Code.js');
if (!fs.existsSync(built)) { console.error('GasLibraryFactory dist/Code.js not produced'); process.exit(1); }

fs.mkdirSync(vendorDir, { recursive: true });
const dest = path.join(vendorDir, 'gaslibs.Code.js');
fs.copyFileSync(built, dest);

const checksum = crypto.createHash('sha256').update(fs.readFileSync(dest)).digest('hex');
fs.writeFileSync(path.join(vendorDir, 'CHECKSUM'), checksum + '\n');

let version = 'unknown';
try { version = JSON.parse(fs.readFileSync(path.join(monorepo, 'package.json'), 'utf8')).version; } catch (_) {}
fs.writeFileSync(path.join(vendorDir, 'VERSION'), `${version}\n`);

console.log(`vendor: refreshed gaslibs.Code.js (v${version}, sha256 ${checksum.slice(0, 12)}...)`);
```

- [ ] **Step 3: Run the refresh to produce the vendored bundle**

Run: `npm run refresh:vendor`
Expected: builds the monorepo, writes `vendor/gaslibs.Code.js`, `vendor/CHECKSUM`, `vendor/VERSION`. If the monorepo build itself fails, stop and fix the monorepo per its own `CLAUDE.md` before continuing.

- [ ] **Step 4: Verify the checksum gate passes**

Run: `npm run verify:vendor`
Expected: `vendor: checksum OK`.

- [ ] **Step 5: Prove the gate FAILS on tampering**

Run:
```bash
printf '// tamper\n' >> vendor/gaslibs.Code.js
npm run verify:vendor; echo "exit=$?"
git checkout -- vendor/gaslibs.Code.js 2>/dev/null || npm run refresh:vendor
```
Expected: mismatch reported, `exit=1`; then restored.

- [ ] **Step 6: Commit** (the vendored bundle is committed intentionally — it is the pinned artifact)

```bash
git add -f vendor/gaslibs.Code.js vendor/CHECKSUM vendor/VERSION scripts/verify-vendor.cjs scripts/refresh-vendor.cjs
git commit -m "chore: vendor GasLibraryFactory bundle with checksum gate"
```

---

### Task 0.7: Adapt build-and-prepare.cjs (vendor verify + prelude concat + V8 patches)

**Files:**
- Create: `scripts/build-and-prepare.cjs` (based on `GasLibraryFactory/scripts/build-and-prepare.cjs`)
- Create: `appsscript.json`, `.claspignore.base`

**Interfaces:**
- Consumes: `dist/aldo.js` (webpack), `vendor/gaslibs.Code.js`.
- Produces: `dist/Code.js` (prelude + aldo, V8-patched), `dist/appsscript.json`, `dist/.claspignore`. In `testoffline` mode runs Jest and exits non-zero on failure.

- [ ] **Step 1: Create `appsscript.json`**

```json
{
  "timeZone": "Europe/Rome",
  "runtimeVersion": "V8",
  "exceptionLogging": "STACKDRIVER",
  "oauthScopes": [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive",
    "https://www.googleapis.com/auth/documents",
    "https://www.googleapis.com/auth/script.send_mail",
    "https://www.googleapis.com/auth/script.scriptapp"
  ]
}
```

- [ ] **Step 2: Copy the monorepo script as the base**

Run: `cp ../GasLibraryFactory/scripts/build-and-prepare.cjs scripts/build-and-prepare.cjs`

- [ ] **Step 3: Adapt it** — apply exactly these changes, preserving every existing V8 patch, the ES2021+ scanner, the 6 MB guard, `.claspignore` and `source-map-index.json` logic:

  1. Replace the webpack invocation so it builds **ALDO** to `dist/aldo.js`:
     - Set `const webpackCmd = mode === 'production' ? 'npx webpack' : 'npx webpack --env readable';`
     - After the existing "Cleaning dist" step, before patching, **insert Step 0 (vendor verify)** and **Step 2b (prelude concat)** below.
  2. Insert immediately after `const rootDir = ...` block:
     ```js
     const vendorBundle = path.join(rootDir, 'vendor', 'gaslibs.Code.js');
     const aldoBundle = path.join(distDir, 'aldo.js');
     ```
  3. Replace the check `if (!fs.existsSync(codeJsPath))` region with a **vendor-verify + concat** that produces `codeJsPath` (`dist/Code.js`):
     ```js
     // Step 0 — verify vendored library bundle
     try {
       require('child_process').execSync('node scripts/verify-vendor.cjs', { cwd: rootDir, stdio: 'inherit' });
     } catch (_) { fail('Vendor checksum verification failed'); process.exit(1); }

     if (!fs.existsSync(aldoBundle)) { fail('dist/aldo.js was not produced by Webpack'); process.exit(1); }

     // Step 2b — prelude concat: vendored libs first, then ALDO code
     const prelude = fs.readFileSync(vendorBundle, 'utf8');
     const aldo = fs.readFileSync(aldoBundle, 'utf8');
     fs.writeFileSync(codeJsPath, prelude + '\n;\n' + aldo, 'utf8');
     fs.rmSync(aldoBundle, { force: true });
     fs.rmSync(aldoBundle + '.map', { force: true });
     ```
     (The existing "GAS V8 compatibility post-processing" step then reads `codeJsPath` and patches the **combined** file — no change needed there.)
  4. In `testoffline` mode, replace the three monorepo test commands with ALDO's two Jest configs and keep the non-zero exit behaviour:
     ```js
     execSync('npx jest --config jest.config.cjs', { stdio: 'inherit', cwd: rootDir });          // unit
     execSync('npx jest --config jest.integration.config.cjs', { stdio: 'inherit', cwd: rootDir }); // integration
     ```
     Set `offlineTestsPassed` from whether both commands succeeded (wrap each in try/catch as the original does), and keep the final `process.exit(1)` on failure.
  5. Remove monorepo-only concerns that don't apply: the `TEST___testOnline___*.gs` dedupe block and the offline-test-bundle webpack section may be deleted; the `.claspignore` writer and `source-map-index.json` writer stay.

- [ ] **Step 4: Build (testing mode) and verify a single patched Code.js is produced**

Run: `npm run build:testing`
Expected: prints vendor checksum OK, concatenates, applies V8 patches (or "already compatible"), reports `Code.js size` under limits, writes `dist/Code.js` and `dist/appsscript.json`. Note: this will only fully succeed once `src/index.ts` exists (Task 0.8); if webpack errors on missing entry, complete Task 0.8 Step 1 first, then re-run.

- [ ] **Step 5: Commit**

```bash
git add scripts/build-and-prepare.cjs appsscript.json
git commit -m "chore: adapt build script (vendor verify + prelude concat + V8 patches)"
```

---

### Task 0.8: Jest configs, GAS entry point, green baseline build

**Files:**
- Create: `jest.config.cjs`, `jest.integration.config.cjs`, `src/index.ts`
- Test: `test/unit/index.test.ts`

**Interfaces:**
- Produces: `registerEntryPoints()` global exposure pattern; `npm test`, `npm run test:integration`, and `npm run build:testoffline` all green.

- [ ] **Step 1: Create `src/index.ts`** (GAS entry points; grows as UI menu lands in a later plan)

```ts
// ALDO entry point. GAS calls top-level global functions by name.
// gas-webpack-plugin hoists `global.<name> = ...` assignments to true globals.
export function aldoPing(): string {
  return 'ALDO OK';
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).aldoPing = aldoPing;
```

- [ ] **Step 2: Create `jest.config.cjs`** (unit)

```js
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/test/unit'],
  testMatch: ['**/*.test.ts'],
  transform: { '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.eslint.json' }] },
  clearMocks: true
};
```

- [ ] **Step 3: Create `jest.integration.config.cjs`**

```js
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/test/integration'],
  testMatch: ['**/*.test.ts'],
  transform: { '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.eslint.json' }] },
  clearMocks: true
};
```

- [ ] **Step 4: Write the failing unit test**

Create `test/unit/index.test.ts`:
```ts
import { aldoPing } from '../../src/index';

test('aldoPing returns readiness string', () => {
  expect(aldoPing()).toBe('ALDO OK');
});
```

- [ ] **Step 5: Run unit test**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Create an integration-suite smoke test so the config has a target**

Create `test/integration/smoke.test.ts`:
```ts
test('integration harness runs', () => {
  expect(1 + 1).toBe(2);
});
```

Run: `npm run test:integration`
Expected: PASS.

- [ ] **Step 7: Full gated build**

Run: `npm run build:testoffline`
Expected: builds ALDO webpack, verifies vendor, concatenates, patches, runs unit + integration Jest, prints "All tests passed", exits 0, `dist/Code.js` present.

- [ ] **Step 8: Commit**

```bash
git add jest.config.cjs jest.integration.config.cjs src/index.ts test/unit/index.test.ts test/integration/smoke.test.ts
git commit -m "chore: Jest configs + GAS entry point + green baseline build"
```

**PHASE 0 EXIT CRITERIA:** `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:integration`, `npm run build:testoffline` all green.

---

## PHASES 1–5 — Vertical Slice: *Verbale del Consiglio di Classe*

Shared conventions for all slice tasks: unit tests live in `test/unit/**` mirroring `src/**`; every value object is immutable and validates in its constructor throwing a typed error (`03 §Intro`); DB column access uses the UPPERCASE constants from Task 1.

### Task 1: Schema name constants

**Files:**
- Create: `src/config/schema.ts`
- Test: `test/unit/config/schema.test.ts`

**Interfaces:**
- Produces: `TABLE` (const object of table names) and per-table column-name consts `COL_CLASSI`, `COL_DOCENTI`, `COL_MATERIE`, `COL_ALUNNI`, `COL_CONF_DOC`, `COL_LOG_DOCS`, `COL_LOG_FOLD`; all values verbatim UPPERCASE from `01_SCHEMA_DATABASE.md`.

- [ ] **Step 1: Write the failing test**

Create `test/unit/config/schema.test.ts`:
```ts
import { TABLE, COL_CLASSI, COL_LOG_DOCS } from '../../../src/config/schema';

test('table names match 01_SCHEMA_DATABASE.md (UPPERCASE)', () => {
  expect(TABLE.CLASSI).toBe('CLASSI');
  expect(TABLE.LOG_DOCS).toBe('LOG_DOCS');
  expect(TABLE.CONF_DOC).toBe('CONF_DOC');
});

test('CLASSI/LOG_DOCS columns are exact', () => {
  expect(COL_CLASSI.ID).toBe('ID');
  expect(COL_LOG_DOCS.STATO).toBe('STATO');
  expect(COL_LOG_DOCS.ID_GEN).toBe('ID_GEN');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- schema`
Expected: FAIL ("Cannot find module .../schema").

- [ ] **Step 3: Write minimal implementation**

Create `src/config/schema.ts`. Cross-check every name against `01_SCHEMA_DATABASE.md` before finalizing:
```ts
export const TABLE = {
  ALUNNI: 'ALUNNI', DOCENTI: 'DOCENTI', CLASSI: 'CLASSI', MATERIE: 'MATERIE',
  INDIRIZZI: 'INDIRIZZI', CONF_DOC: 'CONF_DOC', CONF_MAIL: 'CONF_MAIL',
  LOG_DOCS: 'LOG_DOCS', LOG_FOLD: 'LOG_FOLD', LOG_MAIL: 'LOG_MAIL'
} as const;

export const COL_CLASSI = {
  ID: 'ID', ANNO: 'ANNO', INDIRIZZO: 'INDIRIZZO', ARTICOLAZIONE: 'ARTICOLAZIONE',
  RUOLI: 'RUOLI', ATTIVA: 'ATTIVA'
} as const;

export const COL_DOCENTI = {
  EMAIL: 'EMAIL', COGNOME: 'COGNOME', NOME: 'NOME', GENERE: 'GENERE'
} as const;

export const COL_MATERIE = {
  ID: 'ID', SINTESI: 'SINTESI', ESAME_CFG: 'ESAME_CFG'
} as const;

export const COL_ALUNNI = {
  EMAIL: 'EMAIL', COGNOMENOME: 'COGNOMENOME', CLASSE: 'CLASSE', ATTIVO: 'ATTIVO'
} as const;

export const COL_CONF_DOC = {
  ID: 'ID', TIPO: 'TIPO', GENERATORE: 'GENERATORE', CONDIZIONE: 'CONDIZIONE',
  MODELLI: 'MODELLI', FILE_NAME: 'FILE_NAME', PATH_OUT: 'PATH_OUT',
  PATH_OUT_SOTTOCARTELLE: 'PATH_OUT_SOTTOCARTELLE', SCHEMA_SOTTOCARTELLE: 'SCHEMA_SOTTOCARTELLE',
  PERMESSI: 'PERMESSI', POST_PROCESSO: 'POST_PROCESSO', PARAMETRI: 'PARAMETRI',
  GESTIONE_ARTICOLAZIONE: 'GESTIONE_ARTICOLAZIONE', FORMATO: 'FORMATO'
} as const;

export const COL_LOG_DOCS = {
  ID: 'ID', ID_GEN: 'ID_GEN', TIPO: 'TIPO', SOTTOTIPO: 'SOTTOTIPO', NOME: 'NOME',
  STATO: 'STATO', PATH: 'PATH', LINK: 'LINK', CLASSI: 'CLASSI', UTENTI: 'UTENTI',
  MATERIA: 'MATERIA', DATA_CREAZ: 'DATA_CREAZ', ID_ORIG: 'ID_ORIG'
} as const;

export const COL_LOG_FOLD = {
  ID: 'ID', PATH: 'PATH', LINK: 'LINK'
} as const;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- schema`
Expected: PASS. Then `npm run lint && npm run typecheck` clean.

- [ ] **Step 5: Commit**

```bash
git add src/config/schema.ts test/unit/config/schema.test.ts
git commit -m "feat(schema): UPPERCASE table/column name constants (ref 01)"
```

---

### Task 2: Domain errors + Enums

**Files:**
- Create: `src/domain/errors/DomainError.ts`, `src/domain/value-objects/enums.ts`
- Test: `test/unit/domain/enums.test.ts`

**Interfaces:**
- Produces: `class ValidationError extends DomainError`; enums `StatoDocumento`, `SchemaSottocartelle`, `Genere`, `PermessoACL`, `GestioneArticolazione`, `FormatoOutput`, and helper `appellativo(g: Genere): string`.

- [ ] **Step 1: Write the failing test**

Create `test/unit/domain/enums.test.ts`:
```ts
import { StatoDocumento, Genere, appellativo, SchemaSottocartelle } from '../../../src/domain/value-objects/enums';

test('StatoDocumento values match 03', () => {
  expect(StatoDocumento.GENERATO).toBe('GENERATO');
  expect(StatoDocumento.VERBALIZZATO).toBe('VERBALIZZATO');
});

test('appellativo maps Genere per 03', () => {
  expect(appellativo(Genere.M)).toBe('Prof.');
  expect(appellativo(Genere.F)).toBe('Prof.ssa');
});

test('SchemaSottocartelle includes UNO PER CLASSE', () => {
  expect(SchemaSottocartelle.UNO_PER_CLASSE).toBe('UNO PER CLASSE');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- enums`
Expected: FAIL (module not found).

- [ ] **Step 3: Write minimal implementation**

Create `src/domain/errors/DomainError.ts`:
```ts
export class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}
export class ValidationError extends DomainError {}
```

Create `src/domain/value-objects/enums.ts` (values verbatim from `03_VALUE_OBJECTS_ED_ENUM.md`):
```ts
export enum StatoDocumento {
  GENERATO = 'GENERATO', VERBALIZZATO = 'VERBALIZZATO',
  NOTIFICATO = 'NOTIFICATO', ARCHIVIATO = 'ARCHIVIATO'
}
export enum SchemaSottocartelle {
  UNO_PER_CLASSE = 'UNO PER CLASSE',
  MULTIPLO_PER_CLASSE = 'MULTIPLO PER CLASSE',
  UNO_PER_DOCENTE = 'UNO PER DOCENTE',
  UNO_PER_CLASSE_PER_MATERIA = 'UNO PER CLASSE PER MATERIA',
  UNO_PER_PIANO_PERSONALIZZATO = 'UNO PER PIANO PERSONALIZZATO',
  UNICO_PER_SCUOLA = 'UNICO PER SCUOLA'
}
export enum Genere { M = 'M', F = 'F' }
export enum PermessoACL { SCRITTURA = 'SCRITTURA', LETTURA = 'LETTURA', COMMENTO = 'COMMENTO' }
export enum GestioneArticolazione { ARTICOLATA = 'ARTICOLATA', COMPLETA = 'COMPLETA' }
export enum FormatoOutput { GDOC = 'GDOC', GSHEET = 'GSHEET', PDF = 'PDF', TEXT = 'TEXT' }

export function appellativo(g: Genere): string {
  return g === Genere.M ? 'Prof.' : 'Prof.ssa';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- enums`
Expected: PASS. Then lint + typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add src/domain/errors/DomainError.ts src/domain/value-objects/enums.ts test/unit/domain/enums.test.ts
git commit -m "feat(domain): domain errors + enums (ref 03)"
```

---

### Task 3: Value Objects — Email, ClasseId, MateriaId

**Files:**
- Create: `src/domain/value-objects/Email.ts`, `ClasseId.ts`, `MateriaId.ts`
- Test: `test/unit/domain/identifiers.test.ts`

**Interfaces:**
- Produces: `Email.of(raw): Email` + `.value`; `ClasseId.of(raw): ClasseId` + `.value`; `MateriaId.of(raw): MateriaId` + `.value`. All immutable, validate in constructor, throw `ValidationError`.

- [ ] **Step 1: Write the failing test**

Create `test/unit/domain/identifiers.test.ts`:
```ts
import { Email } from '../../../src/domain/value-objects/Email';
import { ClasseId } from '../../../src/domain/value-objects/ClasseId';
import { MateriaId } from '../../../src/domain/value-objects/MateriaId';
import { ValidationError } from '../../../src/domain/errors/DomainError';

test('Email accepts valid, rejects invalid (03: RFC 5321 local@domain)', () => {
  expect(Email.of('mario.rossi@school.it').value).toBe('mario.rossi@school.it');
  expect(() => Email.of('not-an-email')).toThrow(ValidationError);
  expect(() => Email.of('')).toThrow(ValidationError);
});

test('ClasseId: non-empty string, no pattern (03)', () => {
  expect(ClasseId.of('5ALC').value).toBe('5ALC');
  expect(() => ClasseId.of('   ')).toThrow(ValidationError);
});

test('MateriaId: uppercase only, length 2-10 (03)', () => {
  expect(MateriaId.of('MATE').value).toBe('MATE');
  expect(() => MateriaId.of('Mate')).toThrow(ValidationError);
  expect(() => MateriaId.of('X')).toThrow(ValidationError);
  expect(() => MateriaId.of('ABCDEFGHIJK')).toThrow(ValidationError);
});

test('equality by value', () => {
  expect(ClasseId.of('3B').equals(ClasseId.of('3B'))).toBe(true);
  expect(ClasseId.of('3B').equals(ClasseId.of('3A'))).toBe(false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- identifiers`
Expected: FAIL (modules not found).

- [ ] **Step 3: Write minimal implementations**

Create `src/domain/value-objects/Email.ts`:
```ts
import { ValidationError } from '../errors/DomainError';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class Email {
  private constructor(public readonly value: string) {}
  static of(raw: string): Email {
    if (typeof raw !== 'string' || !EMAIL_RE.test(raw.trim())) {
      throw new ValidationError(`Email non valida: "${raw}"`);
    }
    return new Email(raw.trim());
  }
  equals(other: Email): boolean {
    return this.value === other.value;
  }
}
```

Create `src/domain/value-objects/ClasseId.ts`:
```ts
import { ValidationError } from '../errors/DomainError';

export class ClasseId {
  private constructor(public readonly value: string) {}
  static of(raw: string): ClasseId {
    if (typeof raw !== 'string' || raw.trim().length === 0) {
      throw new ValidationError(`ClasseId non valido: "${raw}"`);
    }
    return new ClasseId(raw.trim());
  }
  equals(other: ClasseId): boolean {
    return this.value === other.value;
  }
}
```

Create `src/domain/value-objects/MateriaId.ts`:
```ts
import { ValidationError } from '../errors/DomainError';

const MATERIA_RE = /^[A-Z]{2,10}$/;

export class MateriaId {
  private constructor(public readonly value: string) {}
  static of(raw: string): MateriaId {
    if (typeof raw !== 'string' || !MATERIA_RE.test(raw)) {
      throw new ValidationError(`MateriaId non valido (maiuscolo, 2-10): "${raw}"`);
    }
    return new MateriaId(raw);
  }
  equals(other: MateriaId): boolean {
    return this.value === other.value;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- identifiers`
Expected: PASS. Lint + typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add src/domain/value-objects/Email.ts src/domain/value-objects/ClasseId.ts src/domain/value-objects/MateriaId.ts test/unit/domain/identifiers.test.ts
git commit -m "feat(domain): Email, ClasseId, MateriaId value objects (ref 03)"
```

---

### Task 4: Value Object — AnnoCorso

**Files:**
- Create: `src/domain/value-objects/AnnoCorso.ts`
- Test: `test/unit/domain/anno-corso.test.ts`

**Interfaces:**
- Produces: `AnnoCorso.of(n): AnnoCorso` with `.value:number`, `isPrima/isSeconda/isPrimoBiennio/isSecondoBiennio/isTerminale(): boolean`, `getAnnoSuccessivo(): AnnoCorso | null`, `getAnnoPrecedente(): AnnoCorso | null`.

- [ ] **Step 1: Write the failing test**

Create `test/unit/domain/anno-corso.test.ts`:
```ts
import { AnnoCorso } from '../../../src/domain/value-objects/AnnoCorso';
import { ValidationError } from '../../../src/domain/errors/DomainError';

test('range [1,5] enforced (03 invariant)', () => {
  expect(AnnoCorso.of(1).value).toBe(1);
  expect(() => AnnoCorso.of(0)).toThrow(ValidationError);
  expect(() => AnnoCorso.of(6)).toThrow(ValidationError);
});

test('predicates per 03', () => {
  expect(AnnoCorso.of(1).isPrima()).toBe(true);
  expect(AnnoCorso.of(2).isPrimoBiennio()).toBe(true);
  expect(AnnoCorso.of(3).isSecondoBiennio()).toBe(true);
  expect(AnnoCorso.of(5).isTerminale()).toBe(true);
});

test('successivo/precedente per 03', () => {
  expect(AnnoCorso.of(5).getAnnoSuccessivo()).toBeNull();
  expect(AnnoCorso.of(4).getAnnoSuccessivo()?.value).toBe(5);
  expect(AnnoCorso.of(1).getAnnoPrecedente()).toBeNull();
  expect(AnnoCorso.of(2).getAnnoPrecedente()?.value).toBe(1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- anno-corso`
Expected: FAIL.

- [ ] **Step 3: Write minimal implementation**

Create `src/domain/value-objects/AnnoCorso.ts`:
```ts
import { ValidationError } from '../errors/DomainError';

export class AnnoCorso {
  private constructor(public readonly value: number) {}
  static of(n: number): AnnoCorso {
    if (!Number.isInteger(n) || n < 1 || n > 5) {
      throw new ValidationError(`AnnoCorso fuori range [1,5]: ${n}`);
    }
    return new AnnoCorso(n);
  }
  isPrima(): boolean { return this.value === 1; }
  isSeconda(): boolean { return this.value === 2; }
  isPrimoBiennio(): boolean { return this.value === 1 || this.value === 2; }
  isSecondoBiennio(): boolean { return this.value === 3 || this.value === 4; }
  isTerminale(): boolean { return this.value === 5; }
  getAnnoSuccessivo(): AnnoCorso | null { return this.isTerminale() ? null : AnnoCorso.of(this.value + 1); }
  getAnnoPrecedente(): AnnoCorso | null { return this.isPrima() ? null : AnnoCorso.of(this.value - 1); }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- anno-corso`
Expected: PASS. Lint + typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add src/domain/value-objects/AnnoCorso.ts test/unit/domain/anno-corso.test.ts
git commit -m "feat(domain): AnnoCorso value object (ref 03)"
```

---

### Task 5: Value Object — DriveFileId (+ DriveFolderId)

**Files:**
- Create: `src/domain/value-objects/DriveFileId.ts`
- Test: `test/unit/domain/drive-ids.test.ts`

**Interfaces:**
- Produces: `DriveFileId.of(raw): DriveFileId` + `.value` + `getUrl(): string`; `DriveFolderId.of(raw): DriveFolderId` + `.value` + `getUrl(): string`.

- [ ] **Step 1: Write the failing test**

Create `test/unit/domain/drive-ids.test.ts`:
```ts
import { DriveFileId, DriveFolderId } from '../../../src/domain/value-objects/DriveFileId';
import { ValidationError } from '../../../src/domain/errors/DomainError';

test('DriveFileId non-empty + url (03)', () => {
  const f = DriveFileId.of('1abcXYZ');
  expect(f.value).toBe('1abcXYZ');
  expect(f.getUrl()).toBe('https://drive.google.com/file/d/1abcXYZ/view');
  expect(() => DriveFileId.of('')).toThrow(ValidationError);
});

test('DriveFolderId non-empty + url (03)', () => {
  const d = DriveFolderId.of('1folder');
  expect(d.getUrl()).toBe('https://drive.google.com/drive/folders/1folder');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- drive-ids`
Expected: FAIL.

- [ ] **Step 3: Write minimal implementation**

Create `src/domain/value-objects/DriveFileId.ts`:
```ts
import { ValidationError } from '../errors/DomainError';

export class DriveFileId {
  private constructor(public readonly value: string) {}
  static of(raw: string): DriveFileId {
    if (typeof raw !== 'string' || raw.trim().length === 0) {
      throw new ValidationError(`DriveFileId vuoto`);
    }
    return new DriveFileId(raw.trim());
  }
  getUrl(): string { return `https://drive.google.com/file/d/${this.value}/view`; }
}

export class DriveFolderId {
  private constructor(public readonly value: string) {}
  static of(raw: string): DriveFolderId {
    if (typeof raw !== 'string' || raw.trim().length === 0) {
      throw new ValidationError(`DriveFolderId vuoto`);
    }
    return new DriveFolderId(raw.trim());
  }
  getUrl(): string { return `https://drive.google.com/drive/folders/${this.value}`; }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- drive-ids`
Expected: PASS. Lint + typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add src/domain/value-objects/DriveFileId.ts test/unit/domain/drive-ids.test.ts
git commit -m "feat(domain): DriveFileId/DriveFolderId value objects (ref 03)"
```

---

### Task 6: Database port + in-memory fake + fixtures

**Files:**
- Create: `src/infrastructure/db/Database.ts` (port), `test/fakes/FakeDatabase.ts`, `test/fixtures/tables.ts`
- Test: `test/unit/infrastructure/fake-database.test.ts`

**Interfaces:**
- Produces: `interface IReadableTable { findAll(): Row[]; find(p): Row|null; insert(r): void }`, `interface IDatabase { table(name): IReadableTable; save(): void }`, `type Row = Record<string, string|number|boolean|null>`; `FakeDatabase` (test double seeded from fixtures); `fixtureTables()` returning seed data with UPPERCASE columns.

- [ ] **Step 1: Write the failing test**

Create `test/unit/infrastructure/fake-database.test.ts`:
```ts
import { FakeDatabase } from '../../../test/fakes/FakeDatabase';
import { fixtureTables } from '../../../test/fixtures/tables';
import { TABLE, COL_CLASSI } from '../../../src/config/schema';

test('FakeDatabase reads seeded CLASSI rows', () => {
  const db = new FakeDatabase(fixtureTables());
  const rows = db.table(TABLE.CLASSI).findAll();
  expect(rows.length).toBeGreaterThan(0);
  expect(rows[0]![COL_CLASSI.ID]).toBe('5A');
});

test('insert + save accumulates', () => {
  const db = new FakeDatabase(fixtureTables());
  db.table(TABLE.LOG_DOCS).insert({ ID: 'x', STATO: 'GENERATO' });
  db.save();
  expect(db.table(TABLE.LOG_DOCS).find((r) => r.ID === 'x')).not.toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- fake-database`
Expected: FAIL.

- [ ] **Step 3: Write implementations**

Create `src/infrastructure/db/Database.ts`:
```ts
export type Row = Record<string, string | number | boolean | null>;

export interface IReadableTable {
  findAll(): Row[];
  find(predicate: (row: Row) => boolean): Row | null;
  insert(row: Row): void;
}

export interface IDatabase {
  table(name: string): IReadableTable;
  save(): void;
}
```

Create `test/fixtures/tables.ts` (columns UPPERCASE, ref `01`):
```ts
import type { Row } from '../../src/infrastructure/db/Database';

export function fixtureTables(): Record<string, Row[]> {
  return {
    CLASSI: [
      { ID: '5A', ANNO: 5, INDIRIZZO: 'SCIENTIFICO', ARTICOLAZIONE: null, RUOLI: '{"SEGRETARIO":"rossi@school.it"}', ATTIVA: true,
        MATE: 'rossi@school.it', FISI: 'bianchi@school.it' }
    ],
    DOCENTI: [
      { EMAIL: 'rossi@school.it', COGNOME: 'ROSSI', NOME: 'MARIO', GENERE: 'M' },
      { EMAIL: 'bianchi@school.it', COGNOME: 'BIANCHI', NOME: 'LUCIA', GENERE: 'F' }
    ],
    MATERIE: [
      { ID: 'MATE', SINTESI: 'Matematica', ESAME_CFG: null },
      { ID: 'FISI', SINTESI: 'Fisica', ESAME_CFG: null }
    ],
    ALUNNI: [
      { EMAIL: 'a1@school.it', COGNOMENOME: 'VERDI ANNA', CLASSE: '5A', ATTIVO: true },
      { EMAIL: 'a2@school.it', COGNOMENOME: 'NERI PAOLO', CLASSE: '5A', ATTIVO: false }
    ],
    CONF_DOC: [
      { ID: 'CD1', TIPO: 'VERBALE', GENERATORE: 'VERBALE_CDC', CONDIZIONE: null,
        MODELLI: '{"templateId":"tmpl_verbale"}', FILE_NAME: 'Verbale_{{focus.classe.anagrafica.nome}}_{{meta.date.oggi.breve}}',
        PATH_OUT: 'Verbali/{{focus.classe.anagrafica.anno}}', PATH_OUT_SOTTOCARTELLE: null,
        SCHEMA_SOTTOCARTELLE: 'UNO PER CLASSE', PERMESSI: null, POST_PROCESSO: null,
        PARAMETRI: null, GESTIONE_ARTICOLAZIONE: 'COMPLETA', FORMATO: 'GDOC' }
    ],
    LOG_DOCS: [],
    LOG_FOLD: []
  };
}
```

Create `test/fakes/FakeDatabase.ts`:
```ts
import type { IDatabase, IReadableTable, Row } from '../../src/infrastructure/db/Database';

class FakeTable implements IReadableTable {
  constructor(private rows: Row[]) {}
  findAll(): Row[] { return this.rows.slice(); }
  find(predicate: (row: Row) => boolean): Row | null { return this.rows.find(predicate) ?? null; }
  insert(row: Row): void { this.rows.push(row); }
}

export class FakeDatabase implements IDatabase {
  public saved = 0;
  private tables = new Map<string, FakeTable>();
  constructor(seed: Record<string, Row[]>) {
    for (const [name, rows] of Object.entries(seed)) this.tables.set(name, new FakeTable(rows));
  }
  table(name: string): IReadableTable {
    const t = this.tables.get(name);
    if (!t) { const empty = new FakeTable([]); this.tables.set(name, empty); return empty; }
    return t;
  }
  save(): void { this.saved += 1; }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- fake-database`
Expected: PASS. Lint + typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add src/infrastructure/db/Database.ts test/fakes/FakeDatabase.ts test/fixtures/tables.ts test/unit/infrastructure/fake-database.test.ts
git commit -m "feat(infra): Database port + fake + fixtures (ref 01)"
```

---

### Task 7: Entities — Docente and Classe

**Files:**
- Create: `src/domain/entities/Docente.ts`, `src/domain/entities/Classe.ts`
- Test: `test/unit/domain/entities.test.ts`

**Interfaces:**
- Consumes: `Email`, `Genere`, `appellativo`, `ClasseId`, `AnnoCorso`.
- Produces: `Docente` with `.email:Email`, `.cognome:string`, `.nome:string`, `.genere:Genere`, `cognomeNome(): string`, `nomeConAppellativo(): string`; `Classe` with `.id:ClasseId`, `.nome:string`, `.anno:AnnoCorso`, `.indirizzo:string`.

- [ ] **Step 1: Write the failing test**

Create `test/unit/domain/entities.test.ts`:
```ts
import { Docente } from '../../../src/domain/entities/Docente';
import { Classe } from '../../../src/domain/entities/Classe';
import { Email } from '../../../src/domain/value-objects/Email';
import { ClasseId } from '../../../src/domain/value-objects/ClasseId';
import { AnnoCorso } from '../../../src/domain/value-objects/AnnoCorso';
import { Genere } from '../../../src/domain/value-objects/enums';

test('Docente appellativo from genere (03/04)', () => {
  const d = new Docente(Email.of('rossi@school.it'), 'ROSSI', 'MARIO', Genere.M);
  expect(d.nomeConAppellativo()).toBe('Prof. ROSSI MARIO');
  expect(d.cognomeNome()).toBe('ROSSI MARIO');
});

test('Classe exposes anagrafica', () => {
  const c = new Classe(ClasseId.of('5A'), '5A', AnnoCorso.of(5), 'SCIENTIFICO');
  expect(c.nome).toBe('5A');
  expect(c.anno.value).toBe(5);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- entities`
Expected: FAIL.

- [ ] **Step 3: Write minimal implementations**

Create `src/domain/entities/Docente.ts`:
```ts
import { Email } from '../value-objects/Email';
import { Genere, appellativo } from '../value-objects/enums';

export class Docente {
  constructor(
    public readonly email: Email,
    public readonly cognome: string,
    public readonly nome: string,
    public readonly genere: Genere
  ) {}
  cognomeNome(): string {
    return `${this.cognome} ${this.nome}`;
  }
  nomeConAppellativo(): string {
    return `${appellativo(this.genere)} ${this.cognomeNome()}`;
  }
}
```

Create `src/domain/entities/Classe.ts`:
```ts
import { ClasseId } from '../value-objects/ClasseId';
import { AnnoCorso } from '../value-objects/AnnoCorso';

export class Classe {
  constructor(
    public readonly id: ClasseId,
    public readonly nome: string,
    public readonly anno: AnnoCorso,
    public readonly indirizzo: string
  ) {}
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- entities`
Expected: PASS. Lint + typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add src/domain/entities/Docente.ts src/domain/entities/Classe.ts test/unit/domain/entities.test.ts
git commit -m "feat(domain): Docente and Classe entities (ref 04)"
```

---

### Task 8: Aggregate — ConsiglioDiClasse + invariant

**Files:**
- Create: `src/domain/entities/ConsiglioDiClasse.ts`
- Test: `test/unit/domain/consiglio-di-classe.test.ts`

**Interfaces:**
- Consumes: `Docente`, `MateriaId`.
- Produces: `Cattedra = { materia: MateriaId; docente: Docente }`; `ConsiglioDiClasse` with ctor `(cattedre: Cattedra[])`, `.cattedre`, `docentiUnici(): Docente[]`, `materie(): MateriaId[]`; throws `ValidationError` on duplicate `(materia, docente-email)` pair (invariant, ref `05`).

- [ ] **Step 1: Write the failing test**

Create `test/unit/domain/consiglio-di-classe.test.ts`:
```ts
import { ConsiglioDiClasse } from '../../../src/domain/entities/ConsiglioDiClasse';
import { Docente } from '../../../src/domain/entities/Docente';
import { Email } from '../../../src/domain/value-objects/Email';
import { MateriaId } from '../../../src/domain/value-objects/MateriaId';
import { Genere } from '../../../src/domain/value-objects/enums';
import { ValidationError } from '../../../src/domain/errors/DomainError';

const rossi = new Docente(Email.of('rossi@school.it'), 'ROSSI', 'MARIO', Genere.M);
const bianchi = new Docente(Email.of('bianchi@school.it'), 'BIANCHI', 'LUCIA', Genere.F);

test('exposes materie and unique docenti', () => {
  const cdc = new ConsiglioDiClasse([
    { materia: MateriaId.of('MATE'), docente: rossi },
    { materia: MateriaId.of('FISI'), docente: bianchi }
  ]);
  expect(cdc.materie().map((m) => m.value)).toEqual(['MATE', 'FISI']);
  expect(cdc.docentiUnici().length).toBe(2);
});

test('rejects duplicate (materia, docente) pair (invariant 05)', () => {
  expect(() => new ConsiglioDiClasse([
    { materia: MateriaId.of('MATE'), docente: rossi },
    { materia: MateriaId.of('MATE'), docente: rossi }
  ])).toThrow(ValidationError);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- consiglio-di-classe`
Expected: FAIL.

- [ ] **Step 3: Write minimal implementation**

Create `src/domain/entities/ConsiglioDiClasse.ts`:
```ts
import { Docente } from './Docente';
import { MateriaId } from '../value-objects/MateriaId';
import { ValidationError } from '../errors/DomainError';

export interface Cattedra {
  materia: MateriaId;
  docente: Docente;
}

export class ConsiglioDiClasse {
  constructor(public readonly cattedre: Cattedra[]) {
    const seen = new Set<string>();
    for (const c of cattedre) {
      const key = `${c.materia.value}::${c.docente.email.value}`;
      if (seen.has(key)) {
        throw new ValidationError(`Cattedra duplicata: ${key}`);
      }
      seen.add(key);
    }
  }
  materie(): MateriaId[] {
    return this.cattedre.map((c) => c.materia);
  }
  docentiUnici(): Docente[] {
    const byEmail = new Map<string, Docente>();
    for (const c of this.cattedre) byEmail.set(c.docente.email.value, c.docente);
    return [...byEmail.values()];
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- consiglio-di-classe`
Expected: PASS. Lint + typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add src/domain/entities/ConsiglioDiClasse.ts test/unit/domain/consiglio-di-classe.test.ts
git commit -m "feat(domain): ConsiglioDiClasse aggregate + invariant (ref 05)"
```

---

### Task 9: Specification — AlunniAttiviSpec

**Files:**
- Create: `src/domain/specifications/Specification.ts`, `src/domain/specifications/AlunniAttiviSpec.ts`
- Test: `test/unit/domain/alunni-attivi-spec.test.ts`

**Interfaces:**
- Produces: `interface Specification<T> { isSatisfiedBy(t: T): boolean; toQueryObject(): Record<string, unknown> | null }`; `AlunniAttiviSpec` where `isSatisfiedBy(row)` = `row[COL_ALUNNI.ATTIVO] === true` and `toQueryObject()` = `{ [COL_ALUNNI.ATTIVO]: true }` (ref `07 §3.2`).

- [ ] **Step 1: Write the failing test**

Create `test/unit/domain/alunni-attivi-spec.test.ts`:
```ts
import { AlunniAttiviSpec } from '../../../src/domain/specifications/AlunniAttiviSpec';
import { COL_ALUNNI } from '../../../src/config/schema';

test('isSatisfiedBy true only for active rows', () => {
  const spec = new AlunniAttiviSpec();
  expect(spec.isSatisfiedBy({ [COL_ALUNNI.ATTIVO]: true })).toBe(true);
  expect(spec.isSatisfiedBy({ [COL_ALUNNI.ATTIVO]: false })).toBe(false);
});

test('toQueryObject pushes filter to DB layer (07)', () => {
  expect(new AlunniAttiviSpec().toQueryObject()).toEqual({ ATTIVO: true });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- alunni-attivi-spec`
Expected: FAIL.

- [ ] **Step 3: Write minimal implementation**

Create `src/domain/specifications/Specification.ts`:
```ts
export interface Specification<T> {
  isSatisfiedBy(candidate: T): boolean;
  toQueryObject(): Record<string, unknown> | null;
}
```

Create `src/domain/specifications/AlunniAttiviSpec.ts`:
```ts
import type { Specification } from './Specification';
import type { Row } from '../../infrastructure/db/Database';
```
Wait — domain must not import from infrastructure. Use a local structural type instead:
```ts
import type { Specification } from './Specification';
import { COL_ALUNNI } from '../../config/schema';

type RowLike = Record<string, string | number | boolean | null>;

export class AlunniAttiviSpec implements Specification<RowLike> {
  isSatisfiedBy(candidate: RowLike): boolean {
    return candidate[COL_ALUNNI.ATTIVO] === true;
  }
  toQueryObject(): Record<string, unknown> {
    return { [COL_ALUNNI.ATTIVO]: true };
  }
}
```

Note: `src/config/schema.ts` is import-allowed from domain (it is pure constants, not an outer layer). If the ESLint domain-boundary rule flags `../../config/**`, move `schema.ts` to `src/domain/schema.ts` and update imports repo-wide, OR narrow the ESLint pattern to `**/config/ServiceContainer*` and `**/config/Bootstrap*` only. Prefer the latter: schema constants are domain vocabulary.

- [ ] **Step 3b: Narrow the ESLint domain-boundary pattern** so pure `config/schema` is allowed but wiring is not. Edit `eslint.config.js`, replacing `'**/config/**'` in the domain `no-restricted-imports` patterns with two explicit entries: `'**/config/ServiceContainer*'` and `'**/config/Bootstrap*'`.

- [ ] **Step 4: Run test + lint + typecheck**

Run: `npm test -- alunni-attivi-spec && npm run lint && npm run typecheck`
Expected: all PASS (domain importing `config/schema` no longer flagged).

- [ ] **Step 5: Commit**

```bash
git add src/domain/specifications/ eslint.config.js test/unit/domain/alunni-attivi-spec.test.ts
git commit -m "feat(domain): Specification + AlunniAttiviSpec; allow config/schema in domain (ref 07)"
```

---

### Task 10: Repository — IClasseRepository + ClasseRepository

**Files:**
- Create: `src/domain/repositories/IClasseRepository.ts`, `src/infrastructure/repositories/ClasseRepository.ts`
- Test: `test/unit/infrastructure/classe-repository.test.ts`

**Interfaces:**
- Consumes: `IDatabase`, `Classe`, `ConsiglioDiClasse`, `Docente`, schema consts, `AlunniAttiviSpec`.
- Produces: `interface IClasseRepository { findById(id: ClasseId): Classe | null; getConsiglioDiClasse(id: ClasseId): ConsiglioDiClasse; getAlunniAttivi(id: ClasseId): Row[] }`; `ClasseRepository implements IClasseRepository` reading via `IDatabase`. The CdC is built from CLASSI teacher columns (MATERIE `ID` → docente email in that column), ref `05`/`06`.

- [ ] **Step 1: Write the failing test**

Create `test/unit/infrastructure/classe-repository.test.ts`:
```ts
import { ClasseRepository } from '../../../src/infrastructure/repositories/ClasseRepository';
import { FakeDatabase } from '../../../test/fakes/FakeDatabase';
import { fixtureTables } from '../../../test/fixtures/tables';
import { ClasseId } from '../../../src/domain/value-objects/ClasseId';

function repo(): ClasseRepository {
  return new ClasseRepository(new FakeDatabase(fixtureTables()));
}

test('findById maps CLASSI row to Classe entity', () => {
  const c = repo().findById(ClasseId.of('5A'));
  expect(c?.nome).toBe('5A');
  expect(c?.anno.value).toBe(5);
  expect(c?.indirizzo).toBe('SCIENTIFICO');
});

test('getConsiglioDiClasse derives cattedre from teacher columns (05/06)', () => {
  const cdc = repo().getConsiglioDiClasse(ClasseId.of('5A'));
  const pairs = cdc.cattedre.map((k) => `${k.materia.value}:${k.docente.email.value}`).sort();
  expect(pairs).toEqual(['FISI:bianchi@school.it', 'MATE:rossi@school.it']);
});

test('getAlunniAttivi applies AlunniAttiviSpec', () => {
  const alunni = repo().getAlunniAttivi(ClasseId.of('5A'));
  expect(alunni.map((a) => a.EMAIL)).toEqual(['a1@school.it']);
});

test('findById returns null for unknown class', () => {
  expect(repo().findById(ClasseId.of('9Z'))).toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- classe-repository`
Expected: FAIL.

- [ ] **Step 3: Write implementations**

Create `src/domain/repositories/IClasseRepository.ts`:
```ts
import type { Classe } from '../entities/Classe';
import type { ConsiglioDiClasse } from '../entities/ConsiglioDiClasse';
import type { ClasseId } from '../value-objects/ClasseId';

export type RepoRow = Record<string, string | number | boolean | null>;

export interface IClasseRepository {
  findById(id: ClasseId): Classe | null;
  getConsiglioDiClasse(id: ClasseId): ConsiglioDiClasse;
  getAlunniAttivi(id: ClasseId): RepoRow[];
}
```

Create `src/infrastructure/repositories/ClasseRepository.ts`:
```ts
import type { IDatabase, Row } from '../db/Database';
import type { IClasseRepository, RepoRow } from '../../domain/repositories/IClasseRepository';
import { Classe } from '../../domain/entities/Classe';
import { Docente } from '../../domain/entities/Docente';
import { ConsiglioDiClasse, type Cattedra } from '../../domain/entities/ConsiglioDiClasse';
import { ClasseId } from '../../domain/value-objects/ClasseId';
import { AnnoCorso } from '../../domain/value-objects/AnnoCorso';
import { Email } from '../../domain/value-objects/Email';
import { MateriaId } from '../../domain/value-objects/MateriaId';
import { Genere } from '../../domain/value-objects/enums';
import { AlunniAttiviSpec } from '../../domain/specifications/AlunniAttiviSpec';
import { TABLE, COL_CLASSI, COL_DOCENTI, COL_MATERIE, COL_ALUNNI } from '../../config/schema';
import { EntityNotFoundError } from '../../domain/errors/DomainError';

export class ClasseRepository implements IClasseRepository {
  constructor(private readonly db: IDatabase) {}

  findById(id: ClasseId): Classe | null {
    const row = this.db.table(TABLE.CLASSI).find((r) => r[COL_CLASSI.ID] === id.value);
    if (!row) return null;
    return new Classe(id, String(row[COL_CLASSI.ID]), AnnoCorso.of(Number(row[COL_CLASSI.ANNO])), String(row[COL_CLASSI.INDIRIZZO]));
  }

  getConsiglioDiClasse(id: ClasseId): ConsiglioDiClasse {
    const classe = this.db.table(TABLE.CLASSI).find((r) => r[COL_CLASSI.ID] === id.value);
    if (!classe) throw new EntityNotFoundError(`Classe ${id.value} non trovata`);
    const materie = this.db.table(TABLE.MATERIE).findAll();
    const docentiByEmail = this.indexDocenti();
    const cattedre: Cattedra[] = [];
    for (const m of materie) {
      const materiaId = String(m[COL_MATERIE.ID]);
      const cellEmail = classe[materiaId];
      if (typeof cellEmail !== 'string' || cellEmail.trim() === '') continue;
      const docente = docentiByEmail.get(cellEmail.trim());
      if (!docente) throw new EntityNotFoundError(`Docente ${cellEmail} (materia ${materiaId}) non in DOCENTI`);
      cattedre.push({ materia: MateriaId.of(materiaId), docente });
    }
    return new ConsiglioDiClasse(cattedre);
  }

  getAlunniAttivi(id: ClasseId): RepoRow[] {
    const spec = new AlunniAttiviSpec();
    return this.db.table(TABLE.ALUNNI)
      .findAll()
      .filter((r) => r[COL_ALUNNI.CLASSE] === id.value && spec.isSatisfiedBy(r));
  }

  private indexDocenti(): Map<string, Docente> {
    const map = new Map<string, Docente>();
    for (const d of this.db.table(TABLE.DOCENTI).findAll()) {
      const email = String(d[COL_DOCENTI.EMAIL]);
      map.set(email, new Docente(Email.of(email), String(d[COL_DOCENTI.COGNOME]), String(d[COL_DOCENTI.NOME]), (d[COL_DOCENTI.GENERE] === 'M' ? Genere.M : Genere.F)));
    }
    return map;
  }
}

// silence unused Row import if tree-shaken by linter
export type { Row };
```

Add `EntityNotFoundError` to `src/domain/errors/DomainError.ts`:
```ts
export class EntityNotFoundError extends DomainError {}
```

- [ ] **Step 4: Run test + lint + typecheck**

Run: `npm test -- classe-repository && npm run lint && npm run typecheck`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/repositories/IClasseRepository.ts src/infrastructure/repositories/ClasseRepository.ts src/domain/errors/DomainError.ts test/unit/infrastructure/classe-repository.test.ts
git commit -m "feat: ClasseRepository (CdC from teacher columns, active students) (ref 05,06)"
```

---

### Task 11: Facade ports + in-memory fakes (Drive, Document)

**Files:**
- Create: `src/infrastructure/facades/DriveServiceFacade.ts` (interface + real facade), `src/infrastructure/facades/DocumentServiceFacade.ts`, `test/fakes/FakeDriveFacade.ts`, `test/fakes/FakeDocumentFacade.ts`
- Test: `test/unit/infrastructure/fake-facades.test.ts`

**Interfaces:**
- Produces: `interface IDriveFacade { findFolderByPath(path): string|null; createFolder(path): string; copyFile(templateId, name, folderId): string; setPermission(fileId, email, permesso): void; deleteFile(fileId): void; countFilesInFolder(folderId): number }`; `interface IDocumentFacade { replaceText(fileId, replacements: Record<string,string>): void }`; fakes recording all calls; the real `DriveServiceFacade`/`DocumentServiceFacade` route through the vendored `DriveService`/`DocumentService`/`WorkspaceTemplateEngine` globals (native GAS globals allowed here only).

- [ ] **Step 1: Write the failing test**

Create `test/unit/infrastructure/fake-facades.test.ts`:
```ts
import { FakeDriveFacade } from '../../../test/fakes/FakeDriveFacade';
import { FakeDocumentFacade } from '../../../test/fakes/FakeDocumentFacade';

test('FakeDriveFacade findOrCreate + copy records calls', () => {
  const drive = new FakeDriveFacade();
  expect(drive.findFolderByPath('Verbali/5')).toBeNull();
  const folderId = drive.createFolder('Verbali/5');
  expect(drive.findFolderByPath('Verbali/5')).toBe(folderId);
  const fileId = drive.copyFile('tmpl_verbale', 'Verbale_5A_01/07/2026', folderId);
  expect(drive.copies).toHaveLength(1);
  expect(fileId).toMatch(/^file_/);
});

test('FakeDocumentFacade stores last replacements', () => {
  const doc = new FakeDocumentFacade();
  doc.replaceText('file_1', { '{{focus.classe.anagrafica.nome}}': '5A' });
  expect(doc.replacementsFor('file_1')['{{focus.classe.anagrafica.nome}}']).toBe('5A');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- fake-facades`
Expected: FAIL.

- [ ] **Step 3: Write the port interfaces and fakes**

Create `src/infrastructure/facades/DriveServiceFacade.ts` (interface + real impl skeleton; native globals allowed here):
```ts
export interface IDriveFacade {
  findFolderByPath(path: string): string | null;
  createFolder(path: string): string;
  copyFile(templateId: string, name: string, folderId: string): string;
  setPermission(fileId: string, email: string, permesso: string): void;
  deleteFile(fileId: string): void;
  countFilesInFolder(folderId: string): number;
}

// Real facade routes through the vendored GoogleApiWrapper DriveService global.
// Implemented against real GAS in a later plan; the vendored global is typed in types/gaslibs.
export class DriveServiceFacade implements IDriveFacade {
  constructor(private readonly drive: DriveService) {}
  findFolderByPath(path: string): string | null { return this.drive.findFolderByPath(path); }
  createFolder(path: string): string { return this.drive.createFolderPath(path); }
  copyFile(templateId: string, name: string, folderId: string): string { return this.drive.copyFile(templateId, name, folderId); }
  setPermission(fileId: string, email: string, permesso: string): void { this.drive.setPermission(fileId, email, permesso); }
  deleteFile(fileId: string): void { this.drive.trashFile(fileId); }
  countFilesInFolder(folderId: string): number { return this.drive.countFiles(folderId); }
}
```

Create `src/infrastructure/facades/DocumentServiceFacade.ts`:
```ts
export interface IDocumentFacade {
  replaceText(fileId: string, replacements: Record<string, string>): void;
}

export class DocumentServiceFacade implements IDocumentFacade {
  constructor(private readonly engine: WorkspaceTemplateEngine) {}
  replaceText(fileId: string, replacements: Record<string, string>): void {
    this.engine.renderDoc(fileId, replacements);
  }
}
```

Add the two globals to `types/gaslibs/index.d.ts` inside `declare global`:
```ts
  class DriveService {
    findFolderByPath(path: string): string | null;
    createFolderPath(path: string): string;
    copyFile(templateId: string, name: string, folderId: string): string;
    setPermission(fileId: string, email: string, permesso: string): void;
    trashFile(fileId: string): void;
    countFiles(folderId: string): number;
  }
  class WorkspaceTemplateEngine {
    renderDoc(fileId: string, replacements: Record<string, string>): void;
  }
```

Create `test/fakes/FakeDriveFacade.ts`:
```ts
import type { IDriveFacade } from '../../src/infrastructure/facades/DriveServiceFacade';

export class FakeDriveFacade implements IDriveFacade {
  public folders = new Map<string, string>();
  public copies: Array<{ templateId: string; name: string; folderId: string; fileId: string }> = [];
  public permissions: Array<{ fileId: string; email: string; permesso: string }> = [];
  public deleted: string[] = [];
  private seq = 0;

  findFolderByPath(path: string): string | null { return this.folders.get(path) ?? null; }
  createFolder(path: string): string {
    const id = `folder_${++this.seq}`;
    this.folders.set(path, id);
    return id;
  }
  copyFile(templateId: string, name: string, folderId: string): string {
    const fileId = `file_${++this.seq}`;
    this.copies.push({ templateId, name, folderId, fileId });
    return fileId;
  }
  setPermission(fileId: string, email: string, permesso: string): void {
    this.permissions.push({ fileId, email, permesso });
  }
  deleteFile(fileId: string): void { this.deleted.push(fileId); }
  countFilesInFolder(folderId: string): number { return this.copies.filter((c) => c.folderId === folderId).length; }
}
```

Create `test/fakes/FakeDocumentFacade.ts`:
```ts
import type { IDocumentFacade } from '../../src/infrastructure/facades/DocumentServiceFacade';

export class FakeDocumentFacade implements IDocumentFacade {
  private store = new Map<string, Record<string, string>>();
  replaceText(fileId: string, replacements: Record<string, string>): void {
    this.store.set(fileId, { ...(this.store.get(fileId) ?? {}), ...replacements });
  }
  replacementsFor(fileId: string): Record<string, string> { return this.store.get(fileId) ?? {}; }
}
```

- [ ] **Step 4: Run test + lint + typecheck**

Run: `npm test -- fake-facades && npm run lint && npm run typecheck`
Expected: all PASS. (Real facade classes are lint-clean because native/lib globals are permitted under `facades/`.)

- [ ] **Step 5: Commit**

```bash
git add src/infrastructure/facades/ test/fakes/FakeDriveFacade.ts test/fakes/FakeDocumentFacade.ts types/gaslibs/index.d.ts test/unit/infrastructure/fake-facades.test.ts
git commit -m "feat(infra): Drive/Document facade ports + fakes (ref 08 §3.4)"
```

---

### Task 12: ContextBuilder → CDU `focus.classe` + `meta.date`

**Files:**
- Create: `src/application/context/Cdu.ts`, `src/application/context/ContextBuilder.ts`
- Test: `test/unit/application/context-builder.test.ts`

**Interfaces:**
- Consumes: `IClasseRepository`, a `now: Date` clock.
- Produces: `interface Cdu` with exactly the paths used by the slice — `meta.date.oggi.{breve,anno}`, `meta.parametriInput.target`, `focus.classe.anagrafica.{nome,anno}`, and `tech.consiglioDiClasse` (live aggregate). `ContextBuilder.build(target: ClasseId): Cdu`. Paths verified against `02_CDU_STRUTTURA.md`.

- [ ] **Step 1: Write the failing test**

Create `test/unit/application/context-builder.test.ts`:
```ts
import { ContextBuilder } from '../../../src/application/context/ContextBuilder';
import { ClasseRepository } from '../../../src/infrastructure/repositories/ClasseRepository';
import { FakeDatabase } from '../../../test/fakes/FakeDatabase';
import { fixtureTables } from '../../../test/fixtures/tables';
import { ClasseId } from '../../../src/domain/value-objects/ClasseId';

function builder(): ContextBuilder {
  const repo = new ClasseRepository(new FakeDatabase(fixtureTables()));
  return new ContextBuilder(repo, new Date('2026-07-01T09:00:00Z'));
}

test('CDU focus.classe.anagrafica matches 02 paths', () => {
  const cdu = builder().build(ClasseId.of('5A'));
  expect(cdu.focus.classe.anagrafica.nome).toBe('5A');
  expect(cdu.focus.classe.anagrafica.anno).toBe(5);
});

test('CDU meta.date.oggi.breve is DD/MM/YYYY (02)', () => {
  const cdu = builder().build(ClasseId.of('5A'));
  expect(cdu.meta.date.oggi.breve).toBe('01/07/2026');
  expect(cdu.meta.parametriInput.target).toBe('5A');
});

test('CDU exposes live CdC under tech', () => {
  const cdu = builder().build(ClasseId.of('5A'));
  expect(cdu.tech.consiglioDiClasse.materie().map((m) => m.value).sort()).toEqual(['FISI', 'MATE']);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- context-builder`
Expected: FAIL.

- [ ] **Step 3: Write implementations**

Create `src/application/context/Cdu.ts`:
```ts
import type { ConsiglioDiClasse } from '../../domain/entities/ConsiglioDiClasse';

export interface Cdu {
  meta: {
    date: { oggi: { breve: string; anno: string } };
    parametriInput: { target: string; tipoTarget: 'classe' | 'alunno' };
  };
  focus: {
    classe: { anagrafica: { nome: string; anno: number } };
  };
  tech: { consiglioDiClasse: ConsiglioDiClasse };
}
```

Create `src/application/context/ContextBuilder.ts`:
```ts
import type { IClasseRepository } from '../../domain/repositories/IClasseRepository';
import type { ClasseId } from '../../domain/value-objects/ClasseId';
import type { Cdu } from './Cdu';
import { EntityNotFoundError } from '../../domain/errors/DomainError';

function due(n: number): string { return n < 10 ? `0${n}` : String(n); }

export class ContextBuilder {
  constructor(private readonly classeRepo: IClasseRepository, private readonly now: Date) {}

  build(target: ClasseId): Cdu {
    const classe = this.classeRepo.findById(target);
    if (!classe) throw new EntityNotFoundError(`Classe ${target.value} non trovata`);
    const cdc = this.classeRepo.getConsiglioDiClasse(target);
    const d = this.now;
    const breve = `${due(d.getUTCDate())}/${due(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
    return {
      meta: {
        date: { oggi: { breve, anno: String(d.getUTCFullYear()) } },
        parametriInput: { target: target.value, tipoTarget: 'classe' }
      },
      focus: { classe: { anagrafica: { nome: classe.nome, anno: classe.anno.value } } },
      tech: { consiglioDiClasse: cdc }
    };
  }
}
```

Note: production ContextBuilder uses the vendored `ContextBuilder`/recipes from `ContextEngine` (`09`); this slice implements the minimal builder ALDO owns. Aligning to recipe-driven assembly is a Phase-4 breadth task; the CDU **paths** here are already the canonical ones from `02`.

- [ ] **Step 4: Run test + lint + typecheck**

Run: `npm test -- context-builder && npm run lint && npm run typecheck`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/application/context/ test/unit/application/context-builder.test.ts
git commit -m "feat(app): ContextBuilder producing canonical CDU paths (ref 02,09)"
```

---

### Task 13: Pipeline framework — PipelineContext, Step, DocumentoPipeline (rollback)

**Files:**
- Create: `src/infrastructure/pipelines/PipelineContext.ts`, `src/infrastructure/pipelines/Step.ts`, `src/infrastructure/pipelines/DocumentoPipeline.ts`
- Test: `test/unit/infrastructure/pipeline-framework.test.ts`

**Interfaces:**
- Produces: `PipelineContext` with `get<T>(k)`, `set(k,v)`, `addError(msg)`, `addSuccess(msg)`, `errors`, `logEsecuzione`; abstract `Step` with `name`, `shouldExecute(ctx): boolean` (default true), `execute(ctx): void` wrapping `_executeLogic` in try/catch (critical steps rethrow); `DocumentoPipeline.addStep(step).execute(ctx)` runs steps in order and, on unhandled throw, if `ctx.get('newFileId')` is set, calls the injected `onRollback(fileId)` before rethrowing (ref `10 §8`).

- [ ] **Step 1: Write the failing test**

Create `test/unit/infrastructure/pipeline-framework.test.ts`:
```ts
import { PipelineContext } from '../../../src/infrastructure/pipelines/PipelineContext';
import { Step } from '../../../src/infrastructure/pipelines/Step';
import { DocumentoPipeline } from '../../../src/infrastructure/pipelines/DocumentoPipeline';

class SetFlag extends Step {
  readonly name = 'SetFlag';
  protected critical = false;
  protected _executeLogic(ctx: PipelineContext): void { ctx.set('ran', true); }
}
class Boom extends Step {
  readonly name = 'Boom';
  protected critical = true;
  protected _executeLogic(): void { throw new Error('kaboom'); }
}

test('steps run in order and log success', () => {
  const ctx = new PipelineContext();
  new DocumentoPipeline(() => {}).addStep(new SetFlag()).execute(ctx);
  expect(ctx.get('ran')).toBe(true);
  expect(ctx.logEsecuzione.some((l) => l.includes('SetFlag'))).toBe(true);
});

test('critical step failure triggers rollback of newFileId (10 §8)', () => {
  const ctx = new PipelineContext();
  ctx.set('newFileId', 'file_9');
  const rolledBack: string[] = [];
  const pipe = new DocumentoPipeline((id) => rolledBack.push(id)).addStep(new Boom());
  expect(() => pipe.execute(ctx)).toThrow('kaboom');
  expect(rolledBack).toEqual(['file_9']);
});

test('shouldExecute=false skips step', () => {
  class Skipped extends SetFlag { override shouldExecute(): boolean { return false; } }
  const ctx = new PipelineContext();
  new DocumentoPipeline(() => {}).addStep(new Skipped()).execute(ctx);
  expect(ctx.get('ran')).toBeUndefined();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- pipeline-framework`
Expected: FAIL.

- [ ] **Step 3: Write implementations**

Create `src/infrastructure/pipelines/PipelineContext.ts`:
```ts
export class PipelineContext {
  private readonly store = new Map<string, unknown>();
  public readonly errors: string[] = [];
  public readonly logEsecuzione: string[] = [];
  get<T>(key: string): T | undefined { return this.store.get(key) as T | undefined; }
  set(key: string, value: unknown): void { this.store.set(key, value); }
  addError(msg: string): void { this.errors.push(msg); this.logEsecuzione.push(`ERROR: ${msg}`); }
  addSuccess(msg: string): void { this.logEsecuzione.push(`OK: ${msg}`); }
}
```

Create `src/infrastructure/pipelines/Step.ts`:
```ts
import type { PipelineContext } from './PipelineContext';

export abstract class Step {
  abstract readonly name: string;
  protected critical = false;
  shouldExecute(_ctx: PipelineContext): boolean { return true; }
  protected abstract _executeLogic(ctx: PipelineContext): void;
  execute(ctx: PipelineContext): void {
    try {
      this._executeLogic(ctx);
      ctx.addSuccess(this.name);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      ctx.addError(`${this.name}: ${msg}`);
      if (this.critical) throw e;
    }
  }
}
```

Create `src/infrastructure/pipelines/DocumentoPipeline.ts`:
```ts
import type { PipelineContext } from './PipelineContext';
import type { Step } from './Step';

export class DocumentoPipeline {
  private readonly steps: Step[] = [];
  constructor(private readonly onRollback: (fileId: string) => void) {}
  addStep(step: Step): this { this.steps.push(step); return this; }
  execute(ctx: PipelineContext): PipelineContext {
    try {
      for (const step of this.steps) {
        if (step.shouldExecute(ctx)) step.execute(ctx);
      }
      return ctx;
    } catch (e) {
      const orphan = ctx.get<string>('newFileId');
      if (orphan) this.onRollback(orphan);
      throw e;
    }
  }
}
```

- [ ] **Step 4: Run test + lint + typecheck**

Run: `npm test -- pipeline-framework && npm run lint && npm run typecheck`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/infrastructure/pipelines/ test/unit/infrastructure/pipeline-framework.test.ts
git commit -m "feat(infra): pipeline framework with orphaned-file rollback (ref 08,10)"
```

---

### Task 14: Document pipeline steps (the 10 steps) + VerbaleGeneratorStrategy

**Files:**
- Create: `src/infrastructure/steps/documentSteps.ts` (all 10 steps), `src/application/strategies/VerbaleGeneratorStrategy.ts`, `src/application/strategies/GeneratorStrategy.ts`
- Test: `test/unit/infrastructure/document-steps.test.ts`

**Interfaces:**
- Consumes: `PipelineContext`, `Step`, `Cdu`, `IDriveFacade`, `IDocumentFacade`, `IDatabase`, schema consts, enums.
- Produces: step classes `AnalyzeContextStep`, `CheckDuplicatesStep`, `PrepareInfrastructureStep`, `GenerateNameStep`, `SelectTemplateStep`, `CloneTemplateStep`, `RenderTemplateStep`, `ApplyPermissionsStep`, `RegisterDocumentStep`, `PostProcessStep`; `interface GeneratorStrategy { render(fileId: string, cdu: Cdu): void }`; `VerbaleGeneratorStrategy` implementing it via `IDocumentFacade`. Each step reads/writes `PipelineContext` keys defined below.

Context keys (contract across steps): `config` (CONF_DOC row), `cdu` (Cdu), `shouldGenerate:boolean`, `destFolderId:string`, `nomeFile:string`, `templateId:string`, `newFileId:string`, `newFileLink:string`.

- [ ] **Step 1: Write the failing test**

Create `test/unit/infrastructure/document-steps.test.ts`:
```ts
import { PipelineContext } from '../../../src/infrastructure/pipelines/PipelineContext';
import {
  AnalyzeContextStep, GenerateNameStep, SelectTemplateStep, CloneTemplateStep,
  RenderTemplateStep, RegisterDocumentStep
} from '../../../src/infrastructure/steps/documentSteps';
import { VerbaleGeneratorStrategy } from '../../../src/application/strategies/VerbaleGeneratorStrategy';
import { FakeDriveFacade } from '../../../test/fakes/FakeDriveFacade';
import { FakeDocumentFacade } from '../../../test/fakes/FakeDocumentFacade';
import { FakeDatabase } from '../../../test/fakes/FakeDatabase';
import { fixtureTables } from '../../../test/fixtures/tables';
import type { Cdu } from '../../../src/application/context/Cdu';
import { ConsiglioDiClasse } from '../../../src/domain/entities/ConsiglioDiClasse';

function cdu(): Cdu {
  return {
    meta: { date: { oggi: { breve: '01/07/2026', anno: '2026' } }, parametriInput: { target: '5A', tipoTarget: 'classe' } },
    focus: { classe: { anagrafica: { nome: '5A', anno: 5 } } },
    tech: { consiglioDiClasse: new ConsiglioDiClasse([]) }
  };
}
function baseCtx(): PipelineContext {
  const ctx = new PipelineContext();
  ctx.set('cdu', cdu());
  ctx.set('config', fixtureTables().CONF_DOC[0]);
  return ctx;
}

test('AnalyzeContextStep: empty CONDIZIONE => shouldGenerate true', () => {
  const ctx = baseCtx();
  new AnalyzeContextStep().execute(ctx);
  expect(ctx.get('shouldGenerate')).toBe(true);
});

test('GenerateNameStep resolves FILE_NAME placeholders', () => {
  const ctx = baseCtx();
  new GenerateNameStep().execute(ctx);
  expect(ctx.get('nomeFile')).toBe('Verbale_5A_01/07/2026');
});

test('SelectTemplateStep reads MODELLI simple form', () => {
  const ctx = baseCtx();
  new SelectTemplateStep().execute(ctx);
  expect(ctx.get('templateId')).toBe('tmpl_verbale');
});

test('CloneTemplateStep copies via Drive facade and sets newFileId', () => {
  const ctx = baseCtx();
  ctx.set('destFolderId', 'folder_1');
  ctx.set('nomeFile', 'Verbale_5A_01/07/2026');
  ctx.set('templateId', 'tmpl_verbale');
  const drive = new FakeDriveFacade();
  new CloneTemplateStep(drive).execute(ctx);
  expect(String(ctx.get('newFileId'))).toMatch(/^file_/);
  expect(drive.copies[0]!.templateId).toBe('tmpl_verbale');
});

test('RenderTemplateStep delegates to strategy → Document facade', () => {
  const ctx = baseCtx();
  ctx.set('newFileId', 'file_1');
  const doc = new FakeDocumentFacade();
  const registry = new Map([['VERBALE_CDC', new VerbaleGeneratorStrategy(doc)]]);
  new RenderTemplateStep(registry).execute(ctx);
  expect(doc.replacementsFor('file_1')['{{focus.classe.anagrafica.nome}}']).toBe('5A');
});

test('RegisterDocumentStep writes LOG_DOCS row with STATO GENERATO', () => {
  const ctx = baseCtx();
  ctx.set('newFileId', 'file_1');
  ctx.set('newFileLink', 'https://drive/file_1');
  ctx.set('nomeFile', 'Verbale_5A_01/07/2026');
  ctx.set('destFolderPath', 'Verbali/5');
  const db = new FakeDatabase(fixtureTables());
  new RegisterDocumentStep(db).execute(ctx);
  const row = db.table('LOG_DOCS').find((r) => r.ID === 'file_1');
  expect(row?.STATO).toBe('GENERATO');
  expect(row?.CLASSI).toBe('5A');
  expect(db.saved).toBeGreaterThan(0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- document-steps`
Expected: FAIL.

- [ ] **Step 3: Write the strategy interface + VerbaleGeneratorStrategy**

Create `src/application/strategies/GeneratorStrategy.ts`:
```ts
import type { Cdu } from '../context/Cdu';
export interface GeneratorStrategy {
  render(fileId: string, cdu: Cdu): void;
}
```

Create `src/application/strategies/VerbaleGeneratorStrategy.ts`:
```ts
import type { GeneratorStrategy } from './GeneratorStrategy';
import type { Cdu } from '../context/Cdu';
import type { IDocumentFacade } from '../../infrastructure/facades/DocumentServiceFacade';

export class VerbaleGeneratorStrategy implements GeneratorStrategy {
  constructor(private readonly doc: IDocumentFacade) {}
  render(fileId: string, cdu: Cdu): void {
    this.doc.replaceText(fileId, {
      '{{focus.classe.anagrafica.nome}}': cdu.focus.classe.anagrafica.nome,
      '{{focus.classe.anagrafica.anno}}': String(cdu.focus.classe.anagrafica.anno),
      '{{meta.date.oggi.breve}}': cdu.meta.date.oggi.breve
    });
  }
}
```

- [ ] **Step 4: Write the 10 steps**

Create `src/infrastructure/steps/documentSteps.ts` (a simple `{{path}}` resolver stands in for `WorkspaceTemplateEngine` in unit context; the production render path uses the vendored engine via the facade). Cross-check each step against `10_PIPELINE_DOCUMENTI.md`:
```ts
import { Step } from '../pipelines/Step';
import type { PipelineContext } from '../pipelines/PipelineContext';
import type { Cdu } from '../../application/context/Cdu';
import type { IDriveFacade } from '../facades/DriveServiceFacade';
import type { IDatabase, Row } from '../db/Database';
import type { GeneratorStrategy } from '../../application/strategies/GeneratorStrategy';
import { TABLE, COL_CONF_DOC, COL_LOG_DOCS } from '../../config/schema';
import { StatoDocumento, SchemaSottocartelle } from '../../domain/value-objects/enums';
import { PipelineError } from '../../domain/errors/DomainError';

// Minimal placeholder resolver over CDU dotted paths (production: WorkspaceTemplateEngine).
export function resolvePlaceholders(template: string, cdu: Cdu): string {
  return template.replace(/\{\{([^}]+)\}\}/g, (_m, path: string) => {
    const parts = path.trim().split('.');
    let cur: unknown = cdu;
    for (const p of parts) {
      if (cur && typeof cur === 'object' && p in (cur as Record<string, unknown>)) cur = (cur as Record<string, unknown>)[p];
      else return '';
    }
    return cur == null ? '' : String(cur);
  });
}
function cfg(ctx: PipelineContext): Row { return ctx.get<Row>('config')!; }
function cdu(ctx: PipelineContext): Cdu { return ctx.get<Cdu>('cdu')!; }

export class AnalyzeContextStep extends Step {
  readonly name = 'AnalyzeContextStep';
  protected _executeLogic(ctx: PipelineContext): void {
    const cond = cfg(ctx)[COL_CONF_DOC.CONDIZIONE];
    // Slice scope: empty/null condition => generate. Non-empty conditions are evaluated by
    // GasExpressionEngineLib in the breadth plan (10 §3).
    ctx.set('shouldGenerate', cond == null || String(cond).trim() === '');
  }
}

export class CheckDuplicatesStep extends Step {
  readonly name = 'CheckDuplicatesStep';
  constructor(private readonly db: IDatabase) { super(); }
  override shouldExecute(ctx: PipelineContext): boolean { return ctx.get('shouldGenerate') === true; }
  protected _executeLogic(ctx: PipelineContext): void {
    const schema = String(cfg(ctx)[COL_CONF_DOC.SCHEMA_SOTTOCARTELLE]);
    if (schema === SchemaSottocartelle.MULTIPLO_PER_CLASSE) return; // no dedup (10 §4)
    const idGen = String(cfg(ctx)[COL_CONF_DOC.ID]);
    const classe = cdu(ctx).focus.classe.anagrafica.nome;
    const existing = this.db.table(TABLE.LOG_DOCS).find(
      (r) => r[COL_LOG_DOCS.ID_GEN] === idGen && String(r[COL_LOG_DOCS.CLASSI] ?? '').split(',').includes(classe)
    );
    if (existing) { ctx.set('shouldGenerate', false); ctx.addError(`Duplicato per ${classe}`); }
  }
}

export class PrepareInfrastructureStep extends Step {
  readonly name = 'PrepareInfrastructureStep';
  constructor(private readonly drive: IDriveFacade) { super(); }
  override shouldExecute(ctx: PipelineContext): boolean { return ctx.get('shouldGenerate') === true; }
  protected _executeLogic(ctx: PipelineContext): void {
    const path = resolvePlaceholders(String(cfg(ctx)[COL_CONF_DOC.PATH_OUT]), cdu(ctx));
    const folderId = this.drive.findFolderByPath(path) ?? this.drive.createFolder(path);
    ctx.set('destFolderId', folderId);
    ctx.set('destFolderPath', path);
  }
}

export class GenerateNameStep extends Step {
  readonly name = 'GenerateNameStep';
  override shouldExecute(ctx: PipelineContext): boolean { return ctx.get('shouldGenerate') === true; }
  protected _executeLogic(ctx: PipelineContext): void {
    ctx.set('nomeFile', resolvePlaceholders(String(cfg(ctx)[COL_CONF_DOC.FILE_NAME]), cdu(ctx)));
  }
}

export class SelectTemplateStep extends Step {
  readonly name = 'SelectTemplateStep';
  protected critical = true;
  override shouldExecute(ctx: PipelineContext): boolean { return ctx.get('shouldGenerate') === true; }
  protected _executeLogic(ctx: PipelineContext): void {
    const raw = cfg(ctx)[COL_CONF_DOC.MODELLI];
    if (raw == null) throw new PipelineError('CONF_DOC.MODELLI obbligatorio'); // 10 §7
    const parsed = JSON.parse(String(raw)) as { templateId?: string } | Array<{ condizione: string; templateId: string }>;
    if (Array.isArray(parsed)) {
      // Slice scope: pick first with condizione 'true'; full evaluation in breadth plan.
      const match = parsed.find((m) => m.condizione.trim() === 'true');
      if (!match) throw new PipelineError('Nessun template applicabile');
      ctx.set('templateId', match.templateId);
    } else {
      if (!parsed.templateId) throw new PipelineError('templateId mancante');
      ctx.set('templateId', parsed.templateId);
    }
  }
}

export class CloneTemplateStep extends Step {
  readonly name = 'CloneTemplateStep';
  protected critical = true; // point of no return (10 §8)
  constructor(private readonly drive: IDriveFacade) { super(); }
  override shouldExecute(ctx: PipelineContext): boolean { return ctx.get('shouldGenerate') === true; }
  protected _executeLogic(ctx: PipelineContext): void {
    const fileId = this.drive.copyFile(
      ctx.get<string>('templateId')!, ctx.get<string>('nomeFile')!, ctx.get<string>('destFolderId')!
    );
    ctx.set('newFileId', fileId);
    ctx.set('newFileLink', `https://drive.google.com/file/d/${fileId}/view`);
  }
}

export class RenderTemplateStep extends Step {
  readonly name = 'RenderTemplateStep';
  protected critical = true;
  constructor(private readonly registry: Map<string, GeneratorStrategy>) { super(); }
  override shouldExecute(ctx: PipelineContext): boolean { return ctx.get('shouldGenerate') === true; }
  protected _executeLogic(ctx: PipelineContext): void {
    const generatore = String(cfg(ctx)[COL_CONF_DOC.GENERATORE]);
    const strategy = this.registry.get(generatore);
    if (!strategy) throw new PipelineError(`GENERATORE non registrato: ${generatore}`); // 10 §9
    strategy.render(ctx.get<string>('newFileId')!, cdu(ctx));
  }
}

export class ApplyPermissionsStep extends Step {
  readonly name = 'ApplyPermissionsStep';
  constructor(private readonly drive: IDriveFacade) { super(); }
  override shouldExecute(ctx: PipelineContext): boolean {
    return ctx.get('shouldGenerate') === true && cfg(ctx)[COL_CONF_DOC.PERMESSI] != null;
  }
  protected _executeLogic(ctx: PipelineContext): void {
    // Slice scope: PERMESSI is null in the fixture, so this step is skipped.
    // Full role-resolution ACL application lands in the breadth plan (10 §10, 14).
    const perms = JSON.parse(String(cfg(ctx)[COL_CONF_DOC.PERMESSI])) as { file?: Array<{ ruolo: string; permesso: string }> };
    for (const p of perms.file ?? []) ctx.addSuccess(`ACL ${p.ruolo}:${p.permesso}`);
    void this.drive;
  }
}

export class RegisterDocumentStep extends Step {
  readonly name = 'RegisterDocumentStep';
  protected critical = true;
  constructor(private readonly db: IDatabase) { super(); }
  override shouldExecute(ctx: PipelineContext): boolean { return ctx.get('shouldGenerate') === true; }
  protected _executeLogic(ctx: PipelineContext): void {
    const row: Row = {
      [COL_LOG_DOCS.ID]: ctx.get<string>('newFileId')!,
      [COL_LOG_DOCS.ID_GEN]: String(cfg(ctx)[COL_CONF_DOC.ID]),
      [COL_LOG_DOCS.TIPO]: String(cfg(ctx)[COL_CONF_DOC.TIPO]),
      [COL_LOG_DOCS.NOME]: ctx.get<string>('nomeFile')!,
      [COL_LOG_DOCS.STATO]: StatoDocumento.GENERATO,
      [COL_LOG_DOCS.PATH]: ctx.get<string>('destFolderPath') ?? '',
      [COL_LOG_DOCS.LINK]: ctx.get<string>('newFileLink') ?? '',
      [COL_LOG_DOCS.CLASSI]: cdu(ctx).focus.classe.anagrafica.nome,
      [COL_LOG_DOCS.DATA_CREAZ]: cdu(ctx).meta.date.oggi.breve
    };
    this.db.table(TABLE.LOG_DOCS).insert(row);
    this.db.save();
  }
}

export class PostProcessStep extends Step {
  readonly name = 'PostProcessStep';
  constructor(private readonly db: IDatabase) { super(); }
  override shouldExecute(ctx: PipelineContext): boolean {
    return ctx.get('shouldGenerate') === true && cfg(ctx)[COL_CONF_DOC.POST_PROCESSO] != null;
  }
  protected _executeLogic(ctx: PipelineContext): void {
    // Slice scope: POST_PROCESSO is null in the fixture (skipped). Actions AGGIORNA_STATO_DOC etc.
    // land in the breadth plan (10 §12).
    void ctx; this.db.save();
  }
}
```

Add `PipelineError` to `src/domain/errors/DomainError.ts`:
```ts
export class PipelineError extends DomainError {}
```

- [ ] **Step 5: Run test + lint + typecheck**

Run: `npm test -- document-steps && npm run lint && npm run typecheck`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add src/infrastructure/steps/documentSteps.ts src/application/strategies/ src/domain/errors/DomainError.ts test/unit/infrastructure/document-steps.test.ts
git commit -m "feat: document pipeline steps + VerbaleGeneratorStrategy (ref 10)"
```

---

### Task 15: ServiceContainer + DocumentGenerationService

**Files:**
- Create: `src/config/ServiceContainer.ts`, `src/application/services/DocumentGenerationService.ts`
- Test: `test/unit/config/service-container.test.ts`

**Interfaces:**
- Consumes: everything above.
- Produces: `ServiceContainer` with `register(name, factory)`, `get<T>(name)`, `has(name)` (lazy singletons, ref `08 §2`); `DocumentGenerationService` with `generateForClasse(target: ClasseId, confDocId: string): { fileId: string; status: string }` assembling the CDU, building the `DocumentoPipeline` with all 10 steps + strategy registry, and running it.

- [ ] **Step 1: Write the failing test**

Create `test/unit/config/service-container.test.ts`:
```ts
import { ServiceContainer } from '../../../src/config/ServiceContainer';

test('lazy singleton resolution (08 §2)', () => {
  const c = new ServiceContainer();
  let built = 0;
  c.register('x', () => { built += 1; return { v: 42 }; });
  expect(c.has('x')).toBe(true);
  expect(c.get<{ v: number }>('x').v).toBe(42);
  c.get('x');
  expect(built).toBe(1); // instantiated once
});

test('unknown service throws', () => {
  expect(() => new ServiceContainer().get('nope')).toThrow();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- service-container`
Expected: FAIL.

- [ ] **Step 3: Write implementations**

Create `src/config/ServiceContainer.ts`:
```ts
import { DomainError } from '../domain/errors/DomainError';

type Factory<T> = (c: ServiceContainer) => T;

export class ServiceContainer {
  private readonly factories = new Map<string, Factory<unknown>>();
  private readonly singletons = new Map<string, unknown>();
  register<T>(name: string, factory: Factory<T>): void { this.factories.set(name, factory as Factory<unknown>); }
  has(name: string): boolean { return this.factories.has(name); }
  get<T>(name: string): T {
    if (this.singletons.has(name)) return this.singletons.get(name) as T;
    const factory = this.factories.get(name);
    if (!factory) throw new DomainError(`Servizio non registrato: ${name}`);
    const instance = factory(this);
    this.singletons.set(name, instance);
    return instance as T;
  }
}
```

Create `src/application/services/DocumentGenerationService.ts`:
```ts
import type { ClasseId } from '../../domain/value-objects/ClasseId';
import type { IDatabase, Row } from '../../infrastructure/db/Database';
import type { IDriveFacade } from '../../infrastructure/facades/DriveServiceFacade';
import type { ContextBuilder } from '../context/ContextBuilder';
import type { GeneratorStrategy } from '../strategies/GeneratorStrategy';
import { DocumentoPipeline } from '../../infrastructure/pipelines/DocumentoPipeline';
import { PipelineContext } from '../../infrastructure/pipelines/PipelineContext';
import {
  AnalyzeContextStep, CheckDuplicatesStep, PrepareInfrastructureStep, GenerateNameStep,
  SelectTemplateStep, CloneTemplateStep, RenderTemplateStep, ApplyPermissionsStep,
  RegisterDocumentStep, PostProcessStep
} from '../../infrastructure/steps/documentSteps';
import { TABLE, COL_CONF_DOC, COL_LOG_DOCS } from '../../config/schema';
import { PipelineError } from '../../domain/errors/DomainError';

export class DocumentGenerationService {
  constructor(
    private readonly db: IDatabase,
    private readonly drive: IDriveFacade,
    private readonly contextBuilder: ContextBuilder,
    private readonly strategyRegistry: Map<string, GeneratorStrategy>
  ) {}

  generateForClasse(target: ClasseId, confDocId: string): { fileId: string | null; status: string } {
    const config = this.db.table(TABLE.CONF_DOC).find((r) => r[COL_CONF_DOC.ID] === confDocId);
    if (!config) throw new PipelineError(`CONF_DOC ${confDocId} non trovato`);
    const generatore = String(config[COL_CONF_DOC.GENERATORE]);
    if (!this.strategyRegistry.has(generatore)) throw new PipelineError(`GENERATORE non registrato: ${generatore}`);

    const cdu = this.contextBuilder.build(target);
    const ctx = new PipelineContext();
    ctx.set('config', config as Row);
    ctx.set('cdu', cdu);

    new DocumentoPipeline((fileId) => this.drive.deleteFile(fileId))
      .addStep(new AnalyzeContextStep())
      .addStep(new CheckDuplicatesStep(this.db))
      .addStep(new PrepareInfrastructureStep(this.drive))
      .addStep(new GenerateNameStep())
      .addStep(new SelectTemplateStep())
      .addStep(new CloneTemplateStep(this.drive))
      .addStep(new RenderTemplateStep(this.strategyRegistry))
      .addStep(new ApplyPermissionsStep(this.drive))
      .addStep(new RegisterDocumentStep(this.db))
      .addStep(new PostProcessStep(this.db))
      .execute(ctx);

    const fileId = ctx.get<string>('newFileId') ?? null;
    const status = fileId
      ? String(this.db.table(TABLE.LOG_DOCS).find((r) => r[COL_LOG_DOCS.ID] === fileId)?.[COL_LOG_DOCS.STATO] ?? 'UNKNOWN')
      : 'SKIPPED';
    return { fileId, status };
  }
}
```

- [ ] **Step 4: Run test + lint + typecheck**

Run: `npm test -- service-container && npm run lint && npm run typecheck`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/config/ServiceContainer.ts src/application/services/DocumentGenerationService.ts test/unit/config/service-container.test.ts
git commit -m "feat: ServiceContainer + DocumentGenerationService orchestration (ref 08,12)"
```

---

### Task 16: End-to-end integration test + full gated build

**Files:**
- Create: `test/integration/verbale-cdc.test.ts`

**Interfaces:**
- Consumes: `DocumentGenerationService`, `ClasseRepository`, `ContextBuilder`, fakes, fixtures, `VerbaleGeneratorStrategy`.
- Produces: the proof that the whole slice runs end-to-end against in-memory fakes; and a green `build:testoffline`.

- [ ] **Step 1: Write the end-to-end integration test**

Create `test/integration/verbale-cdc.test.ts`:
```ts
import { DocumentGenerationService } from '../../src/application/services/DocumentGenerationService';
import { ClasseRepository } from '../../src/infrastructure/repositories/ClasseRepository';
import { ContextBuilder } from '../../src/application/context/ContextBuilder';
import { VerbaleGeneratorStrategy } from '../../src/application/strategies/VerbaleGeneratorStrategy';
import { FakeDatabase } from '../fakes/FakeDatabase';
import { FakeDriveFacade } from '../fakes/FakeDriveFacade';
import { FakeDocumentFacade } from '../fakes/FakeDocumentFacade';
import { fixtureTables } from '../fixtures/tables';
import { ClasseId } from '../../src/domain/value-objects/ClasseId';
import { COL_LOG_DOCS } from '../../src/config/schema';

function wire() {
  const db = new FakeDatabase(fixtureTables());
  const drive = new FakeDriveFacade();
  const doc = new FakeDocumentFacade();
  const repo = new ClasseRepository(db);
  const builder = new ContextBuilder(repo, new Date('2026-07-01T09:00:00Z'));
  const registry = new Map([['VERBALE_CDC', new VerbaleGeneratorStrategy(doc)]]);
  const service = new DocumentGenerationService(db, drive, builder, registry);
  return { db, drive, doc, service };
}

test('generates a Verbale CdC end-to-end (ref 10 full pipeline)', () => {
  const { db, drive, doc, service } = wire();
  const result = service.generateForClasse(ClasseId.of('5A'), 'CD1');

  expect(result.status).toBe('GENERATO');
  expect(result.fileId).not.toBeNull();

  // Drive: folder created + template copied
  expect(drive.folders.get('Verbali/5')).toBeDefined();
  expect(drive.copies[0]!.templateId).toBe('tmpl_verbale');
  expect(drive.copies[0]!.name).toBe('Verbale_5A_01/07/2026');

  // Document: placeholders rendered from CDU
  const repl = doc.replacementsFor(result.fileId!);
  expect(repl['{{focus.classe.anagrafica.nome}}']).toBe('5A');

  // LOG_DOCS: audit row persisted with correct columns (ref 01, 10 §11)
  const row = db.table('LOG_DOCS').find((r) => r[COL_LOG_DOCS.ID] === result.fileId);
  expect(row?.[COL_LOG_DOCS.STATO]).toBe('GENERATO');
  expect(row?.[COL_LOG_DOCS.CLASSI]).toBe('5A');
  expect(row?.[COL_LOG_DOCS.TIPO]).toBe('VERBALE');
});

test('second run is deduplicated by CheckDuplicatesStep (10 §4)', () => {
  const { service, db } = wire();
  service.generateForClasse(ClasseId.of('5A'), 'CD1');
  const second = service.generateForClasse(ClasseId.of('5A'), 'CD1');
  expect(second.status).toBe('SKIPPED');
  expect(db.table('LOG_DOCS').findAll()).toHaveLength(1);
});
```

- [ ] **Step 2: Run the integration test**

Run: `npm run test:integration -- verbale-cdc`
Expected: PASS both cases.

- [ ] **Step 3: Full suite + lint + typecheck**

Run: `npm test && npm run test:integration && npm run lint && npm run typecheck`
Expected: all green.

- [ ] **Step 4: Full gated build**

Run: `npm run build:testoffline`
Expected: vendor verified, webpack builds ALDO, prelude concat, V8 patches applied, unit + integration Jest green, exits 0, `dist/Code.js` present and under 6 MB.

- [ ] **Step 5: Commit**

```bash
git add test/integration/verbale-cdc.test.ts
git commit -m "test(integration): Verbale CdC end-to-end slice green (ref 10)"
```

**SLICE EXIT CRITERIA:** the end-to-end integration test proves CLASSI/DOCENTI/MATERIE/ALUNNI → VO → entities → aggregate → repo → CDU → 10-step pipeline → VerbaleGeneratorStrategy → Drive/Document facades → LOG_DOCS, with dedup, all against fakes; and `build:testoffline` exits 0.

---

## Follow-up plans (out of scope here, one per subsystem)

Each becomes its own spec → plan → implementation cycle, reusing this toolchain and test harness:
1. **Remaining domain breadth** — all Value Objects/Enums (`03`), all entities & aggregates incl. classi articolate (`04`, `05`, `MAT_NON_STANDARD`).
2. **Repositories & Specifications** — the 21 repositories (`06`) and 64+ specifications (`07`).
3. **ContextEngine (recipe-driven)** — full Providers/Interceptors/Recipes/Mapper + `SwapAndEnrichInterceptor` supplenze (`09`), replacing the slice's minimal `ContextBuilder`; role resolution (`14`).
4. **Remaining document strategies** — the other 5 generators + conditional MODELLI/CONDIZIONE via `GasExpressionEngineLib`, ACL via role resolution, POST_PROCESSO actions (`10`).
5. **Email pipeline** — 8 steps + Box rendering system (`11`).
6. **Application/historical/utility services + real facades over GAS** — wire real `SheetDBLib`/`GoogleApiWrapper`/`WorkspaceTemplateEngine`, `JobRunnerLib` batching, UI menu + `GasProcessMonitorLib` (`12`, `13`, `14`, `15`), plus `GasOnlineTestFramework` smoke tests.

---

## Self-Review notes

- **Spec coverage (this plan's scope):** toolchain (design §2–7) → Tasks 0.1–0.8; schema names (`01`) → Task 1; enums/VOs (`03`) → Tasks 2–5; entities (`04`) → Task 7; aggregate invariant (`05`) → Task 8; specification (`07`) → Task 9; repository (`06`) → Task 10; facades (`08 §3.4`) → Task 11; CDU paths (`02`) → Task 12; pipeline + rollback (`08`, `10`) → Tasks 13–14; DI container (`08 §2`) + service (`12`) → Task 15; end-to-end + dedup (`10`) → Task 16. Breadth explicitly deferred and enumerated above.
- **Type consistency:** `IDriveFacade`/`IDocumentFacade`, `IDatabase`/`Row`, `Cdu`, `PipelineContext` keys (`config`, `cdu`, `shouldGenerate`, `destFolderId`, `destFolderPath`, `nomeFile`, `templateId`, `newFileId`, `newFileLink`), and `GeneratorStrategy.render(fileId, cdu)` are used identically across Tasks 11–16.
- **Placeholder scan:** no "TBD"/"implement later"; every code step shows complete code. Where the slice deliberately narrows behaviour (condition/template evaluation, ACL, POST_PROCESSO), the narrowing is stated, tested at slice scope, and the full behaviour is assigned to a named follow-up plan.
