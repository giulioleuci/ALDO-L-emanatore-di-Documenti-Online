# Ponytail audit — ALDO infrastructure facades

## Scope and audited lines

Production source only; callers and tests were evidence only. All 10 files in `src/infrastructure/facades/`, 603 lines:

- `ActiveUserFacade.ts` (10), `DocumentTableFacade.ts` (84), `DriveServiceFacade.ts` (225), `ExpressionEngineFacade.ts` (23), `GmailServiceFacade.ts` (53).
- `ProcessMonitorFacade.ts` (20), `PropertiesFacade.ts` (25), `SpreadsheetReportFacade.ts` (33), `TemplateEngineFacade.ts` (76), `UiFacade.ts` (54).

Graph evidence: `aldo-full-coverage` scoped architecture (92 nodes, 167 edges), zero-caller and caller/test traces, plus the native-GAS bypass query (none in scope). `GoogleApiWrapper`, `WorkspaceTemplateEngine`, `GasExpressionEngineLib`, `GasProcessMonitorLib`, and `CoreUtilsLib` docs and GLF graph signatures were checked. The remaining direct delegates are deliberate ALDO ports: their interfaces have 3–27 uses and preserve the required infrastructure boundary; they are not candidates for removal.

## Findings

1. `delete:` Remove the production-unused end-of-document `appendTable` port and implementation; the real table strategy uses retained positional `insertTableAtMarker`, while occurrences outside this facade are fake/unit support. Replacement: none. [src/infrastructure/facades/DocumentTableFacade.ts:12] (~9)
2. `delete:` Remove the production-unused single-grant `setPermission` port and implementation; no production caller exists and retained `setPermissions([{ targetId: fileId, email, permesso }])` covers it. Replacement: `setPermissions`. [src/infrastructure/facades/DriveServiceFacade.ts:21] (~7)

net: -16 scoped ALDO lines, -0 deps possible.
