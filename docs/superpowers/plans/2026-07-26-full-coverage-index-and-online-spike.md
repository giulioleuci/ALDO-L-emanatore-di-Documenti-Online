# Full-Coverage Index, Doc Updates, and Online-Coverage Spike Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Register a new codebase-memory-mcp index covering ALDO app code + every test tier + GasLibraryFactory, document it in the three agent-instruction files, and spike whether the online GAS test suite can produce real istanbul coverage numbers.

**Architecture:** Task 1 is a single MCP tool call (no source changes). Task 2 is an identical three-file doc edit. Task 3 adds istanbul instrumentation to the online-only webpack bundle (never the production `Code.js`/`EntryPoints.js` bundles), a `dumpOnlineCoverage()` GAS entry point to retrieve the resulting `globalThis.__coverage__` map via `Logger.log`, and a standalone Node script to turn that dumped JSON into a text coverage summary — with a findings doc recording the go/no-go once a live run confirms whether `babel-plugin-istanbul`'s injected code executes correctly under the GAS V8 sandbox (this repo's headless dev environment cannot run live GAS itself, so that last confirmation is a manual step for the user).

**Tech Stack:** `@codebase-memory-mcp` MCP tools, webpack 5 + babel-loader (existing pipeline), `babel-plugin-istanbul`, `istanbul-lib-coverage`, `istanbul-lib-report`, `istanbul-reports`, Jest (`ts-jest`) for new unit/build tests.

## Global Constraints

- New index name: `aldo-full-coverage` (spec §1). Existing indexes (`home-giulio-Desktop-ALDO-implementing`, `home-giulio-Desktop-ALDO-implementing-GasLibraryFactory`, `aldo-onlinetests-debug`) are left untouched.
- Doc edit is byte-identical across `CLAUDE.md`, `AGENTS.md`, `GEMINI.md` (spec §2).
- No `coverageThreshold` is added to any Jest config — tracked target only, not a CI gate (spec §3.2).
- Istanbul instrumentation must apply ONLY to the `onlinetests` webpack entry (`dist/OnlineTests.js`), never to `coreConfig` (`aldo-core.js`/`Code.js`) or `entrypointsConfig` (`EntryPoints.js`) — those ship to production and must stay uninstrumented (spec §3.5).
- Never edit `dist/*` directly (project-wide constraint, `CLAUDE.md`).
- Native GAS globals (`Logger`, etc.) may only be touched the way existing `src/onlinetests/index.ts` code already does (direct `Logger.log`/`globalThis` assignment is a sanctioned exception documented there — this file already does this for `runOnlineTests`/`runE2eScenarios`; follow the same pattern, don't route through a facade).

---

### Task 1: Register the `aldo-full-coverage` codebase-memory-mcp index

**Files:** none (MCP tool state only).

**Interfaces:**
- Consumes: `mcp__codebase-memory-mcp__index_repository` (params: `repo_path`, `name`, `mode`), `mcp__codebase-memory-mcp__index_status` (params: `project`).
- Produces: an indexed project named `aldo-full-coverage` that later tasks/plans may query with `search_graph`/`query_graph`/`get_architecture`.

- [ ] **Step 1: Run the indexing call**

Call `mcp__codebase-memory-mcp__index_repository` with:
```json
{
  "repo_path": "/home/giulio/Desktop/ALDO implementing",
  "name": "aldo-full-coverage",
  "mode": "full"
}
```

- [ ] **Step 2: Verify it landed**

Call `mcp__codebase-memory-mcp__index_status` with `{"project": "aldo-full-coverage"}`.
Expected: status `"ready"`, with a node/edge count in the same order of magnitude as the existing `home-giulio-Desktop-ALDO-implementing` index (3200-3300 nodes) — since it roots at the same repo path, but should also reflect `test/**` and `GasLibraryFactory/**` content per the earlier baseline check (those existing indexes already share this same root, so the count should be comparable, not smaller).

No commit — this task has no repository file changes.

---

### Task 2: Document the new index in CLAUDE.md, AGENTS.md, GEMINI.md

**Files:**
- Modify: `CLAUDE.md:33-37`
- Modify: `AGENTS.md` (identical "Codebase Analysis via codebase-memory-mcp" section as CLAUDE.md)
- Modify: `GEMINI.md` (identical "Codebase Analysis via codebase-memory-mcp" section as CLAUDE.md)

**Interfaces:** none (documentation only).

- [ ] **Step 1: Edit CLAUDE.md**

Find this block (lines 33-37):
```markdown
There are these indexed project graphs you can query:

- `"home-giulio-Desktop-ALDO-implementing-GasLibraryFactory"`: Contains only the library code. Use this to discover reusable functions and extension points.
- `"home-giulio-Desktop-ALDO-implementing"`: Contains both ALDO and GasLibraryFactory. Use this to map how ALDO consumes the library.
- `"aldo-onlinetests-debug"`: Contains both ALDO and GasLibraryFactory, and test online for ALDO.
```

Replace with:
```markdown
There are these indexed project graphs you can query:

- `"home-giulio-Desktop-ALDO-implementing-GasLibraryFactory"`: Contains only the library code. Use this to discover reusable functions and extension points.
- `"home-giulio-Desktop-ALDO-implementing"`: Contains both ALDO and GasLibraryFactory. Use this to map how ALDO consumes the library.
- `"aldo-onlinetests-debug"`: Contains both ALDO and GasLibraryFactory, and test online for ALDO.
- `"aldo-full-coverage"`: Contains ALDO application code, all test tiers (unit, integration, build, online), and GasLibraryFactory in one graph. Use this for cross-cutting coverage and dead-code analysis spanning the whole test surface.
```

- [ ] **Step 2: Apply the identical edit to AGENTS.md**

Same find/replace as Step 1, applied to `AGENTS.md`.

- [ ] **Step 3: Apply the identical edit to GEMINI.md**

Same find/replace as Step 1, applied to `GEMINI.md`.

- [ ] **Step 4: Diff-check all three files match**

Run: `diff <(sed -n '/There are these indexed/,/aldo-full-coverage/p' CLAUDE.md) <(sed -n '/There are these indexed/,/aldo-full-coverage/p' AGENTS.md)` and the same for `GEMINI.md`.
Expected: no output (files identical in this section).

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md AGENTS.md GEMINI.md
git commit -m "docs: document aldo-full-coverage codebase-memory-mcp index"
```

---

### Task 3: Online-coverage instrumentation spike

**Files:**
- Modify: `webpack.config.cjs`
- Modify: `src/onlinetests/index.ts`
- Modify: `test/unit/onlinetests/index.test.ts`
- Modify: `test/build/online-mode.smoke.test.ts`
- Create: `scripts/report-online-coverage.cjs`
- Create: `test/build/report-online-coverage.test.ts`
- Create: `docs/ONLINE_COVERAGE_SPIKE.md`
- Modify: `package.json` (devDependencies only)

**Interfaces:**
- Consumes: nothing from Tasks 1-2.
- Produces: `dumpOnlineCoverage()` (exported from `src/onlinetests/index.ts`, also assigned to `globalThis.dumpOnlineCoverage` as a GAS Run-dropdown entry point) — no params, no return, calls `Logger.log(JSON.stringify(coverage))`. `scripts/report-online-coverage.cjs` — CLI script, `node scripts/report-online-coverage.cjs <path-to-raw-coverage.json>`, prints an istanbul text-summary to stdout.

- [ ] **Step 1: Add the istanbul devDependencies**

```bash
npm install --save-dev babel-plugin-istanbul istanbul-lib-coverage istanbul-lib-report istanbul-reports
```

Expected: `package.json`'s `devDependencies` gains all four packages; `package-lock.json` updates.

- [ ] **Step 2: Parameterize the babel rule in webpack.config.cjs and instrument only the onlinetests entry**

Current (lines 5-20):
```js
const babelRule = {
  test: /\.ts$/,
  exclude: [/node_modules/, /\.test\.ts$/],
  use: {
    loader: 'babel-loader',
    options: {
      presets: [
        ['@babel/preset-env', { targets: { chrome: '80' }, modules: false }],
        ['@babel/preset-typescript', {}]
      ],
      // GAS V8's sandboxed parser rejects native class-field syntax even though
      // Chrome 80 supports it natively, so force the transform regardless of target.
      plugins: [['@babel/plugin-transform-class-properties', { loose: false }]]
    }
  }
};
```

Replace with:
```js
// `instrument: true` is used ONLY for the onlinetests webpack entry (see onlinetestsConfig
// below) — the online-coverage spike (docs/superpowers/specs/2026-07-26-test-completion-
// coverage-index-design.md §3.5) needs istanbul counters inside dist/OnlineTests.js so a live
// GAS run can report real coverage. coreConfig/entrypointsConfig (production Code.js/
// EntryPoints.js) must never be instrumented.
function makeBabelRule(instrument) {
  return {
    test: /\.ts$/,
    exclude: [/node_modules/, /\.test\.ts$/],
    use: {
      loader: 'babel-loader',
      options: {
        presets: [
          ['@babel/preset-env', { targets: { chrome: '80' }, modules: false }],
          ['@babel/preset-typescript', {}]
        ],
        // GAS V8's sandboxed parser rejects native class-field syntax even though
        // Chrome 80 supports it natively, so force the transform regardless of target.
        plugins: [
          ['@babel/plugin-transform-class-properties', { loose: false }],
          ...(instrument ? [['istanbul', { extension: ['.ts'] }]] : [])
        ]
      }
    }
  };
}

const babelRule = makeBabelRule(false);
const instrumentedBabelRule = makeBabelRule(true);
```

Then find (in `onlinetestsConfig`, currently sharing `babelRule`):
```js
  const onlinetestsConfig = {
    name: 'onlinetests',
    mode: 'production',
    entry: './src/onlinetests/index.ts',
    devtool: 'source-map',
    output: {
      filename: 'OnlineTests.js',
      path: path.resolve(__dirname, 'dist'),
      clean: false,
      iife: false
    },
    resolve: { extensions: ['.ts', '.js', '.json'] },
    module: { rules: [babelRule] },
    optimization: { minimize: false }
  };
```

Replace its `module` line with:
```js
    module: { rules: [instrumentedBabelRule] },
```

(`coreConfig` and `entrypointsConfig` keep `module: { rules: [babelRule] }` unchanged.)

- [ ] **Step 3: Build online mode and verify instrumentation landed only in OnlineTests.js**

Run: `npm run build:online`
Expected: build succeeds (exit 0).

Then run:
```bash
grep -c '__coverage__' dist/OnlineTests.js
grep -c '__coverage__' dist/Code.js
```
Expected: first command prints a number > 0; second command prints `0`.

- [ ] **Step 4: Write the failing unit test for `dumpOnlineCoverage`**

In `test/unit/onlinetests/index.test.ts`, add `dumpOnlineCoverage` to the existing import from `'../../../src/onlinetests/index'` (currently `import { executeOnlineTests } from '../../../src/onlinetests/index';`) so it reads:
```ts
import { executeOnlineTests, dumpOnlineCoverage } from '../../../src/onlinetests/index';
```

Then append this new `describe` block at the end of the file:
```ts
describe('dumpOnlineCoverage', () => {
  afterEach(() => {
    delete (globalThis as { __coverage__?: unknown }).__coverage__;
  });

  it('logs the istanbul coverage map when instrumentation populated globalThis.__coverage__', () => {
    const logSpy = jest.spyOn(Logger, 'log').mockImplementation(() => {});
    (globalThis as { __coverage__?: unknown }).__coverage__ = { 'src/foo.ts': { s: { '0': 1 } } };

    dumpOnlineCoverage();

    expect(logSpy).toHaveBeenCalledWith(JSON.stringify({ 'src/foo.ts': { s: { '0': 1 } } }));
    logSpy.mockRestore();
  });

  it('logs an empty object when the bundle was not built with instrumentation', () => {
    const logSpy = jest.spyOn(Logger, 'log').mockImplementation(() => {});

    dumpOnlineCoverage();

    expect(logSpy).toHaveBeenCalledWith('{}');
    logSpy.mockRestore();
  });
});
```

- [ ] **Step 5: Run the test to verify it fails**

Run: `npx jest --config jest.config.cjs test/unit/onlinetests/index.test.ts -t "dumpOnlineCoverage"`
Expected: FAIL — `dumpOnlineCoverage` is not exported from `src/onlinetests/index.ts`.

- [ ] **Step 6: Implement `dumpOnlineCoverage`**

In `src/onlinetests/index.ts`, immediately after the existing `runOnlineTests`/`globalThis.runOnlineTests` block (after line 120, before the `E2eTestDeps` interface), add:
```ts
/**
 * GAS Run-dropdown entry point for the online-coverage spike (docs/superpowers/specs/
 * 2026-07-26-test-completion-coverage-index-design.md §3.5): logs whatever istanbul coverage map
 * `babel-plugin-istanbul` attached to `globalThis.__coverage__` while this bundle ran. Empty
 * object when the bundle wasn't built with instrumentation enabled (i.e. any mode other than
 * `--mode=online` after the webpack.config.cjs instrumentation change).
 */
export function dumpOnlineCoverage(): void {
  const coverage = (globalThis as { __coverage__?: unknown }).__coverage__ ?? {};
  Logger.log(JSON.stringify(coverage));
}

/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access */
(globalThis as any).dumpOnlineCoverage = dumpOnlineCoverage;
/* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access */
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `npx jest --config jest.config.cjs test/unit/onlinetests/index.test.ts -t "dumpOnlineCoverage"`
Expected: PASS (2 tests).

- [ ] **Step 8: Extend the build smoke test to assert instrumentation scoping**

In `test/build/online-mode.smoke.test.ts`, after the existing `expect(codeJs).not.toEqual(onlineTestsJs);` line, add:
```ts
    expect(onlineTestsJs).toContain('__coverage__');
    expect(codeJs).not.toContain('__coverage__');
```

- [ ] **Step 9: Run the build smoke test to verify it passes**

Run: `npx jest --config jest.build.config.cjs test/build/online-mode.smoke.test.ts`
Expected: PASS.

- [ ] **Step 10: Write the failing test for the report script**

Create `test/build/report-online-coverage.test.ts`:
```ts
import { execFileSync } from 'child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';

describe('scripts/report-online-coverage.cjs', () => {
  it('prints an istanbul text-summary computed from a raw coverage JSON dump', () => {
    const dir = mkdtempSync(join(tmpdir(), 'online-coverage-'));
    const rawCoveragePath = join(dir, 'raw-coverage.json');
    const raw = {
      '/repo/src/foo.ts': {
        path: '/repo/src/foo.ts',
        statementMap: {
          '0': { start: { line: 1, column: 0 }, end: { line: 1, column: 10 } },
          '1': { start: { line: 2, column: 0 }, end: { line: 2, column: 10 } }
        },
        fnMap: {},
        branchMap: {},
        s: { '0': 1, '1': 0 },
        f: {},
        b: {}
      }
    };
    writeFileSync(rawCoveragePath, JSON.stringify(raw), 'utf8');

    const output = execFileSync(
      'node',
      [resolve(__dirname, '../../scripts/report-online-coverage.cjs'), rawCoveragePath],
      { cwd: resolve(__dirname, '../..'), encoding: 'utf8' }
    );

    expect(output).toContain('Statements');
    expect(output).toContain('50%');

    rmSync(dir, { recursive: true, force: true });
  });

  it('exits non-zero with a usage message when no path argument is given', () => {
    expect(() =>
      execFileSync('node', [resolve(__dirname, '../../scripts/report-online-coverage.cjs')], {
        cwd: resolve(__dirname, '../..'),
        encoding: 'utf8'
      })
    ).toThrow();
  });
});
```

- [ ] **Step 11: Run the test to verify it fails**

Run: `npx jest --config jest.build.config.cjs test/build/report-online-coverage.test.ts`
Expected: FAIL — `scripts/report-online-coverage.cjs` does not exist.

- [ ] **Step 12: Implement the report script**

Create `scripts/report-online-coverage.cjs`:
```js
#!/usr/bin/env node
// Turns a raw istanbul coverage map (dumped via Logger.log(JSON.stringify(globalThis.__coverage__))
// from a live GAS `dumpOnlineCoverage()` run) into a text-summary coverage report. See
// docs/ONLINE_COVERAGE_SPIKE.md for the manual live-run procedure that produces the input file.
const fs = require('fs');
const path = require('path');
const libCoverage = require('istanbul-lib-coverage');
const libReport = require('istanbul-lib-report');
const reports = require('istanbul-reports');

const inputPath = process.argv[2];
if (!inputPath) {
  console.error('Usage: node scripts/report-online-coverage.cjs <raw-coverage.json>');
  process.exit(1);
}

const raw = JSON.parse(fs.readFileSync(path.resolve(inputPath), 'utf8'));
const coverageMap = libCoverage.createCoverageMap(raw);
const context = libReport.createContext({
  dir: path.join(__dirname, '..', 'coverage-online'),
  coverageMap
});
const report = reports.create('text-summary');
report.execute(context);
```

- [ ] **Step 13: Run the test to verify it passes**

Run: `npx jest --config jest.build.config.cjs test/build/report-online-coverage.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 14: Write the findings doc with the manual live-validation procedure**

Create `docs/ONLINE_COVERAGE_SPIKE.md`:
```markdown
# Online-coverage instrumentation spike

Status: **PENDING live-GAS validation** — this dev environment cannot run live GAS
(no OAuth/browser), so the mechanism below is wired and unit/build-tested, but nobody has
yet confirmed `babel-plugin-istanbul`'s injected code executes correctly inside the real
GAS V8 sandbox (open question: does its `new Function('return this')()` call succeed there,
or does the sandbox restrict dynamic `Function` construction?). Fill in the "Result" section
below after a live run and update this file's Status line to GO or NO-GO.

## What's wired

- `webpack.config.cjs`: `dist/OnlineTests.js` is built with `babel-plugin-istanbul` (via
  `instrumentedBabelRule`); `dist/Code.js` and `dist/EntryPoints.js` are never instrumented.
- `src/onlinetests/index.ts` exports `dumpOnlineCoverage()`, also reachable from the Apps
  Script editor's Run dropdown, which logs `globalThis.__coverage__` as JSON via `Logger.log`.
- `scripts/report-online-coverage.cjs` turns a saved copy of that JSON into a text coverage
  summary.

## Manual validation procedure

1. `npm run push:online` (builds with instrumentation and pushes `Code.js` + `OnlineTests.js`
   to the linked Apps Script project).
2. In the Apps Script editor, run `runOnlineTests` (or `runE2eScenarios`) from the Run dropdown
   once, then run `dumpOnlineCoverage` from the same dropdown.
3. Open **View > Logs**, copy the single JSON line it printed.
4. Paste it into a local file, e.g. `/tmp/raw-coverage.json`.
5. Run `node scripts/report-online-coverage.cjs /tmp/raw-coverage.json` and read the printed
   text-summary.

## Result

_(fill in after step 5 above)_

- Did `dumpOnlineCoverage` log a non-empty `{}`? yes/no
- If yes: paste the text-summary output here and record GO — proceed to extend
  `src/onlinetests/checks/` per spec §3.5.2 using this as the real coverage metric.
- If no (empty object, or a live GAS error before reaching the log): record NO-GO plus the
  exact error, and proceed with spec §3.5.3's scenario-coverage checklist fallback instead.
```

- [ ] **Step 15: Run the full offline suite**

Run: `npm test && npm run test:build`
Expected: all suites PASS.

- [ ] **Step 16: Commit**

```bash
git add webpack.config.cjs src/onlinetests/index.ts test/unit/onlinetests/index.test.ts \
  test/build/online-mode.smoke.test.ts scripts/report-online-coverage.cjs \
  test/build/report-online-coverage.test.ts docs/ONLINE_COVERAGE_SPIKE.md \
  package.json package-lock.json
git commit -m "feat(onlinetests): spike istanbul coverage instrumentation for the online GAS bundle"
```

---

## After this plan

Phase A (offline branch-coverage closing across CDU providers, cattedra/substitute resolution,
articulated classes, domain specs, misc infra) and the rest of Phase B (extending
`src/onlinetests/checks/` once Task 3's live-validation result is known) are each their own
dedicated plan, written immediately before that group's work starts — see
`docs/superpowers/specs/2026-07-26-test-completion-coverage-index-design.md` §3.4-3.5 for the
prioritized group list and the go/no-go branching.
