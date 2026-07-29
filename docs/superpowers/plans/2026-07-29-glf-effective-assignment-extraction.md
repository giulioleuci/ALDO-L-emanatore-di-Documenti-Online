# GLF Effective Assignment Extraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move teaching-position precedence, temporal overrides, substitute chains, routing, and CDU collection algorithms into GasLibraryFactory so ALDO consumes them through thin schema adapters and declarative projections.

**Architecture:** `RoleResolutionLib` gains a generic effective-assignment pipeline over arbitrary slot dimensions and row-mapped sources. `ContextEngine` gains a declarative collection projector and interceptor. ALDO maps its SheetDB schema into those APIs, then all CDU, role, email, and ACL consumers share one GLF-backed teaching-assignment port.

**Tech Stack:** Google Apps Script V8, synchronous ES modules in GLF, TypeScript in ALDO, Jest, Webpack/Babel, SheetDBLib, RoleResolutionLib, ContextEngine, GasExpressionEngineLib.

## Global Constraints

- `SPECS_ALDO/01_SCHEMA_DATABASE.md` and `SPECS_ALDO/02_CDU_STRUTTURA.md` are the authoritative ALDO sources.
- Breaking GLF API changes are allowed; ALDO is the only consumer and neither project is in production.
- GLF must remain domain-agnostic: it must never contain `MAIN`, `ITP`, `SPECIFICA`, `IRC`, `ALT`, Italian labels, or school-table names.
- ALDO may retain schema mapping, declarative slot/scope configuration, articulated-class relationship inputs, CDU projections, and domain labels—never reusable resolution or collection algorithms.
- `CLASSI.[MATERIA]`, `CLASSI.[MATERIA].itp`, and every `CLASSI.[MATERIA].[SPECIFICA]` column are equal first-class assignment slots.
- A musical instrument is only an example of arbitrary `SPECIFICA`; no instrument vocabulary may appear in GLF.
- IRC and ALT are ordinary `MATERIE` records classified by `IS_RELIGIONE_ALT=true`; overrides and substitutions must work for both.
- Because `VARIAZIONI_CATTEDRA` and `SUPPLENZE` have no ITP/specificity field, records match all subject slots held by the named old/permanent actor.
- ALDO's substitution chain has no business depth limit: it must resolve to the final actor at any finite depth, with cycle detection. A finite GLF depth guard is optional configuration and must be disabled in ALDO.
- Target runtime is GAS V8: synchronous code only, no Node or unsupported browser APIs in runtime modules.
- Never edit either repository's `dist/` output directly.
- Preserve unrelated dirty-worktree changes. `GasLibraryFactory/` is a separate Git repository; commit GLF work there and ALDO/vendor work in the outer repository.
- Before implementation discovery, use codebase-memory-mcp first and consult `GasLibraryFactory/DOCS_LIBS`; read GLF source only when the docs and graph are insufficient.
- Before claiming completion, run every verification command in Task 7 and inspect the knowledge graph.

---

### Task 1: RoleResolutionLib Effective-Assignment Value Model

**Files:**
- Create: `GasLibraryFactory/RoleResolutionLib/src/core/AssignmentSlot.js`
- Create: `GasLibraryFactory/RoleResolutionLib/src/core/AssignmentCandidate.js`
- Create: `GasLibraryFactory/RoleResolutionLib/src/core/AssignmentOverride.js`
- Create: `GasLibraryFactory/RoleResolutionLib/src/core/EffectiveAssignmentResult.js`
- Create: `GasLibraryFactory/RoleResolutionLib/src/internal/resolution/ResolutionPolicy.js`
- Create: `GasLibraryFactory/RoleResolutionLib/src/internal/resolution/ResolutionTrace.js`
- Modify: `GasLibraryFactory/RoleResolutionLib/src/internal/errors/RoleResolutionError.js`
- Create: `GasLibraryFactory/RoleResolutionLib/src/__tests__/core/EffectiveAssignment.test.js`
- Modify: `GasLibraryFactory/RoleResolutionLib/src/__tests__/internal/errors/RoleResolutionError.test.js`

**Interfaces:**
- Produces:

```js
new AssignmentSlot({ dimensions: Record<string, string | number | boolean | null> })
slot.key // deterministic, dimension-order-independent string
slot.get(name) // dimension value or null
slot.matches(scopeDimensions) // wildcard-aware subset match

new AssignmentCandidate({
  id,
  actorId,
  slot,
  validFrom = null,
  validTo = null,
  source = 'base',
  priority = 0,
  metadata = {}
})
candidate.isValidAt(date)

new AssignmentOverride({
  id,
  previousActorId,
  nextActorId,
  slotScope,
  effectiveFrom,
  source = 'override',
  metadata = {}
})
override.matches(candidate, date)

new ResolutionPolicy({
  tieBehavior = 'THROW',
  missingActorBehavior = 'THROW',
  maxDelegationDepth = null,
  routingPolicy = RoutingPolicy.DELEGATE_OR_PRINCIPAL,
  resultIdentity = ['slot', 'principalActor']
})

new EffectiveAssignmentResult({
  slot,
  baseActor,
  permanentActor,
  effectiveActor,
  delegationChain,
  routing,
  trace,
  metadata
})
```

- Produces typed errors:

```js
MalformedAssignmentSlotError
DuplicateAssignmentSlotError
InconsistentAssignmentOverrideError
AmbiguousAssignmentOverrideError
AssignmentActorNotFoundError
OverlappingDelegationError
```

- Consumes existing `Actor`, `DelegationChain`, `RoutingPolicy`, and `RoleResolutionError`.

- [ ] **Step 1: Write failing value-object tests**

```js
import { AssignmentSlot } from '../../core/AssignmentSlot.js';
import { AssignmentCandidate } from '../../core/AssignmentCandidate.js';
import { AssignmentOverride } from '../../core/AssignmentOverride.js';

describe('effective-assignment value model', () => {
  test('slot keys are deterministic and arbitrary dimensions remain opaque', () => {
    const a = new AssignmentSlot({
      dimensions: { discriminator: 'ANY_VALUE', kind: 'CUSTOM', subject: 'S1' }
    });
    const b = new AssignmentSlot({
      dimensions: { subject: 'S1', kind: 'CUSTOM', discriminator: 'ANY_VALUE' }
    });
    expect(a.key).toBe(b.key);
    expect(a.get('kind')).toBe('CUSTOM');
  });

  test('a dated override matches every candidate held by its previous actor in scope', () => {
    const slot = new AssignmentSlot({
      dimensions: { subject: 'S1', kind: 'CUSTOM', discriminator: 'A' }
    });
    const candidate = new AssignmentCandidate({ id: 'base-1', actorId: 'old', slot });
    const override = new AssignmentOverride({
      id: 'change-1',
      previousActorId: 'old',
      nextActorId: 'new',
      slotScope: { subject: 'S1' },
      effectiveFrom: new Date('2026-01-10')
    });
    expect(override.matches(candidate, new Date('2026-01-09'))).toBe(false);
    expect(override.matches(candidate, new Date('2026-01-10'))).toBe(true);
  });
});
```

- [ ] **Step 2: Run the focused tests and confirm the missing-export failure**

Run from `GasLibraryFactory/`:

```bash
npx jest RoleResolutionLib/src/__tests__/core/EffectiveAssignment.test.js --runInBand
```

Expected: FAIL because `AssignmentSlot`, `AssignmentCandidate`, and
`AssignmentOverride` are not implemented/exported.

- [ ] **Step 3: Implement immutable value objects and deterministic slot matching**

Implement constructor validation, defensive metadata/dimension copies,
`Object.freeze`, ISO-safe date parsing through the existing date helper, stable
sorted-key serialization, wildcard `*` matching, and validity boundaries inclusive
of `validFrom`/`validTo`.

Core matching shape:

```js
matches(scopeDimensions = {}) {
  return Object.entries(scopeDimensions).every(([name, expected]) => {
    if (expected === '*') return true;
    return this.get(name) === expected;
  });
}
```

Do not add school-specific enums. Empty dimensions, blank actor IDs, invalid dates,
and invalid policies must throw the new typed errors.

- [ ] **Step 4: Add failing tests for result immutability, policy defaults, and every typed error**

Cover:

```js
expect(() => new AssignmentSlot({ dimensions: {} }))
  .toThrow(MalformedAssignmentSlotError);
expect(() => new ResolutionPolicy({ tieBehavior: 'IGNORE' }))
  .toThrow(RoleValidationError);
expect(Object.isFrozen(result.trace)).toBe(true);
```

- [ ] **Step 5: Implement `ResolutionPolicy`, `ResolutionTrace`, result serialization, and errors**

`ResolutionTrace` must append immutable entries shaped as:

```js
{
  stage: 'BASE' | 'OVERRIDE' | 'DELEGATION' | 'ROUTING',
  decision: 'CONSIDERED' | 'REJECTED' | 'SELECTED' | 'APPLIED',
  candidateId: string | null,
  actorId: string | null,
  reason: string,
  metadata: Record<string, unknown>
}
```

Add `toJSON()` on every public value object and verify round-trip-safe plain data.

- [ ] **Step 6: Run RoleResolutionLib tests**

```bash
npx jest RoleResolutionLib/src/__tests__/core/EffectiveAssignment.test.js RoleResolutionLib/src/__tests__/internal/errors/RoleResolutionError.test.js --runInBand
```

Expected: PASS.

- [ ] **Step 7: Commit in the GLF repository**

```bash
git -C GasLibraryFactory add RoleResolutionLib/src/core RoleResolutionLib/src/internal/resolution RoleResolutionLib/src/internal/errors/RoleResolutionError.js RoleResolutionLib/src/__tests__
git -C GasLibraryFactory commit -m "feat(role-resolution): add effective assignment model"
```

---

### Task 2: Generic Sources and EffectiveAssignmentResolver

**Files:**
- Create: `GasLibraryFactory/RoleResolutionLib/src/registry/EffectiveAssignmentSource.js`
- Create: `GasLibraryFactory/RoleResolutionLib/src/registry/MappedAssignmentSources.js`
- Create: `GasLibraryFactory/RoleResolutionLib/src/internal/resolution/EffectiveAssignmentResolver.js`
- Create: `GasLibraryFactory/RoleResolutionLib/src/__tests__/registry/MappedAssignmentSources.test.js`
- Create: `GasLibraryFactory/RoleResolutionLib/src/__tests__/resolution/EffectiveAssignmentResolver.test.js`
- Create: `GasLibraryFactory/test/__tests__/integration/EffectiveAssignmentResolution.test.js`

**Interfaces:**
- Consumes Task 1 value objects.
- Consumes existing `Actor`, `Delegation`, `DelegationChain`,
  `InMemoryDelegationSource`, and `RoutingResolver`.
- Produces:

```js
class AssignmentSource {
  getAssignments(context, asOfDate) {}
}

class OverrideSource {
  getOverrides(context, asOfDate) {}
}

class ActorSource {
  getActor(actorId) {}
}

new WideRowAssignmentSource({
  rows,
  rowIdentityPath,
  actorSource,
  columns: [{
    name,
    slotDimensions,
    contextDimensions
  }],
  csv = true
})

new MappedOverrideSource({
  rows,
  mapping: {
    id, previousActorId, nextActorId, effectiveFrom,
    scope: Record<string, string>
  }
})

new MappedDelegationSource({
  rows,
  mapping: {
    id, principalId, delegateId, validFrom, validTo,
    scope: Record<string, string>
  }
})

new CompositeAssignmentSource({
  sources,
  identity = ['slot.key', 'actorId'],
  mergeMetadata
})

new EffectiveAssignmentResolver({
  actorSource,
  assignmentSource,
  overrideSource,
  delegationSource,
  policy,
  routingResolver
})

resolver.resolve({
  context: Record<string, unknown>,
  asOfDate: Date,
  routingPolicy?: RoutingPolicyValue
}): EffectiveAssignmentResult[]
```

- [ ] **Step 1: Write failing mapped-source tests**

```js
test('wide rows emit one candidate per CSV actor and preserve arbitrary slot dimensions', () => {
  const source = new WideRowAssignmentSource({
    rows: [{ ID: 'group-1', BASE: 'a@example.test,b@example.test' }],
    rowIdentityPath: 'ID',
    actorSource,
    columns: [{
      name: 'BASE',
      slotDimensions: { subject: 'S1', kind: 'K1', discriminator: 'D1' },
      contextDimensions: { group: { from: 'ID' } }
    }]
  });

  const candidates = source.getAssignments({ group: 'group-1' }, new Date('2026-02-01'));
  expect(candidates.map((c) => c.actorId)).toEqual([
    'a@example.test',
    'b@example.test'
  ]);
  expect(candidates[0].slot.get('discriminator')).toBe('D1');
});
```

Also test blank cells, trimmed CSV values, `*`, configured field paths, and
composite-source deduplication.

- [ ] **Step 2: Run mapped-source tests and confirm failure**

```bash
npx jest RoleResolutionLib/src/__tests__/registry/MappedAssignmentSources.test.js --runInBand
```

Expected: FAIL because mapped sources do not exist.

- [ ] **Step 3: Implement source interfaces and mapped adapters**

Mapped sources must accept arrays or synchronous `rows(context)` functions.
Mappings may be literal values, `{ from: 'FIELD' }`, or
`{ parse: 'csv', from: 'FIELD' }`. Put generic path lookup and CSV/`*` matching in
this module; do not ask ALDO to reimplement them.

- [ ] **Step 4: Write the failing resolver matrix**

Use domain-neutral actor IDs and opaque dimensions. Include:

```js
test.each([
  ['before override', '2026-01-09', 'old', 'old'],
  ['after override', '2026-01-10', 'new', 'new'],
  ['after override with delegate', '2026-01-15', 'new', 'substitute-2']
])('%s', (_name, iso, permanentId, effectiveId) => {
  const [result] = resolver.resolve({
    context: { group: 'G1', subject: 'S1' },
    asOfDate: new Date(iso)
  });
  expect(result.permanentActor.id).toBe(permanentId);
  expect(result.effectiveActor.id).toBe(effectiveId);
});
```

Add cases for latest override, tied latest override, stale previous actor, missing
next actor, two base actors in one slot, multiple opaque slot kinds, wildcard and
CSV scopes, direct delegation, A→B→C, cycle, overlapping applicable delegations,
a valid chain longer than ten links with `maxDelegationDepth: null`, a configured
finite-depth overflow, and each routing policy used by ALDO.

- [ ] **Step 5: Run resolver tests and confirm failure**

```bash
npx jest RoleResolutionLib/src/__tests__/resolution/EffectiveAssignmentResolver.test.js --runInBand
```

Expected: FAIL because `EffectiveAssignmentResolver` does not exist.

- [ ] **Step 6: Implement the resolver in four explicit stages**

Implementation rules:

```text
BASE:
  load and group candidates by slot key

OVERRIDE:
  validate that every applicable override matches at least one base actor
  choose max effectiveFrom per candidate
  throw on ties at that maximum

DELEGATION:
  start from the post-override permanent actor
  find context-valid delegations
  reject overlapping outgoing arcs
  follow the existing validated chain implementation

ROUTING:
  call RoutingResolver with principal/effective/chain/policy
  never reproduce its policy switch
```

Every rejection and selection must append a `ResolutionTrace` entry. Results must
be deterministic by slot key, then base actor ID.

- [ ] **Step 7: Add and run the integration test**

The integration test must construct mapped base/override/delegation sources from
plain row arrays and prove one complete resolution without custom callbacks:

```bash
npx jest --config jest.integration.config.cjs test/__tests__/integration/EffectiveAssignmentResolution.test.js --runInBand
```

Expected: PASS.

- [ ] **Step 8: Run the whole RoleResolutionLib suite**

```bash
npx jest RoleResolutionLib/src/__tests__ --runInBand
```

Expected: PASS with no regression in the existing role/delegation APIs.

- [ ] **Step 9: Commit in the GLF repository**

```bash
git -C GasLibraryFactory add RoleResolutionLib/src/registry RoleResolutionLib/src/internal/resolution/EffectiveAssignmentResolver.js RoleResolutionLib/src/__tests__ test/__tests__/integration/EffectiveAssignmentResolution.test.js
git -C GasLibraryFactory commit -m "feat(role-resolution): resolve temporal effective assignments"
```

---

### Task 3: ContextEngine Declarative Collection Projection

**Files:**
- Create: `GasLibraryFactory/ContextEngine/src/projection/ProjectionRegistry.js`
- Create: `GasLibraryFactory/ContextEngine/src/projection/CollectionProjector.js`
- Create: `GasLibraryFactory/ContextEngine/src/interceptors/CollectionProjectionInterceptor.js`
- Create: `GasLibraryFactory/ContextEngine/src/internal/errors/CollectionProjectionError.js`
- Create: `GasLibraryFactory/ContextEngine/src/__tests__/CollectionProjector.test.js`
- Create: `GasLibraryFactory/ContextEngine/src/__tests__/CollectionProjectionInterceptor.test.js`
- Modify: `GasLibraryFactory/ContextEngine/src/__tests__/ContextAssemblerInterceptors.test.js`

**Interfaces:**
- Produces:

```js
new ProjectionRegistry()
  .register('strategyName', (value, operation, runtime) => nextValue)

new CollectionProjector({
  registry,
  expressionEngine = null,
  logger = null
})

projector.project(inputArray, operations, runtimeContext): {
  value: unknown[],
  trace: ProjectionTraceEntry[]
}

new CollectionProjectionInterceptor(logger, projector, {
  targetProviders,
  targetPaths,
  operations,
  optionFlag = null
})
```

- Built-in operation contracts:

```js
{ type: 'filter', expression }
{ type: 'map', fields: Record<string, { from?: string, value?: unknown }> }
{ type: 'flatMap', path?: string, strategy?: string, mergeParent?: boolean }
{ type: 'groupBy', keys: string[], aggregates: Record<string, AggregateConfig> }
{ type: 'distinctBy', keys: string[] }
{ type: 'sortBy', keys: Array<{ path: string, direction: 'ASC' | 'DESC' }> }
{ type: 'prepend', value: unknown, when?: string }
{ type: 'append', value: unknown, when?: string }
{ type: 'strategy', name: string, config?: Record<string, unknown> }
```

- [ ] **Step 1: Write failing pure-projector tests**

```js
test('flatMap, groupBy, distinctBy and stable sort support zero-to-many projection', () => {
  const result = projector.project(
    [
      { actor: 'b', slots: [{ subject: 'S2' }, { subject: 'S1' }] },
      { actor: 'a', slots: [] },
      { actor: 'b', slots: [{ subject: 'S1' }] }
    ],
    [
      { type: 'flatMap', path: 'slots', mergeParent: true },
      {
        type: 'groupBy',
        keys: ['actor'],
        aggregates: { subjects: { type: 'collectDistinct', path: 'subject' } }
      },
      { type: 'sortBy', keys: [{ path: 'actor', direction: 'ASC' }] }
    ],
    {}
  );
  expect(result.value).toEqual([{ actor: 'b', subjects: ['S2', 'S1'] }]);
});
```

Add tests for nested target paths, conditionally prepended values, missing paths,
stable ordering, configured strategies, input immutability, and trace contents.

- [ ] **Step 2: Run tests and confirm missing-projector failure**

```bash
npx jest ContextEngine/src/__tests__/CollectionProjector.test.js --runInBand
```

Expected: FAIL because the projector is absent.

- [ ] **Step 3: Implement the pure projector and registry**

All built-ins must be synchronous and operate on copies. Reuse the injected
GasExpressionEngineLib instance for expressions; never use `eval` or `Function`.
Unknown operation types, duplicate strategy names, non-array inputs for collection
operations, invalid paths, and invalid aggregate configurations throw
`CollectionProjectionError` with operation index and target path.

- [ ] **Step 4: Write failing interceptor integration tests**

```js
test('projects configured nested arrays after the selected provider', () => {
  const interceptor = new CollectionProjectionInterceptor(logger, projector, {
    targetProviders: ['assignments'],
    targetPaths: ['focus.items'],
    operations: [{ type: 'distinctBy', keys: ['id'] }]
  });
  const context = { focus: { items: [{ id: 1 }, { id: 1 }] } };
  interceptor.intercept('assignments', context, context, {});
  expect(context.focus.items).toEqual([{ id: 1 }]);
});
```

- [ ] **Step 5: Implement interceptor mutation semantics**

The interceptor delegates every target-path value to `CollectionProjector`; it
contains no transformation algorithms. Preserve existing interceptor ordering and
return the original provider result/context shape expected by `ContextAssembler`.

- [ ] **Step 6: Run ContextEngine tests**

```bash
npx jest ContextEngine/src/__tests__/CollectionProjector.test.js ContextEngine/src/__tests__/CollectionProjectionInterceptor.test.js ContextEngine/src/__tests__/ContextAssemblerInterceptors.test.js --runInBand
```

Expected: PASS.

- [ ] **Step 7: Commit in the GLF repository**

```bash
git -C GasLibraryFactory add ContextEngine/src/projection ContextEngine/src/interceptors/CollectionProjectionInterceptor.js ContextEngine/src/internal/errors/CollectionProjectionError.js ContextEngine/src/__tests__
git -C GasLibraryFactory commit -m "feat(context-engine): add declarative collection projection"
```

---

### Task 4: Publish the Breaking GLF Surface and Refresh ALDO Vendor Types

**Files:**
- Modify: `GasLibraryFactory/RoleResolutionLib/index.js`
- Modify: `GasLibraryFactory/ContextEngine/index.js`
- Modify: `GasLibraryFactory/RoleResolutionLib/README.md`
- Modify: `GasLibraryFactory/ContextEngine/README.md`
- Modify: `GasLibraryFactory/DOCS_LIBS/RoleResolutionLib.md`
- Modify: `GasLibraryFactory/DOCS_LIBS/ContextEngine.md`
- Delete: `GasLibraryFactory/RoleResolutionLib/src/internal/resolution/PriorityChainResolver.js`
- Delete: `GasLibraryFactory/RoleResolutionLib/src/__tests__/internal/resolution/PriorityChainResolver.test.js`
- Delete: `GasLibraryFactory/ContextEngine/src/interceptors/SwapAndEnrichInterceptor.js`
- Delete: `GasLibraryFactory/ContextEngine/src/__tests__/SwapAndEnrichInterceptor.test.js`
- Modify: `types/gaslibs/index.d.ts`
- Regenerate: `vendor/gaslibs.Code.js`
- Regenerate: `vendor/CHECKSUM`
- Create: `test/build/gaslibs-api.test.ts`

**Interfaces:**
- Exports all Task 1–3 public types.
- Removes `PriorityChainResolver` and `SwapAndEnrichInterceptor`.
- ALDO ambient declarations exactly mirror the exported constructor/method
  signatures from Tasks 1–3.

- [ ] **Step 1: Add failing GLF export tests**

Add assertions to the closest public API tests, or create focused index tests:

```js
expect(RoleResolutionLib.EffectiveAssignmentResolver).toBeDefined();
expect(RoleResolutionLib.WideRowAssignmentSource).toBeDefined();
expect(RoleResolutionLib.PriorityChainResolver).toBeUndefined();
expect(ContextEngine.CollectionProjector).toBeDefined();
expect(ContextEngine.CollectionProjectionInterceptor).toBeDefined();
expect(ContextEngine.SwapAndEnrichInterceptor).toBeUndefined();
```

- [ ] **Step 2: Export new APIs and remove obsolete APIs/files**

Update both library `index.js` files and the monorepo public bundle surface. Remove
the obsolete implementation files and tests only after confirming no other GLF
module imports them:

```bash
rg -n "PriorityChainResolver|SwapAndEnrichInterceptor" GasLibraryFactory --glob '!dist/**'
```

Expected after cleanup: matches only in migration history or intentionally updated
documentation explaining removal; no runtime imports.

- [ ] **Step 3: Regenerate GLF API documentation**

Run from `GasLibraryFactory/`:

```bash
npm run docs
```

Manually verify the generated docs state that slot dimensions are opaque and that
collection projection can perform zero-to-many transforms.

- [ ] **Step 4: Run complete GLF verification**

```bash
npm test
npm run test:integration
npm run lint
npm run format:check
npm run build:testing
npm run build:testoffline
npm run build:production
```

Expected: every command exits 0. Inspect bundle warnings; do not accept a new
circular dependency or GAS-incompatible API.

- [ ] **Step 5: Commit the breaking GLF publication**

```bash
git -C GasLibraryFactory add RoleResolutionLib ContextEngine DOCS_LIBS
git -C GasLibraryFactory commit -m "feat: publish effective assignment and projection APIs"
```

- [ ] **Step 6: Refresh ALDO's vendor bundle**

Run from the outer ALDO repository:

```bash
npm run refresh:vendor
npm run verify:vendor
```

Expected: `vendor/gaslibs.Code.js` and `vendor/CHECKSUM` reflect the exact GLF
commit from Step 5.

- [ ] **Step 7: Replace ALDO ambient declarations**

Remove the old `PriorityChainResolver`/`SwapAndEnrichInterceptor` declarations and
add the exact Task 1–3 declarations. Do not weaken new public types to `any`; use
`unknown`, records, discriminated operation unions, and explicit result types.

- [ ] **Step 8: Add and run ALDO public-surface build test**

The build test must instantiate or reference every new ambient export and assert
the removed globals are absent from the built bundle:

```bash
npm run typecheck
npm run test:build
npm run verify:vendor
```

Expected: PASS.

- [ ] **Step 9: Commit vendor and declaration changes in ALDO**

```bash
git add vendor/gaslibs.Code.js vendor/CHECKSUM types/gaslibs/index.d.ts test/build/gaslibs-api.test.ts
git commit -m "chore: consume GLF effective assignment APIs"
```

---

### Task 5: ALDO Teaching-Slot Adapter and Resolution Port

**Files:**
- Create: `src/application/ports/ITeachingAssignmentResolver.ts`
- Create: `src/infrastructure/role-resolution/AldoTeachingResolutionConfig.ts`
- Create: `src/infrastructure/role-resolution/AldoTeachingAssignmentResolver.ts`
- Modify: `src/config/schema.ts`
- Modify: `src/infrastructure/repositories/ClasseRepository.ts`
- Modify: `src/domain/repositories/IClasseRepository.ts`
- Modify: `src/config/Bootstrap.ts`
- Modify: `src/application/context-engine/ContextEngineFactory.ts`
- Create: `test/unit/infrastructure/aldo-teaching-assignment-resolver.test.ts`
- Modify: `test/unit/infrastructure/classe-repository.test.ts`
- Modify: `test/fixtures/tables.ts`

**Interfaces:**
- Produces:

```ts
export type TeachingSlotKind = 'MAIN' | 'ITP' | 'SPECIFICA';

export interface TeachingSlot {
  materia: MateriaId;
  kind: TeachingSlotKind;
  specifica: string | null;
}

export interface TeachingAssignment {
  slot: TeachingSlot;
  classeId: ClasseId;
  titolareNominale: Docente;
  titolare: Docente;
  docenteEffettivo: Docente;
  delegationChain: Docente[];
  routing: {
    primary: Docente[];
    cc: Docente[];
    bcc: Docente[];
  };
  trace: readonly unknown[];
}

export interface ITeachingAssignmentResolver {
  resolveMateria(
    classe: Classe,
    materia: MateriaId,
    data: Date,
    routingPolicy?: RoutingPolicyValue
  ): TeachingAssignment[];

  resolveConsiglio(
    classe: Classe,
    data: Date,
    options?: {
      includeReligioneAlt?: boolean;
      routingPolicy?: RoutingPolicyValue;
    }
  ): TeachingAssignment[];
}
```

- `AldoTeachingAssignmentResolver` must delegate all precedence, matching,
  delegation, deduplication, and routing to GLF.

- [ ] **Step 1: Expand fixtures with a complete slot matrix**

Add neutral arbitrary specificities plus one musical example:

```ts
MATERIE: [
  { ID: 'MAT', IS_RELIGIONE_ALT: false },
  { ID: 'INF', IS_RELIGIONE_ALT: false },
  { ID: 'LAB', IS_RELIGIONE_ALT: false },
  { ID: 'INTERPRET', IS_RELIGIONE_ALT: false },
  { ID: 'IRC', IS_RELIGIONE_ALT: true },
  { ID: 'ALT', IS_RELIGIONE_ALT: true }
]

CLASSI row:
{
  ID: '5A',
  MAT: 'main@school.test',
  'INF.itp': 'itp@school.test',
  'LAB.GRUPPO_A': 'specific-a@school.test',
  'LAB.GRUPPO_B': 'specific-b@school.test',
  'INTERPRET.CHITARRA': 'guitar@school.test',
  IRC: 'irc@school.test',
  ALT: 'alt@school.test'
}
```

Add every referenced actor to `DOCENTI`.

- [ ] **Step 2: Write failing repository slot-enumeration tests**

```ts
expect(repo.getTeachingSlots(classe)).toEqual(
  expect.arrayContaining([
    expect.objectContaining({ column: 'MAT', kind: 'MAIN', specifica: null }),
    expect.objectContaining({ column: 'INF.itp', kind: 'ITP', specifica: null }),
    expect.objectContaining({
      column: 'LAB.GRUPPO_A',
      kind: 'SPECIFICA',
      specifica: 'GRUPPO_A'
    }),
    expect.objectContaining({
      column: 'INTERPRET.CHITARRA',
      kind: 'SPECIFICA',
      specifica: 'CHITARRA'
    })
  ])
);
```

The repository method exposes row/column descriptors only; it must not resolve
overrides or substitutions.

- [ ] **Step 3: Implement descriptor enumeration without school-case algorithms**

Add this port:

```ts
getTeachingSlots(classe: Classe): Array<{
  column: string;
  materia: MateriaId;
  kind: TeachingSlotKind;
  specifica: string | null;
  actorEmails: string[];
}>;
```

Build column descriptors from the actual `MATERIE` IDs and row keys. Exact subject
ID matches are MAIN; `.itp` is ITP; every other `.<suffix>` is SPECIFICA. Preserve
arbitrary suffix text. IRC/ALT are discovered as exact subject IDs, not special
repository branches.

- [ ] **Step 4: Write the failing ALDO consumption matrix**

For every MAIN/ITP/SPECIFICA/IRC/ALT slot, assert:

```ts
const assignments = resolver.resolveConsiglio(classe, new Date('2026-02-15'), {
  includeReligioneAlt: true,
  routingPolicy: RoutingPolicy.DELEGATE_OR_PRINCIPAL
});

expect(byColumn(assignments, 'LAB.GRUPPO_A')).toMatchObject({
  titolareNominale: expect.objectContaining({ id: 'specific-a@school.test' }),
  titolare: expect.objectContaining({ id: 'specific-new@school.test' }),
  docenteEffettivo: expect.objectContaining({ id: 'specific-sub@school.test' })
});
```

Include:

- latest and tied permanent changes;
- stale old-holder failure;
- missing new-holder failure;
- direct and transitive substitutes;
- cycle and overlapping substitute failures;
- CSV and `*` scopes;
- one actor holding multiple arbitrary specificities;
- IRC and ALT changes and substitutes;
- articulated partner classes with main, ITP, and SPECIFICA slots.

- [ ] **Step 5: Implement only the ALDO-to-GLF configuration adapter**

`AldoTeachingResolutionConfig.ts` maps:

```ts
CLASSI descriptors -> WideRowAssignmentSource columns
VARIAZIONI_CATTEDRA -> MappedOverrideSource mapping
SUPPLENZE -> MappedDelegationSource mapping
DOCENTI -> ActorSource
articulated partners -> CompositeAssignmentSource inputs
ResolutionPolicy.maxDelegationDepth -> null
```

`AldoTeachingAssignmentResolver` converts GLF actors/results to `Docente`,
`MateriaId`, and `ClasseId`. It must not contain `Math.max`, override `filter/find`
chains, recursive substitute traversal, routing switches, or custom dedupe maps.

- [ ] **Step 6: Wire one singleton through the composition roots**

Register one `ITeachingAssignmentResolver` instance in `Bootstrap.ts`. Pass it into
`ContextEngineFactory.create`; do not construct repositories or resolvers ad hoc in
application services.

- [ ] **Step 7: Run focused ALDO tests**

```bash
npx jest --config jest.config.cjs test/unit/infrastructure/classe-repository.test.ts test/unit/infrastructure/aldo-teaching-assignment-resolver.test.ts
npm run typecheck
npm run lint
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/application/ports src/infrastructure/role-resolution src/config src/infrastructure/repositories/ClasseRepository.ts src/domain/repositories/IClasseRepository.ts src/application/context-engine/ContextEngineFactory.ts test/fixtures/tables.ts test/unit/infrastructure
git commit -m "feat: consume GLF teaching assignment resolution"
```

---

### Task 6: Migrate CDU, Roles, Email, and ACL Consumers

**Files:**
- Delete: `src/application/services/CattedraResolver.ts`
- Delete: `src/application/context-engine/CdcAssembler.ts`
- Create: `src/application/context-engine/TeachingCouncilProjection.ts`
- Modify: `src/application/context-engine/ContextBuilder.ts`
- Modify: `src/application/context-engine/ContextEngineFactory.ts`
- Modify: `src/application/context-engine/providers/ConsiglioClasseProvider.ts`
- Modify: `src/application/context-engine/providers/AlunnoProvider.ts`
- Modify: `src/application/context-engine/ElencoMaterieConPermessi.ts`
- Modify: `src/application/context-engine/Cdu.ts`
- Modify: `src/application/services/RisolutoreRuoliService.ts`
- Modify: `src/application/services/EmailNotificationService.ts`
- Modify: `src/application/pipelines/emailSteps.ts`
- Modify: `src/application/strategies/SheetMaterieConPermessiGeneratorStrategy.ts`
- Modify: `src/infrastructure/repositories/SupplenzaRepository.ts`
- Modify: `src/domain/repositories/ISupplenzaRepository.ts`
- Modify: `src/config/Bootstrap.ts`
- Modify: `test/unit/application/context-engine/cdc-assembler.test.ts` (move assertions into provider/projection tests, then delete)
- Modify: `test/unit/application/context-engine/consiglio-provider.test.ts`
- Modify: `test/unit/application/risolutore-ruoli-service.test.ts`
- Modify: `test/unit/application/email-notification-service.test.ts`
- Modify: `test/unit/application/pipelines/email-steps.test.ts`
- Modify: `test/unit/application/elenco-materie-con-permessi.test.ts`
- Modify: `test/unit/application/sheet-materie-generator.test.ts`
- Modify: `test/unit/application/cattedra-cross-cutting-agreement.test.ts`
- Modify: `test/integration/notifica-email.test.ts`

**Interfaces:**
- Consumes `ITeachingAssignmentResolver` from Task 5.
- Consumes `CollectionProjector` and `CollectionProjectionInterceptor` from Task 3.
- Produces the unchanged canonical CDU paths from `02_CDU_STRUTTURA.md`.

- [ ] **Step 1: Convert existing consumer tests to the shared port**

Replace direct `CattedraResolver`/`CdcAssembler` construction with an injected
`ITeachingAssignmentResolver`. Add a spy assertion to every consumer:

```ts
expect(teachingAssignments.resolveConsiglio).toHaveBeenCalledWith(
  classe,
  expectedDate,
  expect.objectContaining({ includeReligioneAlt: true })
);
```

Keep output assertions; tests must fail until production consumers are migrated.

- [ ] **Step 2: Add the student-filtering acceptance cases**

For an `ALUNNI.CURRICULUM` such as:

```ts
{
  LAB: ['GRUPPO_A'],
  INTERPRET: ['CHITARRA']
}
```

assert that `focus.alunno.consiglioDiClasseFiltrato`:

- includes MAIN and ITP assignments;
- includes `LAB.GRUPPO_A` but excludes `LAB.GRUPPO_B`;
- includes `INTERPRET.CHITARRA`;
- includes IRC only for religion `SI`;
- includes ALT only for religion `ALT`;
- includes neither IRC nor ALT for religion `NO`;
- preserves `materie[].specificita`.

- [ ] **Step 3: Define the declarative council projection**

`TeachingCouncilProjection.ts` exports operation configuration, not loops:

```ts
export const councilProjectionOperations: CollectionProjectionOperation[] = [
  {
    type: 'groupBy',
    keys: ['routing.primary.0.id', 'titolare.id', 'docenteEffettivo.id'],
    aggregates: {
      assignments: { type: 'collect', path: '$item' }
    }
  },
  {
    type: 'sortBy',
    keys: [{ path: 'routing.primary.0.metadata.cognome', direction: 'ASC' }]
  },
  { type: 'strategy', name: 'aldoTeachingCouncilVm' }
];
```

The registered `aldoTeachingCouncilVm` strategy may map resolved plain data to the
canonical Italian CDU field names and role labels. It may not decide precedence,
follow substitutions, group, dedupe, or sort.

Use expression/config operations for student curriculum and religion filtering;
do not add imperative filter loops to `AlunnoProvider`.

- [ ] **Step 4: Migrate class and student CDU providers**

`ConsiglioClasseProvider` obtains resolved assignments once and passes them through
the projector. `AlunnoProvider` derives its filtered council from the same
resolved set and declarative filtering. Remove `CdcAssembler` after its last caller
and test are migrated.

- [ ] **Step 5: Migrate role resolution**

`RisolutoreRuoliService` must:

- use the shared port for CDC, no-religion, IRC/ALT, subject, and exam roles;
- pass GLF routing policies through the port;
- consume `result.routing` instead of calling `RoutingResolver`;
- remove `ROUTING_POLICY`, `routing`, `docentiEffettivi`, and
  `applicaSupplenze` algorithms when callers are migrated.

Keep ALDO's declarative mapping:

```ts
SOLO_SUPPLENTI -> RoutingPolicy.DELEGATE_OR_PRINCIPAL
ENTRAMBI -> RoutingPolicy.BOTH_EQUAL
SOLO_TITOLARI -> RoutingPolicy.PRINCIPAL_ONLY
```

as configuration data only.

- [ ] **Step 6: Migrate email and ACL paths**

Use the shared resolver output for:

- `EmailNotificationService.cdcEmails`;
- `ResolveRecipientsStep`;
- document permission resolution;
- `SheetMaterieConPermessiGeneratorStrategy`;
- `REL/ALT` merged editors.

`REL/ALT` is a display group over the separately resolved IRC and ALT subjects.
Merge its already-routed recipients using the GLF projector's `flatMap` and
`distinctBy`, not a local Set/Map loop.

- [ ] **Step 7: Remove repository-level resolution**

Delete `findSupplenzaSpecifica` from `ISupplenzaRepository` and
`SupplenzaRepository` after all callers move to the GLF-backed adapter. Preserve
repository CRUD, domain entity hydration, indices, and overlap validation required
when creating a substitution.

- [ ] **Step 8: Run focused consumer tests**

```bash
npx jest --config jest.config.cjs \
  test/unit/application/context-engine/consiglio-provider.test.ts \
  test/unit/application/risolutore-ruoli-service.test.ts \
  test/unit/application/email-notification-service.test.ts \
  test/unit/application/pipelines/email-steps.test.ts \
  test/unit/application/elenco-materie-con-permessi.test.ts \
  test/unit/application/sheet-materie-generator.test.ts \
  test/unit/application/cattedra-cross-cutting-agreement.test.ts
npx jest --config jest.integration.config.cjs test/integration/notifica-email.test.ts
npm run typecheck
npm run lint
```

Expected: PASS.

- [ ] **Step 9: Confirm deleted algorithms have no callers**

Use codebase-memory-mcp `search_graph` and `trace_path` for:

```text
CattedraResolver
CdcAssembler
findSupplenzaSpecifica
applicaSupplenze
risolviSlot
SwapAndEnrichInterceptor
PriorityChainResolver
```

Expected: no ALDO production definitions/callers and no removed GLF exports.

- [ ] **Step 10: Commit**

```bash
git add src test/unit/application test/integration/notifica-email.test.ts
git commit -m "refactor: delegate teaching resolution to GLF"
```

---

### Task 7: Specification Reconciliation, Online Coverage, and Final Verification

**Files:**
- Modify: `SPECS_ALDO/MAT_NON_STANDARD.md`
- Modify: `SPECS_ALDO/06_REPOSITORY.md`
- Modify: `SPECS_ALDO/09_CONTEXT_ENGINE.md`
- Modify: `SPECS_ALDO/14_SERVIZI_UTILITY.md`
- Modify: `src/onlinetests/E2eSampleDatabaseBuilder.ts`
- Modify: `src/onlinetests/checks/repositoryChecks.ts`
- Modify: `src/onlinetests/checks/contextEngineChecks.ts`
- Modify: `test/unit/onlinetests/repository-checks.test.ts`
- Modify: `test/unit/application/cattedra-cross-cutting-agreement.test.ts`

**Interfaces:**
- Consumes the final GLF and ALDO APIs.
- Produces authoritative documentation and cross-runtime evidence that all
  consumers agree.

- [ ] **Step 1: Reconcile stale specifications**

Make these statements explicit:

```text
IRC and ALT are MATERIE rows with IS_RELIGIONE_ALT=true.
They are resolved through the same GLF assignment pipeline.
REL/ALT is only a combined presentation/ACL label.
ITP and SPECIFICA are first-class slot dimensions.
SPECIFICA is arbitrary; instruments are examples only.
VARIAZIONI_CATTEDRA/SUPPLENZE scope all matching slots held by the named actor
because the current schema has no finer slot discriminator.
```

Remove every contradictory statement that IRC/ALT are absent from `MATERIE` or
cannot receive changes/substitutions.

- [ ] **Step 2: Add one online database scenario spanning the complete matrix**

Seed:

- one MAIN assignment with a permanent change;
- one ITP assignment with a substitute;
- two arbitrary SPECIFICA assignments with different actors;
- one musical-instrument specificity as an additional example;
- IRC with a permanent change;
- ALT with a substitute-of-substitute;
- an articulated parent with relevant assignments in both partners;
- students selecting different specificities and `SI`, `ALT`, and `NO`.

- [ ] **Step 3: Add online assertions across every consumer**

For the same fixed date and fixture, assert equality among:

```text
resolved teaching assignments
full CDU council
student-filtered CDU council
role recipients
email recipients
document ACL recipients
spreadsheet column ACL recipients
REL/ALT combined recipients
```

Failure messages must include class, subject, slot kind, specificity, expected
actor, actual actor, and the GLF resolution trace.

- [ ] **Step 4: Run every GLF verification command**

From `GasLibraryFactory/`:

```bash
npm test
npm run test:integration
npm run lint
npm run format:check
npm run build:testing
npm run build:testoffline
npm run build:production
```

Expected: all exit 0.

- [ ] **Step 5: Run every ALDO verification command**

From the outer repository:

```bash
npm run typecheck
npm run lint
npm test
npm run test:integration
npm run test:build
npm run build:testing
npm run build:testoffline
npm run build:production
npm run build:online
npm run verify:vendor
git diff --check
```

Expected: all exit 0. `build:online` must compile the online scenario; pushing it
to GAS is not authorized by this plan.

- [ ] **Step 6: Run mandatory knowledge-graph audits**

Using project `home-giulio-Desktop-ALDO-implementing`:

- search for direct GAS globals outside sanctioned GLF boundaries;
- find ALDO functions with zero inbound `CALLS` edges, excluding GAS entry points;
- trace every ALDO call to the new GLF facade and verify exact signatures;
- inspect architecture for circular dependencies;
- search for remaining custom latest-date selection, recursive substitute
  traversal, routing switches, and council grouping/deduplication.

Using project `home-giulio-Desktop-ALDO-implementing-GasLibraryFactory`:

- confirm new exports are reachable from the bundle entry point;
- confirm RoleResolutionLib and ContextEngine retain legal dependency directions;
- confirm deleted APIs have no inbound calls.

Any finding is fixed and the relevant focused/full verification command is rerun
before continuing.

- [ ] **Step 7: Review deletions and final diff**

```bash
git status --short
git diff --check
git diff --stat
git -C GasLibraryFactory status --short
git -C GasLibraryFactory diff --check
git -C GasLibraryFactory diff --stat
```

Confirm that unrelated pre-existing deletions/untracked reports were neither
staged nor modified. In particular, leave `000_REPORT_USE_GLF.md` and
`001_REPORT_USE_GLF_VERIFIED.md` untouched because they were pre-existing
untracked user files when this plan was written.

- [ ] **Step 8: Commit documentation and online coverage**

```bash
git add SPECS_ALDO src/onlinetests test/unit/onlinetests test/unit/application/cattedra-cross-cutting-agreement.test.ts
git commit -m "test: verify GLF teaching resolution end to end"
```

- [ ] **Step 9: Record final evidence**

In the implementation handoff, report:

- GLF and ALDO commit hashes;
- each verification command and result;
- the acceptance-matrix cases exercised;
- graph-audit results;
- deleted ALDO algorithms/files;
- any intentionally retained ALDO mapping/projection logic and why it is
  irreducibly domain-specific.
