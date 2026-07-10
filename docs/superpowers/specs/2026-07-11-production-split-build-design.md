# Production split build: Code.js + EntryPoints.js

## Problem

`npm run build:production` currently produces one `dist/Code.js` file: the
vendored GasLibraryFactory bundle (readable, built by `refresh-vendor.cjs` in
GasLibraryFactory's `testing` mode) concatenated with a single minified,
comment-free ALDO bundle (`dist/aldo.js`, built from `src/index.ts`). All six
GAS entry points — including the document-generation and email-sending
launchers — live inside that one minified file, with no human-readable place
to manually trigger generation/sending or add a one-click launcher for a
specific `CONF_DOC`/`CONF_MAIL` pattern.

## Goal

`npm run build:production` (mode `production`) must produce, in this order:

1. GasLibraryFactory code — minified, no comments.
2. ALDO application code, excluding the document-generation and
   email-sending launchers — minified, no comments.
3. ALDO document-generation/email-sending entry points — **not** minified,
   **with** comments, extendable with one function per document/email
   pattern.

No test files (offline or online) may appear in the output. `testing` and
`testoffline` modes keep producing today's single, fully-readable `Code.js`.

## Source split

- **`src/index.ts` (core)** keeps `aldoPing`, `onOpen`,
  `menu_avvioImportazioni`, `resumeJob`. It gains additional
  `(globalThis as any).X = X` assignments so `initAldo`, `creaJobRunner`,
  `avviaGenerazioneDataDriven`, `avviaInvioNotificheDataDriven`,
  `menuGenerazioneDocumenti`, `menuComunicazioniEmail`, and `GasUiFacade`
  become true GAS globals (not just internal webpack module bindings),
  because `EntryPoints.ts` needs to call them without importing their
  implementation.
- **`src/entrypoints/EntryPoints.ts` (new)** gets `menu_avvioGenerazioneDocumenti`
  and `menu_avvioComunicazioniEmail` moved in verbatim (JSDoc included), plus
  two commented example non-interactive launchers:
  `generaPagelle()` (document generation, hardcoded `CONF_DOC` id
  `'PAGELLE_1Q'`) and `inviaNotificaAssenze()` (email sending, hardcoded
  `CONF_MAIL` id `'ASSENZE_SETTIMANALI'`), each with a comment explaining
  these are templates to copy/adapt per real config row, and a block comment
  at the top of the "non-interactive launchers" section documenting the
  copy-paste pattern.
- `EntryPoints.ts` never imports runtime code from core. It types the globals
  it calls via `declare global { function ...(): ...; }` blocks, using
  `import type` only for parameter/return types (the same pattern already
  used in `src/presentation/Menu.ts`), so nothing pulls Bootstrap's
  dependency graph into this bundle.

GAS shares one global namespace across every script file in a project, so
`onOpen` (core, minified) referencing `menu_avvioGenerazioneDocumenti`
(EntryPoints.js, readable) by name — as `costruisciMenu`'s string-based menu
registration already does — continues to work unchanged.

## Webpack

`webpack.config.cjs` changes from exporting one config to exporting an array
of two:

- **`core`**: entry `./src/index.ts` → `dist/aldo-core.js`. Minimizer
  explicitly sets `terserOptions.format.comments: false` and
  `extractComments: false` (no `.LICENSE.txt` side file, no comments
  survive). `GasPlugin({ comments: false })` as today.
- **`entrypoints`**: entry `./src/entrypoints/EntryPoints.ts` →
  `dist/EntryPoints.js`. Always `optimization.minimize: false` regardless of
  `--env readable`/mode. `GasPlugin({ comments: true })` so JSDoc survives.

Both configs keep excluding `/\.test\.ts$/` from the babel-loader rule, so no
test source ever enters either bundle (existing behavior, unchanged).

## build-and-prepare.cjs

Per mode, after webpack produces `dist/aldo-core.js` and `dist/EntryPoints.js`:

- **`testing` / `testoffline`** (unchanged observable behavior): concatenate
  vendor prelude + `aldo-core.js` + `EntryPoints.js` into one `dist/Code.js`,
  as today. Delete the two intermediate files and their `.map`s.
- **`production`** (changed): minify the vendor prelude in-memory with
  `terser` (the committed `vendor/gaslibs.Code.js` itself stays readable —
  it's shared by all modes and testoffline debugging benefits from that),
  then concatenate vendor(minified) + `aldo-core.js` into `dist/Code.js`.
  Write `dist/EntryPoints.js` as its own file, untouched (readable, with
  comments). Delete the intermediate `.map` files as today.

`.claspignore` generation is unchanged (still excludes `*.map`,
`test-file-map.json`, `**/__tests__/**`, etc.) and continues to apply to
whatever files exist in `dist/`, now including `EntryPoints.js`.

The V8-compatibility post-processing step (step 6: `Object.hasOwn` patch,
`replaceAll` patch, regex fallbacks, URL shim, size check) continues to run
against `Code.js` only. `EntryPoints.js` is hand-written, simple delegation
code with no ES2021+ features, so it does not need the same patching — but
the build script should still scan it with the same `scanPatterns` warning
list for defense-in-depth, without applying any destructive rewrite (since
rewriting readable/commented code could visibly mangle it).

## Verification

- `npm run build:testoffline` still passes unchanged (regression check —
  confirms the source split didn't break the existing single-file path or
  the offline test suites).
- `npm run build:production` (new behavior) produces `dist/Code.js` and
  `dist/EntryPoints.js`. Automated checks (added as an offline
  test/verification script, not shipped test files in `dist/`):
  - `dist/Code.js` does not contain the source strings
    `menu_avvioGenerazioneDocumenti` / `menu_avvioComunicazioniEmail` /
    `generaPagelle` / `inviaNotificaAssenze` (they must live only in
    `EntryPoints.js`).
  - `dist/Code.js` is minified (no multi-space indentation patterns / short
    average line length heuristic consistent with Terser output) and
    contains no `/**` JSDoc blocks.
  - `dist/EntryPoints.js` exists, is not minified (readable multi-line
    function bodies), retains at least one `/**` JSDoc block, and contains
    `menu_avvioGenerazioneDocumenti`, `menu_avvioComunicazioniEmail`,
    `generaPagelle`, and `inviaNotificaAssenze`.
  - Neither output file contains `__tests__` or `.test.ts` source text.
- `npm run typecheck` and `npm run lint` pass, including the new
  `src/entrypoints/EntryPoints.ts` file.
- Existing unit/integration suites (`npm test`, `npm run test:integration`)
  still pass unchanged.

## Out of scope

- Enumerating real `CONF_DOC`/`CONF_MAIL` rows to generate one launcher
  function per actual pattern — that data lives in a live Sheet and isn't
  known at build time. `EntryPoints.ts` ships two clearly-marked example
  functions; adding real ones is a manual copy-paste edit by a human, as
  requested.
- Changing how `vendor/gaslibs.Code.js` itself is built/committed
  (`refresh-vendor.cjs` unchanged) — production-mode minification of the
  vendor code happens at concatenation time only.
