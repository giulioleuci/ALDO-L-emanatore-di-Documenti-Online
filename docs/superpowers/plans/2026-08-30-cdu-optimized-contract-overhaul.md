# CDU Optimized Contract Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current CDU with the breaking, Italian, flat, deterministic contract in `ANALISI_CDU_OTTIMIZZAZIONE_NEW.md`, and move every producer, consumer, offline test, online check, and authoritative document to that contract.

**Architecture:** Keep GasLibraryFactory's existing `ContextAssembler.assembleInto()` as the orchestration engine and its `CollectionProjector` for filter/map/flatMap/groupBy/distinctBy/sortBy operations. Rewrite ALDO's CDU types and domain-specific mappers first, then its providers/recipes, then direct consumers; delete old paths instead of translating or aliasing them. Promote the supplied analysis into the canonical CDU specification once implementation and tests agree.

**Tech Stack:** TypeScript targeting GAS V8, GasLibraryFactory `ContextEngine`/`CoreUtilsLib.LazyRef`, Jest/ts-jest, webpack/Babel build pipeline, live GAS online checks.

**Spec:** `ANALISI_CDU_OTTIMIZZAZIONE_NEW.md`

## Global Constraints

- `SPECS_ALDO/01_SCHEMA_DATABASE.md` remains authoritative for physical data; `ANALISI_CDU_OTTIMIZZAZIONE_NEW.md` defines the new serialized projection.
- No backward compatibility: remove `anagrafica`, `status`, `didattica`, `listaCompleta`, `consiglioDiClasse*`, `classiMateria`, `parametriInput`, `date.oggi`, top-level `progressivo`, English VM names, and old render-box keys. Do not add aliases, adapters, fallbacks, or dual-write fields.
- `meta` is always present; recipe-owned nodes are omitted when their provider does not run; present collections use `[]`, `hasXxx`, and exact cardinalities.
- Treat `meta.progressivo` as the one documented temporal exception: omit it until infrastructure resolves the destination, then set it to a number before name/body/log rendering. Update the canonical spec to say `progressivo?: number` so the type and lifecycle do not lie.
- Preserve `tech` as a non-enumerable property. No domain entity, service, function, circular reference, or nondeterministic value may appear in `JSON.stringify(cdu)`.
- Every person and subject goes through one canonical mapper. Movement and presence projections share one date-filtered movement source.
- Reuse GasLibraryFactory `CollectionProjector` and existing ALDO repositories/value objects. Do not add a dependency or extend GasLibraryFactory: its documented `filter`, `map`, `flatMap`, `groupBy`, `distinctBy`, and `sortBy` operations cover the generic projection work; CDU grammar and school-domain VMs remain ALDO-specific.
- GAS V8 only: synchronous code, no Node/browser APIs, and no native GAS globals outside `GoogleApiWrapper`.
- Deterministic ordering is part of the contract, not a test convenience.
- Do not edit historical files under `docs/superpowers/plans/` or `docs/superpowers/specs/`; they are records, not current product documentation.

---

### Task 1: Replace the CDU contract and canonical mappers

**Files:**

- Modify: `src/application/context-engine/Cdu.ts`
- Modify: `src/application/context-engine/Recipe.ts`
- Modify: `src/application/context-engine/ContextBuilder.ts`
- Modify: `src/application/context-engine/dates.ts`
- Modify: `src/application/context-engine/techEntities.ts`
- Modify: `src/application/context-engine/CduInternalMetadata.ts`
- Create: `src/application/context-engine/mappers/elencoVm.ts`
- Create: `src/application/context-engine/mappers/movimentoVmMapper.ts`
- Modify: `src/application/context-engine/mappers/personVmMapper.ts`
- Modify: `src/application/context-engine/mappers/subjectVmMapper.ts`
- Modify: `src/application/context-engine/mappers/carenzeMapper.ts`
- Modify: `src/application/context-engine/mappers/continuitaMapper.ts`
- Modify: `src/application/context-engine/mappers/labels.ts`
- Modify: `src/application/context-engine/mappers/materiePerPrincipaleMapper.ts`
- Modify: `src/application/context-engine/mappers/specificitaAlunniMapper.ts`
- Modify: `src/application/context-engine/mappers/statisticheAlunniMapper.ts`
- Modify: `src/application/context-engine/mappers/storicoMapper.ts`
- Create: `test/unit/application/context-engine/cdu-contract.test.ts`
- Create: `test/unit/application/context-engine/mappers/movimento-vm-mapper.test.ts`
- Modify: `test/unit/application/context-engine/dates.test.ts`
- Modify: `test/unit/application/context-engine/tech-entities.test.ts`
- Modify: `test/unit/application/context-engine/mappers/*.test.ts`

**Interfaces:**

- Produces the exact VM names and fields from analysis sections 1–8.25. The root is:

```typescript
export interface Cdu {
  meta: MetadatiVM;
  istituto?: IstitutoVM;
  focus: ContestoFocusVM;
  destinatario?: DestinatarioVM;
  render?: RenderingVM;
  readonly tech: ContestoTecnico;
}

export interface ElencoVM<T> {
  elenco: T[];
  hasElenco: boolean;
  numero: number;
}

export function elencoVm<T>(elenco: T[]): ElencoVM<T> {
  return { elenco, hasElenco: elenco.length > 0, numero: elenco.length };
}
```

- `BuildParams` uses the final names and finite unions; pipeline-only selectors remain separate from serialized `meta`:

```typescript
export interface BuildParams {
  target: string;
  tipoTarget: 'classe' | 'alunno' | 'docente' | 'piano' | 'carenza' | 'materia' | 'dipartimento';
  now: Date;
  configurazioneId: string;
  esecuzioneId: string;
  tipoOperazione: 'GENERAZIONE_DOCUMENTO' | 'INVIO_NOTIFICA';
  materiaCorrente?: string | null;
  carenzaProgressivo?: number;
  classiCompetenza?: string[];
  pianoTipo?: TipoPiano;
  docenteCorrente?: string | null;
}
```

- Shared mappers expose one route per canonical entity:

```typescript
export function buildPersonaVm(input: PersonaVmInput): PersonaVM;
export function buildMateriaVm(
  materia: Materia,
  profilo: 'BASE' | 'CON_DOCENTI' | 'CON_CONTINUITA',
  contesto: MateriaVmContesto
): MateriaVM;
export function buildMovimentoAlunnoVm(
  movimento: MovimentoAlunno,
  risolviClasse: (id: string) => ClasseRiferimentoVM | null
): MovimentoAlunnoVM;
export function buildMovimentoClasseVm(
  movimento: MovimentoAlunnoVM,
  studente: PersonaRiferimentoVM,
  scopeClassi: Set<string>
): MovimentoClasseVM;
export function buildPresenzaAlunnoVm(
  movimentiFiltrati: MovimentoAlunnoVM[],
  annoPrecedente: { isCalcolato: boolean; isPresente: boolean },
  classeCorrente: string
): PresenzaAlunnoVM;
```

- [ ] **Step 1: Write failing contract tests for the new root and invariants**

Build a minimal CDU through `ContextBuilder` and assert the new meta names/date shape, the absence of every retired root/path, and non-enumerable `tech`:

```typescript
const cdu = builder.build(params, { providers: [], options: makeOptions() });
expect(cdu.meta).toMatchObject({
  configurazioneId: 'CONF-1',
  esecuzioneId: 'JOB-1',
  tipoOperazione: 'GENERAZIONE_DOCUMENTO',
  tipoOperazioneLabel: 'Generazione documento',
  target: '5A',
  tipoTarget: 'classe',
  materiaCorrente: null
});
expect(cdu.meta.oggi).toMatchObject({ breve: '30/08/2026', meseNome: 'agosto' });
expect(cdu.meta).not.toHaveProperty('parametriInput');
expect(cdu.meta).not.toHaveProperty('date');
expect(cdu).not.toHaveProperty('progressivo');
expect(JSON.parse(JSON.stringify(cdu))).not.toHaveProperty('tech');
```

- [ ] **Step 2: Run the new and mapper tests to verify the old contract fails**

Run:

```bash
npx jest --config jest.config.cjs test/unit/application/context-engine/cdu-contract.test.ts test/unit/application/context-engine/mappers --runInBand
```

Expected: FAIL on renamed/flattened meta fields, VM fields, collection envelopes, movement mapping, and grammar capitalization.

- [ ] **Step 3: Rewrite the contract and shared mappers**

Replace `Cdu.ts` outright with the analysis VM vocabulary; keep only imports/types actually consumed. Implement `elencoVm`, the person collective grammar table, sentence-format descriptions, subject profiles (`BASE`, `CON_DOCENTI`, `CON_CONTINUITA`), canonical movement/date labels, presence calculation, deterministic sorting, and shared document/plan/history mappings. Remove old interfaces rather than deprecating them.

Use `Object.defineProperty` only for `tech` and existing internal metadata. Keep internal assignment/articulation metadata non-enumerable and outside the public CDU interface.

- [ ] **Step 4: Run focused tests and typecheck**

Run:

```bash
npx jest --config jest.config.cjs test/unit/application/context-engine/cdu-contract.test.ts test/unit/application/context-engine/mappers test/unit/application/context-engine/dates.test.ts test/unit/application/context-engine/tech-entities.test.ts --runInBand
npm run typecheck
```

Expected: focused tests PASS; typecheck may still fail only in providers/consumers scheduled for Tasks 2–3. Record that failure list in the task handoff; do not weaken the new types.

- [ ] **Step 5: Commit the contract slice**

```bash
git add src/application/context-engine/Cdu.ts src/application/context-engine/Recipe.ts src/application/context-engine/ContextBuilder.ts src/application/context-engine/dates.ts src/application/context-engine/techEntities.ts src/application/context-engine/CduInternalMetadata.ts src/application/context-engine/mappers test/unit/application/context-engine/cdu-contract.test.ts test/unit/application/context-engine/mappers test/unit/application/context-engine/dates.test.ts test/unit/application/context-engine/tech-entities.test.ts
git commit -m "refactor(cdu): replace contract and canonical mappers"
```

---

### Task 2: Rebuild provider assembly and recipe presence rules

**Files:**

- Modify: `src/application/context-engine/ContextProvider.ts`
- Modify: `src/application/context-engine/ContextEngineFactory.ts`
- Modify: `src/application/context-engine/Recipe.ts`
- Modify: `src/application/context-engine/TeachingCouncilProjection.ts`
- Modify: `src/application/context-engine/ElencoMaterieConPermessi.ts`
- Modify: every file in `src/application/context-engine/providers/`
- Modify: `src/application/storico/presenza.ts`
- Modify: `src/domain/repositories/IMovimentoAlunnoRepository.ts`
- Modify: `src/infrastructure/repositories/MovimentoAlunnoRepository.ts`
- Modify: `src/config/ApplicationComposition.ts`
- Modify: `src/config/Bootstrap.ts`
- Modify: every test in `test/unit/application/context-engine/`
- Modify: `test/unit/infrastructure/movimento-alunno-repository.test.ts`
- Modify: `test/integration/cattedra-chain-verification.test.ts`
- Modify: `test/integration/verbale-cdc.test.ts`

**Interfaces:**

- Extend movement lookup once at the repository boundary so class movement projection includes inactive/withdrawn students without scanning callers:

```typescript
export interface IMovimentoAlunnoRepository {
  findByAlunno(alunno: Alunno): MovimentoAlunno[];
  findEntro(dataInclusiva: string): MovimentoAlunno[];
}
```

`MovimentoAlunnoRepository.findEntro` returns all rows with `DATA <= dataInclusiva`, newest first. `AlunnoProvider` filters this shared result by student; the class movement provider filters the same result by ordinary/partner/parent scope and resolves the student even when inactive.

- Keep one provider token per semantic section. Add only `movimenti` if no existing owner can produce both `focus.alunno.movimenti` and `focus.classe.movimenti` from the same source without duplication.

- [ ] **Step 1: Rewrite recipe E2E tests as the node-presence matrix**

In `recipe.test.ts` and `recipes-e2e.test.ts`, assert analysis section 10 exactly: each recipe emits only its allowed root/focus nodes; provider-created containers always include empty arrays and companion booleans; disabled providers leave their node absent. Add explicit cases for ordinary class, partner, articulated parent, student, plan, carenza, teacher, subject/cattedra, department, document, and email recipes.

- [ ] **Step 2: Add failing provider tests for canonical class/student movement behavior**

Cover the acceptance cases that the current implementation cannot satisfy:

```typescript
expect(parent.focus.classe!.movimenti.interni[0]).toMatchObject({
  direzione: 'INTERNA',
  isMovimentoInterno: true
});
expect(sourcePartner.focus.classe!.movimenti.uscite[0].studente.email).toBe('uscito@scuola.it');
expect(destinationPartner.focus.classe!.movimenti.entrate[0].isEntrata).toBe(true);
expect(student.focus.alunno!.presenza.annoPrecedente).toEqual({
  isCalcolato: false,
  isPresente: false
});
```

Also assert council effective/titolare/supplenza partitions, student curriculum filtering including IRC/ALT/NO, partner self-contained rows, all `hasXxx`/`numero`/description invariants, and deterministic order.

- [ ] **Step 3: Implement the providers against only canonical mappers**

Update all 30 providers in place. Move fields directly onto `ClasseFocusVM`, `AlunnoFocusVM`, `PersonaVM`, and `DestinatarioVM`; construct semantic containers (`consiglio`, `studenti`, `movimenti`, `pianiPersonalizzati`, `documenti`, `materie`, `esame`, `progetti`, `rappresentanti`, `tutor`) with their partitions and companions. Reuse `TeachingCouncilProjection`, `CollectionProjector`, `LazyRef`, existing repository entities, and existing role-resolution services. Delete duplicate per-provider person/subject/date/document formatting.

Update provider order in `Recipe.ts` only where the new dependency is real: base focus first, then source collections, then partitions/history. Register any added movement provider and repository dependency in the existing composition root; do not create another factory/container.

- [ ] **Step 4: Run the full context-engine and integration slices**

Run:

```bash
npx jest --config jest.config.cjs test/unit/application/context-engine --runInBand
npm run test:integration -- --runInBand
npm run typecheck
```

Expected: all CDU producer tests and both integration suites PASS; remaining type errors are limited to direct consumers in Task 3.

- [ ] **Step 5: Commit the provider slice**

```bash
git add src/application/context-engine src/application/storico/presenza.ts src/domain/repositories/IMovimentoAlunnoRepository.ts src/infrastructure/repositories/MovimentoAlunnoRepository.ts src/config/ApplicationComposition.ts src/config/Bootstrap.ts test/unit/application/context-engine test/unit/infrastructure/movimento-alunno-repository.test.ts test/integration
git commit -m "refactor(cdu): rebuild providers for optimized structure"
```

---

### Task 3: Cut pipelines, renderers, strategies, and templates to the new paths

**Files:**

- Modify: `src/application/pipelines/documentSteps.ts`
- Modify: `src/application/pipelines/emailSteps.ts`
- Modify: `src/application/pipelines/postProcessActions.ts`
- Modify: `src/application/email/boxes.ts`
- Modify: `src/application/services/RisolutoreRuoliService.ts`
- Modify: `src/application/services/DocumentGenerationService.ts`
- Modify: `src/application/services/EmailNotificationService.ts`
- Modify: `src/application/strategies/DocPersonalizzatoGeneratorStrategy.ts`
- Modify: `src/application/strategies/DocumentoConTabelleImportateGeneratorStrategy.ts`
- Modify: `src/application/strategies/DocumentoGenericoGeneratorStrategy.ts`
- Modify: `src/application/strategies/FoglioGenericoGeneratorStrategy.ts`
- Modify: `src/application/strategies/SheetMaterieConPermessiGeneratorStrategy.ts`
- Modify: `src/application/strategies/SheetMaterieGeneratorStrategy.ts`
- Modify: CDU-dependent tests under `test/unit/application/`, `test/integration/`, and `test/build/`
- Modify: `test/fixtures/tables.ts`

**Interfaces:**

- Document pipeline writes `cdu.meta.progressivo` only after folder resolution and reads it for document body, file name, and log registration.
- Email pipeline builds a flat `DestinatarioVM`; render output is:

```typescript
render.boxes = {
  perId: Record<string, BoxRenderizzatoVM>,
  elenco: BoxRenderizzatoVM[],
  visibili: BoxRenderizzatoVM[],
  hasElenco: boolean,
  hasVisibili: boolean,
  numero: number
};
```

- All built-in/default/test templates use only canonical paths and the analysis section 12 rules: scalar replacement, array iteration, boolean conditions, and presentational filters. Templates never compare domain IDs/enums or filter collections.

- [ ] **Step 1: Turn current consumer tests into failing new-path tests**

Update pipeline, service, email-box, generator-strategy, Sheet strategy, and integration expectations first. Include a render-order test proving `meta.configurazioneBox.elenco -> render.boxes.elenco -> render.boxes.visibili`, a recipient test for computed roles/replacement, and a document lifecycle test proving `meta.progressivo` is absent during folder resolution and present afterward.

- [ ] **Step 2: Replace every direct old-path read/write**

Use graph `search_code` over `src/` and `test/` for the retired names listed in Global Constraints, then change all direct consumers. Do not add a compatibility accessor. Simplify consumers where precomputed CDU partitions/descriptions replace local filtering, label building, or concatenation.

- [ ] **Step 3: Update template fixtures/provisioning inputs**

Rewrite repository fixtures and any configured template strings to canonical paths. Add one document loop and one email box fixture that exercise a self-contained student/movement/council item; delete fixtures whose only purpose was legacy-path compatibility.

- [ ] **Step 4: Run consumer tests and prove retired paths are gone**

Run:

```bash
npx jest --config jest.config.cjs test/unit/application/pipelines test/unit/application/email-boxes.test.ts test/unit/application/risolutore-ruoli-service.test.ts test/unit/application/generator-strategies.test.ts test/unit/application/sheet-materie-generator.test.ts test/unit/application/document-generation-service.test.ts test/unit/application/email-notification-service.test.ts --runInBand
npm run test:integration -- --runInBand
npm run typecheck
```

Then use codebase-memory `search_code` for:

```text
anagrafica|status|didattica|listaCompleta|consiglioDiClasse|classiMateria|parametriInput|date.oggi|isEmpty|visibile
```

Expected: no production CDU-path matches; any remaining match is an unrelated domain term or a negative migration assertion.

- [ ] **Step 5: Commit the consumer slice**

```bash
git add src/application/pipelines src/application/email src/application/services/RisolutoreRuoliService.ts src/application/services/DocumentGenerationService.ts src/application/services/EmailNotificationService.ts src/application/strategies test/unit/application test/integration test/build test/fixtures/tables.ts
git commit -m "refactor(cdu): migrate pipelines and templates to canonical paths"
```

---

### Task 4: Align live-GAS checks, promote documentation, and run release gates

**Files:**

- Modify: `src/onlinetests/checks/contextEngineChecks.ts`
- Modify: `src/onlinetests/checks/articolazioneChecks.ts`
- Modify: `src/onlinetests/checks/storicoChecks.ts`
- Modify: `src/onlinetests/checks/supplenzeRuoliChecks.ts`
- Modify: `src/onlinetests/checks/itpDottedChecks.ts`
- Modify: `src/onlinetests/checks/aclRealiChecks.ts`
- Modify: `src/onlinetests/checks/e2eScenarioChecks.ts`
- Modify: `src/onlinetests/checks/documentiChecks.ts`
- Modify: `src/onlinetests/checks/emailChecks.ts`
- Modify: `src/onlinetests/checks/pipelineChecks.ts`
- Modify: `src/onlinetests/checks/repositoryChecks.ts`
- Modify: `src/onlinetests/E2eActiveRepresentativesInterceptor.ts`
- Modify: `src/onlinetests/E2eTemplateProvisioner.ts`
- Modify: `src/onlinetests/SampleDatabaseBuilder.ts`
- Modify: `src/onlinetests/data/SharedTestContracts.ts`
- Modify: `src/onlinetests/data/SharedTestDatabaseBuilder.ts`
- Modify: `src/onlinetests/data/Seeders.ts`
- Modify: `src/onlinetests/data/fixtures.ts`
- Modify: `src/onlinetests/report/MaterializeHelper.ts`
- Modify: `test/unit/onlinetests/acl-reali-checks.test.ts`
- Modify: `test/unit/onlinetests/articolazione-checks.test.ts`
- Modify: `test/unit/onlinetests/context-engine-checks.test.ts`
- Modify: `test/unit/onlinetests/documentiChecks.test.ts`
- Modify: `test/unit/onlinetests/e2e-active-representatives-interceptor.test.ts`
- Modify: `test/unit/onlinetests/e2e-sample-database-builder.test.ts`
- Modify: `test/unit/onlinetests/e2e-scenario-checks.test.ts`
- Modify: `test/unit/onlinetests/e2e-template-provisioner.test.ts`
- Modify: `test/unit/onlinetests/emailChecks.test.ts`
- Modify: `test/unit/onlinetests/fixtures.test.ts`
- Modify: `test/unit/onlinetests/fullOnlineTests.test.ts`
- Modify: `test/unit/onlinetests/itp-dotted-checks.test.ts`
- Modify: `test/unit/onlinetests/materializeHelper.test.ts`
- Modify: `test/unit/onlinetests/pipeline-checks.test.ts`
- Modify: `test/unit/onlinetests/repository-checks.test.ts`
- Modify: `test/unit/onlinetests/sample-database-builder.test.ts`
- Modify: `test/unit/onlinetests/seeders.test.ts`
- Modify: `test/unit/onlinetests/shared-test-database-builder-migration.test.ts`
- Modify: `test/unit/onlinetests/storico-checks.test.ts`
- Modify: `test/unit/onlinetests/supplenze-ruoli-checks.test.ts`
- Replace: `SPECS_ALDO/02_CDU_STRUTTURA.md` with the implemented contract from `ANALISI_CDU_OTTIMIZZAZIONE_NEW.md`
- Modify: `SPECS_ALDO/GUIDA_USO_PLACEHOLDER.md`
- Modify: `SPECS_ALDO/00_PANORAMICA.md`
- Modify: `SPECS_ALDO/01_SCHEMA_DATABASE.md` only where CDU cross-references/path examples changed
- Modify: `SPECS_ALDO/03_VALUE_OBJECTS_ED_ENUM.md`
- Modify: `SPECS_ALDO/MAT_NON_STANDARD.md`
- Modify: `README.md`
- Delete: `ANALISI_CDU_OTTIMIZZAZIONE_NEW.md` after its content is promoted, to leave one CDU source of truth

- [ ] **Step 1: Update online checks to assert the public contract, not old implementation details**

Keep the existing check files and batch registration. In `contextEngineChecks.ts`, assert root/node presence, `tech` non-enumerability, serialization, collection invariants, deterministic order, and path-depth budget. In specialized checks, assert articulated movement direction, inactive-student movement visibility, council/supplenza partitions, subject profiles/ITP, history materialization, document collections, and email `destinatario`/`render` shapes. Update builders/seeders with the minimum rows needed for those cases.

- [ ] **Step 2: Run offline unit tests for every online check**

Run:

```bash
npx jest --config jest.config.cjs test/unit/onlinetests --runInBand
```

Expected: PASS with no old CDU path in online source or its unit mirrors.

- [ ] **Step 3: Promote and reconcile documentation**

Replace the old canonical `02_CDU_STRUTTURA.md` with the implemented analysis, fold in the explicit optional lifecycle for `meta.progressivo`, and update only current user-facing documents that contain obsolete CDU paths. Delete the untracked analysis artifact after promotion. Do not rewrite historical plans/specs.

- [ ] **Step 4: Run the complete offline/build gate**

Run in this order and fix the implementation, never the assertions, when a contract invariant fails:

```bash
npm run typecheck
npm run lint
npm test -- --runInBand
npm run test:integration -- --runInBand
npm run test:build -- --runInBand
npm run build:online
git diff --check
```

Expected: every command exits 0; online bundle contains the updated checks and no stale online-only artifact in non-online modes.

- [ ] **Step 5: Run mandatory graph audits on the refreshed index**

Re-index `aldo-full-coverage` and `home-giulio-Desktop-ALDO-implementing`, then use the graph to verify:

1. no ALDO call reaches native GAS globals;
2. all ALDO-to-GasLibraryFactory calls still resolve with exact signatures;
3. no non-trigger CDU function/method has zero inbound `CALLS` edges unless it is an exported API intentionally invoked through a dynamic recipe/provider boundary;
4. no new circular application dependency exists;
5. every old CDU path search returns zero production matches.

- [ ] **Step 6: Commit the online/docs/release slice**

```bash
git add -A src/onlinetests test/unit/onlinetests SPECS_ALDO README.md
git commit -m "test(cdu): align online checks and canonical documentation"
```

---

## Completion Criteria

- The serialized CDU matches `SPECS_ALDO/02_CDU_STRUTTURA.md` exactly, apart from non-enumerable `tech` and unresolved optional `meta.progressivo`.
- Every analysis acceptance criterion 1–10 has an offline assertion and at least one live-GAS check at the correct boundary.
- No compatibility fields or consumer fallbacks remain.
- All offline, integration, build, and online-build gates pass; the live online result is reported separately and truthfully.
- `SPECS_ALDO/02_CDU_STRUTTURA.md` is the only authoritative CDU structure document.
