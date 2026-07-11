# REPORT_GLF.md fixes — implementation design

**Source of truth:** `REPORT_GLF.md` (13 items: A1-A4 ALDO-side reuse gaps, B1-B9 GLF extensions). That report already contains the approved design (rationale, code sketches, file/line references) for every item — this doc records only the execution grouping and sequencing decision.

## Decision

Implement all 13 items, grouped by the GLF library (or ALDO area) each touches, rather than the report's cross-cutting priority list. Each group is self-contained: GLF unit tests + ALDO integration tests, committed independently.

1. **DomainRepositoryLib** — B1 (`toQueryObject()` fast path in `QueryTranslator`/`Repository.find()`), A1 (12 repositories switch to `this.find(spec)`), B2 (dynamic-column passthrough in `Entity`/`Repository.save()`, applied to `ClasseRepository`/`CarenzaRepository`)
2. **SheetDBLib** — A2 (`createIndex` on hot lookup columns), A3 (`getByPK`-based helper replacing linear scans in `SheetDbAdapter`/`postProcessActions`)
3. **GasDataImporter** — B6 (`SheetByIdStrategy.extractRaw()`) + A4 (dedupe range-resolution), B9 (`ImportEngine`/`Loader` accepts existing `DatabaseService`)
4. **RoleResolutionLib** — B3 (`PriorityChainResolver`, refactor `CattedraResolver`), B4 (delegate-resolver `RoutingPolicy`, refactor `RisolutoreRuoliService.applicaSupplenze` + `SupplentiSubstitutionLookup`)
5. **WorkspaceTemplateEngine** — B5 (ACL resolver hook / business key in `dynamic_columns`, simplify `SheetMaterieConPermessiGeneratorStrategy`), B7 (Docs-side `{{table[...]}}` directive, retire bespoke `DocumentTableFacade` marker scanning)
6. **CoreUtilsLib** — B8 (generic `ServiceFactory`/container extraction, refactor ALDO `ServiceContainer.ts`)

Groups 1-3 are mechanical/low-risk (wiring existing primitives together). Groups 4-6 require new library abstractions (priority chain resolver, delegate-resolver routing policy, ACL resolver hook, Docs table directive, generic container) — each is additive/backward-compatible with existing GLF consumers.

## Testing

Every GLF change gets unit tests in the owning library's `__tests__`. Every ALDO call-site change gets/updates tests in ALDO's `test/` tree. No `dist/*` edits — GLF changes go through its normal build. Existing test suites (GLF + ALDO) must stay green after each group.

## Out of scope

No new ALDO features; no spec (`SPECS_ALDO/`) changes; no changes to files listed as "audited, no findings" in REPORT_GLF.md.
