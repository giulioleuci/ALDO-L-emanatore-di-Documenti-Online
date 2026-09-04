Scope: tracked `scripts/**` (1,516), `types/**` (1,891), and root tooling/configuration files (12,131); `DATABASES_TO_CONVERT/**` is absent — 15,538 physical lines audited. Current ignored clasp tracking was structurally checked but not counted; dirty `eslint.config.js` is untouched.

1. [delete: scripts/build-and-prepare.cjs:689] Remove the 68-line `source-map-index.json` step and its `.claspignore` entry: `Code.js.map` is deliberately never produced after concatenation, `test-file-map.json` has no producer, and no consumer exists. (~69 lines)
2. [delete: scripts/build-and-prepare.cjs:782] Remove the comment, empty `namesForbiddenInCodeJs`, and unconditional “no launcher source” pass; an empty list cannot verify anything. (~15 lines)
3. [delete: babel.config.cjs:1] Delete this duplicate Babel configuration: webpack already supplies the same presets and class-properties transform, and no other tracked command invokes Babel. (~9 lines)
4. [delete: .clasp.json.bak-20260808-091355:1] Delete the tracked stale clasp and test-online backup pair; they are local history, not active configuration. (~9 lines)
5. [delete: package.json:27] Delete the exact `build:online`/`push:online` aliases; `build:testing`/`push:testing` run the identical online command and are the documented names. (~2 lines)

net: -104 lines, -0 deps possible.
