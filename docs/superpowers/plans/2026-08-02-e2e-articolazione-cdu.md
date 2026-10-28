# E2E Articolazione CDU Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend persistent E2E fixture and online checks with ARTICOLATA documents/mail, CDC signature document, and a separate shared-database articulation verification suite.

**Architecture:** Keep behavior data-driven. `E2eSampleDatabaseBuilder` owns fixture rows, `E2eTemplateProvisioner` owns Drive templates, and the new check module only reads the database/CDU built by `runE2eScenarios`. A third entry point validates existing `PROP_MASTER_SPREADSHEET_ID` and never creates a database.

**Tech Stack:** TypeScript, GAS V8, `GasOnlineTestFramework.EnhancedTestRunner` through `TestRunner`, Jest.

## Global Constraints

- Use existing `WorkspaceTemplateEngine`, `ContextEngine`, and online-test seams; no new strategy or GLF utility.
- Never edit `dist/*`; no native GAS globals outside existing sanctioned online-test facades.
- `GESTIONE_ARTICOLAZIONE=ARTICOLATA` targets plain classes plus partners, never parent; `COMPLETA` targets plain classes plus parent, never partners.
- New checks are pure `runner.add` assertions with named expectations and `ValidationError` diagnostics.
- Preserve existing uncommitted user work.

---

### Task 1: Fixture and template contract

**Files:**

- Modify: `src/onlinetests/E2eSampleDatabaseBuilder.ts`
- Modify: `src/onlinetests/E2eTemplateProvisioner.ts`
- Test: `test/unit/onlinetests/e2e-sample-database-builder.test.ts`
- Test: `test/unit/onlinetests/e2e-template-provisioner.test.ts`

- [ ] Add failing fixture assertions for one `CONF_DOC` and one `CONF_MAIL` with `GESTIONE_ARTICOLAZIONE='ARTICOLATA'`, plus a `RIEPILOGO_FIRME_CDC` generic GDOC config.
- [ ] Run focused Jest tests; verify missing config/template id failure.
- [ ] Add `CDC_RIEPILOGO` template id, paragraphs, and row-loop tables. Target ARTICOLATA configs at partner classes; use one unsplit table for plain classes only if an existing template contract proves it safe, otherwise guard to articulated partners.
- [ ] Add new CONF_DOC registration metadata and change one observable coordinator mail config to ARTICOLATA.
- [ ] Re-run focused Jest tests; preserve all existing E2E fixture rows and deliberate shared-MAT pin.

### Task 2: Independent online entry point and guard

**Files:**

- Modify: `src/onlinetests/index.ts`
- Test: `test/unit/onlinetests/index.test.ts` (or existing entry-point test file)

- [ ] Add failing unit tests for `executeArticolazioneScenarios` to reject missing/non-test MASTER and not invoke `E2eSampleDatabaseBuilder.build`.
- [ ] Run focused Jest test and verify guard failure.
- [ ] Implement an injected-dependency-compatible third entry point that reads current master pointer, initializes ALDO, creates `TestRunner`, registers only articulation checks, logs report, and exposes `runArticolazioneScenarios`.
- [ ] Re-run focused Jest test; verify E2E builder is not called.

### Task 3: Read-only articulation/CDC checks

**Files:**

- Create: `src/onlinetests/checks/articolazioneChecks.ts`
- Test: `test/unit/onlinetests/articolazione-checks.test.ts`

- [ ] Add failing registration tests for TEST_MODE guard and expected check names.
- [ ] Run focused Jest test and verify absent registration failure.
- [ ] Implement pure checks for: CDU-level substitute/final-holder/date-boundary behavior; CDU serializability/unique council/subject description/indirizzo invariants; parent-partner round trip and comune/separato split; document/mail COMPLETA vs ARTICOLATA target sets; high-value specifica/repeater or dual-plan case.
- [ ] Add CDC generated-document metadata assertions for partners and parent exclusion; use existing `IDriveFacade.getFileText` only where sibling checks already prove it.
- [ ] Re-run focused Jest test; ensure checks use `ValidationError`, no raw GAS globals, and no assignment-matrix duplication.

### Task 4: Existing E2E assertions and global exposure

**Files:**

- Modify: `src/onlinetests/checks/e2eScenarioChecks.ts`
- Modify: `src/index.ts`
- Test: relevant E2E check and entry-point unit tests

- [ ] Add failing assertion that existing ARTICOLATA mail/document generation contains partner results and no parent result.
- [ ] Run focused Jest tests; verify old `ALL_CLASSI_E2E` expectation fails for ARTICOLATA configuration.
- [ ] Update only assertions affected by changed fixture targeting; expose third GAS function through `globalThis` as existing online functions do.
- [ ] Re-run focused tests.

### Task 5: Verification and audit

- [ ] Run `npm run typecheck`.
- [ ] Run `npm run lint`.
- [ ] Run `npm test`.
- [ ] Run `npm run test:integration`.
- [ ] Run `npm run build:online`; do not push or run live GAS checks.
- [ ] Check diff, required deliverables, test coverage, and no direct native GAS usage outside sanctioned code.
