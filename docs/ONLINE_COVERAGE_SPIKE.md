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
