# Task 4 final report

## Documentation

- Promoted `ANALISI_CDU_OTTIMIZZAZIONE_NEW.md` to `SPECS_ALDO/02_CDU_STRUTTURA.md`.
- Made `meta.progressivo` optional (`progressivo?: number`) and documented that it is absent until the destination folder is resolved.
- Reconciled current references in `00_PANORAMICA.md`, `01_SCHEMA_DATABASE.md`, `03_VALUE_OBJECTS_ED_ENUM.md`, `GUIDA_USO_PLACEHOLDER.md`, and `MAT_NON_STANDARD.md`.
- Deleted `ANALISI_CDU_OTTIMIZZAZIONE_NEW.md`.
- Historical documents and pre-existing untracked plan/doc files were preserved.

## Release gates (required order)

| Command | Result |
| --- | --- |
| `npm run typecheck` | PASS (`tsc` application + test configs) |
| `npm run lint` | FAIL: 70 existing lint errors across CDU source and tests |
| `npm test -- --runInBand` | FAIL: 180/182 suites, 1791/1795 tests; 4 stale-shape failures |
| `npm run test:integration -- --runInBand` | PASS: 5/5 suites, 14/14 tests |
| `npm run test:build -- --runInBand` | FAIL: 4/5 suites, 9/12 tests; online smoke repeats offline unit failures |
| `npm run build:online` | FAIL: build emitted bundles/source map, then offline unit gate failed with the same 4 tests |
| `git diff --check` | PASS |

The online build emitted `Code.js`, `OnlineTests.js`, `EntryPointOnlineTests.gs`, and `gas-source-map.json`; it also reported one existing `crypto.getRandomValues()` compatibility warning.

## Graph audits

Indexes refreshed before auditing:

- `home-giulio-Desktop-ALDO-implementing`: 6,130 nodes, 21,194 edges.
- `aldo-full-coverage`: 6,116 nodes, 20,481 edges.

1. Native GAS bypass:

   ```cypher
   MATCH (f)-[e:CALLS]->(g)
   WHERE (f:Function OR f:Method)
     AND f.file_path =~ 'src/.*'
     AND (e.callee IN ['SpreadsheetApp','DriveApp','DocumentApp','PropertiesService','CacheService','UrlFetchApp','Utilities','Session','ScriptApp','MailApp','LockService']
          OR g.name IN ['SpreadsheetApp','DriveApp','DocumentApp','PropertiesService','CacheService','UrlFetchApp','Utilities','Session','ScriptApp','MailApp','LockService'])
   RETURN f.qualified_name, e.callee, g.qualified_name, e.line
   ```

   Result: **0 rows**.

2. ALDO → GasLibraryFactory linkage:

   ```cypher
   MATCH (f:Function)-[e:CALLS]->(g)
   WHERE f.file_path =~ 'src/.*' AND g.qualified_name =~ '.*types\\.gaslibs.*'
   RETURN f.qualified_name, e.callee, g.qualified_name, g.signature, e.args, e.confidence, e.line
   ```

   Result: **38 call edges**; **38 low-confidence edges** and **35 targets without signature metadata**. The graph cannot certify exact signatures for these imported library contracts. The separate library graph resolves `splitCsvList` at `RoleResolutionLib/src/utils/MateriaSlotParsing.js:28-33`.

3. Zero-inbound CDU functions/methods:

   ```cypher
   MATCH (f) WHERE (f:Function OR f:Method)
     AND f.file_path =~ 'src/application/context.*'
     AND f.is_entry_point = false
   OPTIONAL MATCH (caller)-[:CALLS]->(f)
   WITH f, count(caller) AS inbound_calls
   WHERE inbound_calls = 0
   RETURN f.qualified_name, f.is_exported, inbound_calls
   ```

   Result: **0 rows**.

4. Direct application import cycles:

   ```cypher
   MATCH (a)-[:IMPORTS]->(b)-[:IMPORTS]->(a)
   WHERE a.file_path =~ 'src/application/.*' AND b.file_path =~ 'src/application/.*'
   RETURN a.file_path, b.file_path
   ```

   Result: **0 rows**.

5. Old CDU paths in production:

   ```text
   search_code(project="aldo-full-coverage",
     pattern="focus\\.classe\\.anagrafica\\.|focus\\.classe\\.studenti\\.listaCompleta|focus\\.classe\\.consiglioDiClasse|focus\\.classe\\.didattica\\.|focus\\.alunno\\.didattica\\.|meta\\.date\\.|articolazione\\.partners|materieColonne\\.(group|gruppi\\.[0-9]+Label)",
     path_filter="^src/", mode="files")
   ```

   Result: **1 match** in `src/onlinetests/checks/documentiChecks.ts` (stale diagnostic placeholder). This remains a follow-up concern outside the docs-only release slice.

## Concerns

- The requested complete release gate is not green because repository lint and four pre-existing stale-contract unit assertions fail.
- Exact GasLibraryFactory signatures cannot be proven by the current graph because imported declaration targets have missing metadata and low-confidence edges.
- One stale old-path diagnostic remains in production online-check source, as noted above.
