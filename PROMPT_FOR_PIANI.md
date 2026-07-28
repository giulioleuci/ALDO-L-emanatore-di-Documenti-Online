# Personalized plans: single configuration — Implementation plan

> **For implementation agents:** execute tasks in order and keep tests green after every task. Do not edit `dist/`.

**Goal:** one `CONF_DOC` row generates the corresponding Drive document for every not-yet-documented `PIANI` row, choosing the template from `CONF_DOC.MODELLI`; the CDU, logs, history, and notifications distinguish plans by subtype.

**Architecture:** `CONF_DOC.ID` identifies the single configuration and is copied to `LOG_DOCS.ID_GEN`; `CONF_DOC.TIPO` is mandatorily `PIANO_PERS`; `LOG_DOCS.SOTTOTIPO` identifies the individual `PIANI.TIPO`. The batch enumerates plan rows of active students, skips already logged ones, and invokes the standard pipeline once per plan.

**Global constraints**

- Target Google Apps Script V8: synchronous code only; no Node/browser APIs.
- Use `GasLibraryFactory` through the existing facades; do not introduce direct GAS service calls.
- `CONF_DOC.TIPO` is theoretically a free string, but for this configuration it is an **intentional, mandatory exception**: it must be exactly `PIANO_PERS`. CDU providers and email boxes use this family value to recognize plan documents.
- `ID_GEN` is not configured directly: it is always `LOG_DOCS.ID_GEN = CONF_DOC.ID`. The recommended single-row value is `PIANI_PERSONALIZZATI`.
- The identity of a generated plan is `ID_GEN`, student email (`UTENTI`), and `SOTTOTIPO`; never use `ID_GEN` alone to distinguish PEI/PDP documents.

---

## File structure

- `src/application/services/DocumentBatchService.ts`: resumable per-plan enumeration in addition to the existing per-class batch.
- `src/application/services/DocumentGenerationService.ts`: single-plan generation API and CDU construction with a focused plan.
- `src/application/context-engine/{Cdu.ts,Recipe.ts}` plus a focused provider/interceptor: serializable `focus.piano` contract.
- `src/application/pipelines/documentSteps.ts`, `DocPersonalizzatoGeneratorStrategy.ts`: focused-plan selection, deduplication, and registration.
- `PianiPers*` providers, `StoricoDocumentiService.ts`, `email/boxes.ts`: history/notifications grouped by `SOTTOTIPO`.
- `SPECS_ALDO/`: updated schema, CDU, and log semantics. This repository uses `SPECS_ALDO`, not `ALDO_SPECS`.
- Fixtures, unit tests, and online E2E: one configuration, multiple plans, and conditional templates.

## Task 1: CDU contract and focused-plan configuration

**Files:**

- Modify: `src/application/context-engine/Cdu.ts`
- Modify: `src/application/context-engine/Recipe.ts`
- Create: `src/application/context-engine/providers/PianoFocusProvider.ts`
- Modify: `src/application/context-engine/ContextEngineFactory.ts`
- Modify: `src/application/services/DocumentGenerationService.ts`
- Test: `test/unit/application/context-engine/piano-focus-provider.test.ts`
- Test: `test/unit/application/document-generation-service.test.ts`

**Produced contract**

```ts
type CduPianoFocus = {
  tipo: TipoPiano;
  isBes: boolean;
  parametriGenerazione: Record<string, unknown>;
};

// PianoFocusProvider receives the selected type through BuildParams.
interface BuildParams {
  pianoTipo?: TipoPiano;
}

// Present only while generating a plan:
cdu.focus.piano: CduPianoFocus;
```

- [ ] Write red tests: the provider must find the student's plan selected by `pianoTipo`, expose only serializable values in `focus.piano`, and throw `PipelineError` if the plan does not belong to that student.
- [ ] Add `pianoTipo` to `BuildParams`, optional `focus.piano` to `Cdu`, and register the provider after `student`/`piani` so it can use both the student and `PIANI`.
- [ ] Add a `PIANO_PERSONALIZZATO` recipe with `school`, `class`, `student`, `piani`, `pianoFocus`, and any providers already required by plan templates.
- [ ] Add `generateForPiano(alunnoEmail, pianoTipo, confDocId, jobId?)` to `DocumentGenerationService`; it must build the `PIANO_PERSONALIZZATO` recipe, retain `meta.idConfigurazione`, then reuse the same pipeline/transaction used by `generateForAlunno`.
- [ ] Update the existing student-generation test: assert `focus.piano.tipo === 'PEI'` and `focus.piano.parametriGenerazione`, rather than the previous top-level `piano` object.
- [ ] Run: `npx jest --config jest.config.cjs test/unit/application/context-engine/piano-focus-provider.test.ts test/unit/application/document-generation-service.test.ts`.

## Task 2: Single-plan pipeline, conditional template, and correct logs

**Files:**

- Modify: `src/application/pipelines/documentSteps.ts`
- Modify: `src/application/strategies/DocPersonalizzatoGeneratorStrategy.ts`
- Modify: `src/domain/entities/ConfigurazioneDocumento.ts` only if a typed accessor is required; do not introduce a second source of truth
- Test: `test/unit/application/pipelines/document-steps.test.ts`
- Test: `test/unit/application/generator-strategies.test.ts`
- Test: `test/unit/infrastructure/configurazione-documento-repository.test.ts` (create if absent)

- [ ] Write red tests for conditional `MODELLI` selecting PEI and PDP_BES from `{{focus.piano.tipo}}`; assert an explicit error when the focused type has no matching branch.
- [ ] Change `DocPersonalizzatoGeneratorStrategy`: pass the full CDU to the template, provide `focus.piano.parametriGenerazione` as an optional compatibility alias named `piano`, but never read `CONF_DOC.PARAMETRI.tipoPiano` or choose the first plan.
- [ ] In `CheckDuplicatesStep`, for the plan configuration derive `SOTTOTIPO` from `cdu.focus.piano.tipo`; find an existing row with the same `ID_GEN`, `TIPO`, `SOTTOTIPO`, `UTENTI`, and resolved name/path. Preserve existing behavior for every other generator.
- [ ] In `RegisterDocumentStep`, write `LOG_DOCS.SOTTOTIPO = focus.piano.tipo`, `ID_GEN = CONF_DOC.ID`, and `TIPO = CONF_DOC.TIPO`. Make `REGISTRA_DOC.utenti = {{focus.alunno.anagrafica.email}}` mandatory in the sample plan configuration.
- [ ] Test two plans for the same student: the same `ID_GEN=PIANI_PERSONALIZZATI`, `TIPO=PIANO_PERS`, two subtypes, and two templates; running either type a second time must return `SKIPPED`.
- [ ] Run: `npx jest --config jest.config.cjs test/unit/application/pipelines/document-steps.test.ts test/unit/application/generator-strategies.test.ts test/unit/application/document-generation-service.test.ts`.

## Task 3: JobRunner batch for all and only ungenerated PIANI rows

**Files:**

- Modify: `src/application/services/DocumentBatchService.ts`
- Modify: `src/config/Bootstrap.ts` if `IAlunnoRepository` must be passed into the batch
- Modify: `src/domain/repositories/IAlunnoRepository.ts` only if an aggregate query is needed; prefer the existing `findAttivi()` + `getPiani()` APIs
- Test: `test/unit/application/document-batch-service.test.ts`
- Test: `test/unit/config/bootstrap.test.ts`

**Required behavior**

```text
for every active student:
  for every plan in student.getPiani():
    generateForPiano(student.email, plan.tipo, "PIANI_PERSONALIZZATI", jobId)
```

Deduplication remains in the pipeline, so the batch can enumerate all plans; each `yield` must represent one plan, not one class.

- [ ] Write a red test with one student owning PEI and PDP_BES and another owning no plans: the service makes exactly two `generateForPiano` calls, with one checkpoint and progress value per plan.
- [ ] Extend resume state with a stable list of plan targets, for example `{ studente: string, tipo: TipoPiano }[]`, plus `nextIndex`; build it once on job start and persist it in the state. Do not recalculate ordering after resumption.
- [ ] If `CONF_DOC.ID` is the plan configuration, follow the per-plan path; retain the per-class path for other documents. Validate before running that `CONF_DOC.TIPO === 'PIANO_PERS'`; otherwise stop the job with a clear configuration error.
- [ ] Isolate errors per plan, using the message format `email:TIPO: error`; continue processing other targets. Update telemetry with plan number/total.
- [ ] Test resumption after the first plan and job idempotency: already logged plans yield `SKIPPED` and never create duplicate files.
- [ ] Run: `npx jest --config jest.config.cjs test/unit/application/document-batch-service.test.ts test/unit/config/bootstrap.test.ts`.

## Task 4: CDU history and notifications by subtype

**Files:**

- Modify: `src/application/context-engine/providers/PianiPersAlunnoProvider.ts`
- Modify: `src/application/context-engine/providers/PianiPersClasseProvider.ts`
- Modify: `src/application/context-engine/providers/PianiPersAlunnoStoricoProvider.ts`
- Modify: `src/application/context-engine/providers/PianiPersClasseStoricoProvider.ts`
- Modify: `src/application/storico/StoricoDocumentiService.ts`
- Modify: `src/application/email/boxes.ts`
- Modify: `src/application/context-engine/Cdu.ts`
- Test: `test/unit/application/context-engine/piani-pers-alunno-provider.test.ts`
- Test: `test/unit/application/context-engine/piani-pers-classe-provider.test.ts`
- Test: `test/unit/application/email-boxes.test.ts`

- [ ] Write a red test with historical PEI and PDP_BES documents sharing `ID_GEN=PIANI_PERSONALIZZATI`: a current PEI document must receive only PEI history.
- [ ] Extend the history DTO with `sottotipo`, read from `LOG_DOCS.SOTTOTIPO`; do not overload the property currently named `tipo`, which incorrectly carries `ID_GEN`.
- [ ] Retain `idGen` in the CDU as informational data, but change `piani_pers_da_inviare` and `piani_pers_inviati` renderers to filter with `storico.sottotipo === corrente.sottotipo`.
- [ ] Keep the `LOG_DOCS.TIPO === 'PIANO_PERS'` filter: it is the intentional functional exception identifying the plan family, not an optional convention.
- [ ] Test “to be sent” and “sent” boxes, including `NOTIFICATO`, for two subtypes of the same student and for multiple students in the same class.
- [ ] Run: `npx jest --config jest.config.cjs test/unit/application/context-engine/piani-pers-alunno-provider.test.ts test/unit/application/context-engine/piani-pers-classe-provider.test.ts test/unit/application/email-boxes.test.ts`.

## Task 5: Fixtures, online scenarios, and ALDO documentation

**Files:**

- Modify: `SPECS_ALDO/01_SCHEMA_DATABASE.md`
- Modify: `SPECS_ALDO/02_CDU_STRUTTURA.md`
- Modify: `SPECS_ALDO/03_VALUE_OBJECTS_ED_ENUM.md`
- Modify: `FAKEDB/CONF_DOC.csv`
- Modify: `test/fixtures/tables.ts`
- Modify: `src/onlinetests/E2eSampleDatabaseBuilder.ts`
- Modify: `src/onlinetests/E2eTemplateProvisioner.ts`
- Modify: relevant `src/onlinetests/checks/*` and `test/unit/onlinetests/*`
- Test: relevant `test/build/*` and `test/unit/onlinetests/e2e-scenario-checks.test.ts`

- [ ] Update documentation: describe the single `PIANI_PERSONALIZZATI` configuration, conditional `MODELLI` based on `focus.piano.tipo`, `SOTTOTIPO` as the plan discriminator, and the mandatory `TIPO=PIANO_PERS` rule despite the field generally being a free string. Explicitly highlight this exception as an important constraint.
- [ ] Update `FAKEDB` and fixtures: remove one-configuration-per-subtype entries and add one row with five `MODELLI` entries; ensure `REGISTRA_DOC.utenti` is the student email.
- [ ] Update the E2E seed with at least one student owning both PEI and PDP_BES, and distinct templates printing `focus.piano.tipo` and `focus.piano.parametriGenerazione.note`. Previous-year history logs must have `ID_GEN=PIANI_PERSONALIZZATI` and distinct `SOTTOTIPO` values.
- [ ] Add an online scenario: generate two files for that student, assert the correct rendered template/text, assert `LOG_DOCS` contains one generator ID and two subtypes, rerun without duplicates, then compose/send the email and assert history is associated only with the corresponding subtype.
- [ ] Run in sequence: `npm test`, `npm run typecheck`, `npm run lint`, `npm run test:integration`, `npm run test:build`, `npm run build:online`.
- [ ] Run `git diff --check` and confirm that no generated artifacts under `dist/` were changed.

## Final acceptance criteria

- Exactly one `CONF_DOC` configuration exists for all personalized plans.
- Every `PIANI` row not yet present in logs produces exactly one document using the template for its `TIPO`.
- PEI and PDP_BES for the same student produce distinct documents and never duplicate on retries.
- Every plan document has one stable `LOG_DOCS.ID_GEN`, `LOG_DOCS.TIPO='PIANO_PERS'`, and `LOG_DOCS.SOTTOTIPO` equal to the corresponding `PIANI` row type.
- CDU and notifications expose the focused plan and never mix history from different subtypes.
- Unit, integration, build, and online tests pass.
