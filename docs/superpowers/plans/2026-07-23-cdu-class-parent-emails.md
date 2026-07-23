# CDU Class Parent Emails Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make each class CDU student expose their parent/tutor emails for CDU-only `GENITORI` resolution.

**Architecture:** Extend the existing `AlunnoContestoVM` emitted by `StudentiProvider`; map the existing domain `Alunno.getTutors()` value objects to email records. The document resolver consumes this new CDU data and does not reach into repositories.

**Tech Stack:** TypeScript, Jest/ts-jest, GAS V8, existing ContextEngine.

## Global Constraints

- GAS V8; synchronous code only. No native GAS globals outside existing facades.
- Never edit generated `dist/*` or `vendor/*`.
- Reuse `Alunno.getTutors()`; no new persistence or repository queries.
- The canonical field name is `genitori: Array<{ email: string }>`.

---

### Task 1: Map parent emails into the class CDU

**Files:**
- Modify: `src/application/context-engine/Cdu.ts:33-46`
- Modify: `src/application/context-engine/providers/StudentiProvider.ts:52-76`
- Test: `test/unit/application/context-engine/studenti-provider.test.ts`

**Interfaces:**
- Consumes: `Alunno.getTutors(): Email[]`.
- Produces: `AlunnoContestoVM.genitori: Array<{ email: string }>`.

- [ ] **Step 1: Write the failing test**

Add a test that builds the normal class CDU from the existing fixture and asserts:

```ts
expect(cdu.focus.classe!.studenti!.listaCompleta[0]!.genitori)
  .toEqual([{ email: 'genitore1@x.it' }]);
```

- [ ] **Step 2: Run RED**

Run: `npx jest --config jest.config.cjs test/unit/application/context-engine/studenti-provider.test.ts -t "parent emails"`

Expected: FAIL because `genitori` is absent from `AlunnoContestoVM`.

- [ ] **Step 3: Implement the minimal mapping**

Add this property to `AlunnoContestoVM`:

```ts
genitori: Array<{ email: string }>;
```

In `StudentiProvider.buildVM`, map the existing domain emails without querying any repository:

```ts
genitori: alunno.getTutors().map((email) => ({ email: email.value })),
```

- [ ] **Step 4: Run GREEN**

Run: `npx jest --config jest.config.cjs test/unit/application/context-engine/studenti-provider.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/application/context-engine/Cdu.ts src/application/context-engine/providers/StudentiProvider.ts test/unit/application/context-engine/studenti-provider.test.ts
git commit -m "feat: expose parent emails in class CDU"
```

### Task 2: Consume canonical parent emails in document logging

**Files:**
- Modify: `src/application/pipelines/documentSteps.ts`
- Test: `test/unit/application/pipelines/document-steps.test.ts`

**Interfaces:**
- Consumes: `focus.classe.studenti.listaCompleta[].genitori[].email`.
- Produces: the first-seen, comma-separated `LOG_DOCS.UTENTI` value for selector `GENITORI`.

- [ ] **Step 1: Write the failing test**

Add/adjust the existing `REGISTRA_UTENTI` registration test so the expected value includes the fixture parent email after the selected coordinator, full CDC list, and student email:

```ts
expect(row.UTENTI).toBe('rossi@school.it,bianchi@school.it,a1@school.it,genitore1@x.it');
```

- [ ] **Step 2: Run RED**

Run: `npx jest --config jest.config.cjs test/unit/application/pipelines/document-steps.test.ts -t "REGISTRA_UTENTI"`

Expected: FAIL because the resolver has no `GENITORI` email path.

- [ ] **Step 3: Implement the selector branch**

Within the existing CDU-only resolver, collect parent emails from the canonical field:

```ts
for (const alunno of cdu.focus.classe?.studenti?.listaCompleta ?? []) {
  for (const genitore of alunno.genitori) add(genitore.email);
}
```

`add` is the resolver's existing first-seen de-duplication helper; retain the pre-insert `PipelineError` for invalid selectors.

- [ ] **Step 4: Run GREEN**

Run: `npx jest --config jest.config.cjs test/unit/application/pipelines/document-steps.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/application/pipelines/documentSteps.ts test/unit/application/pipelines/document-steps.test.ts
git commit -m "feat: resolve document log parents from CDU"
```
