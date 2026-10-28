# Bound Master Sheet Startup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Start ALDO from the spreadsheet bound to its Apps Script project without requiring a Script Property containing the Master Sheet ID.

**Architecture:** `initAldo()` obtains its Master ID from the existing GoogleApiWrapper `SpreadsheetService`, which is the sanctioned boundary for native GAS access. It keeps the selected service instance for the existing container wiring. Script Properties remain an optional dependency for job and email checkpoints only.

**Tech Stack:** TypeScript, Jest/ts-jest, Google Apps Script V8, GasLibraryFactory GoogleApiWrapper.

## Global Constraints

- Do not access `SpreadsheetApp` outside GasLibraryFactory; use `ServiceFactory.getSpreadsheetService().getActiveStandard().getId()`.
- Do not edit generated `dist/*` files.
- Preserve the existing current-school-year lookup through `MASTER.ID_SPREADSHEET`.
- Use TDD: observe the regression test fail before production code changes.

---

### Task 1: Resolve the Master from the bound script spreadsheet

**Files:**

- Modify: `test/unit/config/bootstrap.test.ts`
- Modify: `src/config/Bootstrap.ts`
- Modify: `src/index.ts`
- Modify: `test/unit/index.test.ts`

**Interfaces:**

- Consumes: `ServiceFactory.getSpreadsheetService().getActiveStandard().getId(): string`
- Produces: `initAldo(now?, props?)`, which no longer reads `MASTER_SPREADSHEET_ID` from `props`.

- [ ] **Step 1: Write the failing regression test**

In the `initAldo` test suite, configure `getSpreadsheetService()` to return an object whose `getActiveStandard()` returns `{ getId: () => 'BOUND_MASTER_ID' }`. Call `initAldo()` with a properties facade whose `get` throws if called. Assert that the first `DatabaseService` constructor receives `'BOUND_MASTER_ID'`. The test catches a regression that reads the legacy property instead of the bound spreadsheet.

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `npx jest --config jest.config.cjs test/unit/config/bootstrap.test.ts -t "bound spreadsheet"`

Expected: FAIL because `initAldo()` calls `props.get('MASTER_SPREADSHEET_ID')` before resolving the bound spreadsheet.

- [ ] **Step 3: Implement the minimal production change**

In `initAldo()`, create the `SpreadsheetService` before opening the Master database, derive `masterId` with `spreadsheetService.getActiveStandard().getId()`, and reuse that instance in `buildAldoContainer`. Remove `PROP_MASTER_SPREADSHEET_ID` and the obsolete Script Properties setup function from `src/index.ts`, along with its unit test and mocks.

- [ ] **Step 4: Run the focused test to verify it passes**

Run: `npx jest --config jest.config.cjs test/unit/config/bootstrap.test.ts -t "bound spreadsheet"`

Expected: PASS; the Master database receives `BOUND_MASTER_ID` and the properties facade is untouched.

- [ ] **Step 5: Run directly affected tests**

Run: `npx jest --config jest.config.cjs test/unit/config/bootstrap.test.ts test/unit/index.test.ts`

Expected: PASS; no tests expect the removed setup entrypoint or property validation.

- [ ] **Step 6: Commit**

`git add src/config/Bootstrap.ts src/index.ts test/unit/config/bootstrap.test.ts test/unit/index.test.ts`

`git commit -m "fix: derive master from bound spreadsheet"`

## Plan Self-Review

- Spec coverage: Task 1 removes property-based discovery, preserves the school-year database lookup, stays behind the existing library wrapper, and adds a behavioral regression test.
- Placeholder scan: no unfinished requirements or generic test steps remain.
- Type consistency: the plan uses the existing synchronous `getActiveStandard().getId(): string` chain throughout.
