# Ponytail audit — SheetDBLib

Scope: read-only audit of the current `GasLibraryFactory/SheetDBLib` tree (34 files), plus its required API reference. Excluded `dist/` and `node_modules/`. The graph was queried first; its 61-file SheetDBLib snapshot contains removed `multi/` and `dynamic-columns/` modules, so current-tree reads and entry-point reachability decide this audit.

Audited: 3,289 production JS lines; 8,040 unit/integration-test JS lines; 168 online-test GAS lines; 362 index lines; 238 README lines; 18 manifest lines; 3,547 API-reference lines (15,662 total).

1. delete: Replace the stale API dump that documents absent `multi/` and `dynamic-columns/` files with a one-line link to the maintained README. [GasLibraryFactory/DOCS_LIBS/SheetDBLib.md:1] (~3,546 lines)
2. delete: Remove uncalled `QueryCondition` and `QueryGroup` trees and their direct test blocks; production uses flat condition records and `AdvancedQueryCompiler._applyGroupBy`, and the package entry point never exports either model. [GasLibraryFactory/SheetDBLib/src/internal/query-builders/AdvancedQueryParser.js:92] (~470 lines)
3. shrink: Turn the 352-line `index.js` prose duplicate into a short export barrel pointing to `README.md`; only four export lines remain. [GasLibraryFactory/SheetDBLib/index.js:1] (~340 lines)
4. yagni: Collapse the three TableService-only collaborators and fourteen forwarding methods into `TableService`; keep the public methods, lose the facade/delegate plumbing. [GasLibraryFactory/SheetDBLib/src/TableService.js:81] (~75 lines)
5. yagni: Fold the four DatabaseService-only managers into their sole owner and delete the runtime `Delegation.delegateMethods` registry. [GasLibraryFactory/SheetDBLib/src/DatabaseService.js:43] (~35 lines)
6. yagni: Fold AdvancedQueryBuilder's single-owner compiler/pagination collaborators into private methods and delete its dynamic delegation map. [GasLibraryFactory/SheetDBLib/src/query/AdvancedQueryBuilder.js:38] (~35 lines)
7. shrink: Inline the two-call fuzzy-condition factory into the builder and keep one behavior test with the builder; the separate module and most of its direct test add no boundary. [GasLibraryFactory/SheetDBLib/src/internal/query-builders/FuzzyCondition.js:1] (~30 lines)
8. delete: Remove unused `QueryCache.clear`, an internal alias for `invalidateTable`; no current caller uses it. [GasLibraryFactory/SheetDBLib/src/internal/query-builders/AdvancedQueryCompiler.js:95] (~10 lines)

net: -4541 lines, -0 deps possible.
