# EXTEND_GASLIB_AND_MOD_ALDO Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement all fixes in `EXTEND_GASLIB_AND_MOD_ALDO.md` — extend GasLibraryFactory with 5 new library capabilities (context-engine mutation mode + nested-array interceptors, multi-group dynamic_columns, positional table insertion, HTML sanitizer, ambient SheetByIdStrategy), then delete the corresponding ALDO hand-rolled workarounds and consume the library versions.

**Architecture:** Each task follows the same order: (a) implement + unit-test in `GasLibraryFactory` (TDD, its own Jest config), (b) `npm run refresh:vendor` from ALDO root, (c) update `types/gaslibs/index.d.ts`, (d) rewrite the ALDO consumer to delete the hand-rolled workaround, (e) update ALDO unit tests, (f) run ALDO's full gate (`npm run typecheck && npm run lint && npm test && npm run verify:vendor`).

**Tech Stack:** GAS V8 (Babel-transpiled TS/JS), Jest (both repos), TypeScript strict mode (ALDO).

## Global Constraints

- Never edit `dist/*` (GLF) or hand-edit `vendor/*` (ALDO) — only `npm run refresh:vendor` regenerates vendor files.
- Native GAS globals (`DriveApp`/`SpreadsheetApp`/`DocumentApp`/etc.) only inside `GoogleApiWrapper` (GLF) / facades (ALDO) — verify via grep at the end.
- Existing GLF flat-mode / single-atomic-swap / single-group / append-at-end behavior must remain default and byte-identical (backward compatible) unless explicitly replaced per task.
- `GasLibraryFactory npm test` must stay 100% green; lint clean only on touched files (pre-existing ~2.9k lint debt elsewhere is out of scope).
- Every deleted hand-rolled workaround must actually be deleted, not left dead code.
- TDD discipline: failing test first, in both repos, for every new method.
- Tasks A, B, C1, C2, C3 are independent of each other — can be executed in any order or in parallel by different workers, but each task's own steps are sequential.

---

## Task A — ContextAssembler mutation mode + ContextInterceptor nested-array support

### Part A1 (GLF): `ContextStepExecutor` mutation mode

**Files:**
- Modify: `GasLibraryFactory/ContextEngine/src/internal/ContextStepExecutor.js`
- Modify: `GasLibraryFactory/ContextEngine/src/ContextAssembler.js` (bind the new method in the constructor's delegate loop, alongside `assemble`/`assembleAsync`)
- Test: `GasLibraryFactory/ContextEngine/src/__tests__/internal/ContextStepExecutor.test.js` (existing file — add cases)
- Test: `GasLibraryFactory/ContextEngine/src/__tests__/ContextAssemblerMutation.test.js` (new — facade-level + parity regression)

**Interfaces:**
- Consumes: `ContextStepExecutor` constructor `(facade)` reading `facade._logger/_providerRegistry/_dependencyResolver/_recipeParser/_expressionEngine/_exceptionService/_maxRetries` (interceptors NOT invoked from this path — see A2 note below); `RecipeParser.parse(recipe)`; `DependencyResolver.resolveAll(parameters, initialParams, providerResults, providerName)`; `ProviderRegistry.get(type)`.
- Produces: `ContextStepExecutor.prototype.assembleInto(sharedTarget, recipe, initialParams = {}, options = {})` — new method, bound onto `ContextAssembler` facade instances exactly like `assemble`. Contract: providers are invoked as `provider.provide(sharedTarget, resolvedParameters, options)` (positional shape matching ALDO's `ContextProvider.provide(cdu, params, options): void`); the provider's **return value is ignored**; conditions/dependency-resolution see `sharedTarget` as the `providerResults` argument (so a later provider's condition can read an earlier provider's mutation); retry semantics reuse `exceptionService.executeWithRetry` unchanged; returns `sharedTarget` (same reference, mutated).

- [ ] **Step 1: Write failing unit test for `_evaluateCondition`/`_executeProviderMutation` order-dependent overwrite**

In `GasLibraryFactory/ContextEngine/src/__tests__/internal/ContextStepExecutor.test.js`, add (following the file's existing hand-built `facade` mock pattern — `jest.fn()` stubs for `_logger`, `_providerRegistry`, `_dependencyResolver`, `_recipeParser`, `_expressionEngine`, `_exceptionService`, `_maxRetries`):

```js
describe('assembleInto (mutation mode)', () => {
  it('lets a later provider overwrite a nested path an earlier provider wrote, in declared order', () => {
    const shared = { focus: { alunno: { status: { isBes: undefined } } } };
    const studentProvider = { provide: jest.fn((target) => { target.focus.alunno.status.isBes = false; }) };
    const piniProvider = { provide: jest.fn((target) => { if (target.focus.alunno.status.isBes === false) target.focus.alunno.status.isBes = true; }) };
    facade._providerRegistry.get.mockImplementation((type) =>
      type === 'student' ? studentProvider : piniProvider
    );
    facade._recipeParser.parse.mockReturnValue({
      providers: [
        { name: 'student', type: 'student', parameters: {} },
        { name: 'piani', type: 'piani', parameters: {} },
      ],
    });
    facade._dependencyResolver.resolveAll.mockReturnValue({});

    const executor = new ContextStepExecutor(facade);
    const result = executor.assembleInto(shared, { providers: [] }, {});

    expect(result).toBe(shared);
    expect(shared.focus.alunno.status.isBes).toBe(true);
    expect(studentProvider.provide).toHaveBeenCalledWith(shared, {}, {});
    expect(piniProvider.provide).toHaveBeenCalledWith(shared, {}, {});
  });

  it('ignores a provider return value entirely in mutation mode', () => {
    const shared = {};
    facade._providerRegistry.get.mockReturnValue({ provide: jest.fn(() => ({ ignored: true })) });
    facade._recipeParser.parse.mockReturnValue({ providers: [{ name: 'p', type: 'p', parameters: {} }] });
    facade._dependencyResolver.resolveAll.mockReturnValue({});
    const executor = new ContextStepExecutor(facade);
    const result = executor.assembleInto(shared, { providers: [] }, {});
    expect(result).toEqual({});
  });

  it('skips a provider whose condition evaluates false, without mutating target', () => {
    const shared = { touched: false };
    const provider = { provide: jest.fn((target) => { target.touched = true; }) };
    facade._providerRegistry.get.mockReturnValue(provider);
    facade._recipeParser.parse.mockReturnValue({
      providers: [{ name: 'p', type: 'p', parameters: {}, condition: 'false' }],
    });
    facade._dependencyResolver.resolveAll.mockReturnValue({});
    facade._expressionEngine = { evaluate: jest.fn().mockReturnValue(false) };
    const executor = new ContextStepExecutor(facade);
    executor.assembleInto(shared, { providers: [] }, {});
    expect(provider.provide).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `cd GasLibraryFactory/ContextEngine && npx jest src/__tests__/internal/ContextStepExecutor.test.js -t "mutation mode"`
Expected: FAIL — `executor.assembleInto is not a function`.

- [ ] **Step 3: Implement `assembleInto` in `ContextStepExecutor.js`**

Read the existing `assemble(recipe, initialParams, options)` method first (constructs `context = {}`, iterates `validatedRecipe.providers`, calls `_evaluateCondition` then `_executeProvider`, assigns `context[providerName] = result`, wraps errors in `ContextEngineError`). Add a sibling method that mirrors its validation/loop/error-wrapping but takes an externally supplied target and does NOT reuse `_executeProvider` (which pushes the return value through `postProcessor`/interceptors — meaningless for a void mutator):

```js
/**
 * Mutation-mode assembly: providers receive and mutate one shared target object
 * in place, in declared recipe order. Provider return values are ignored — the
 * contract is "provider mutates sharedTarget; nothing is merged". This exists
 * because ALDO's CDU is one deeply nested object multiple providers read from
 * and write into at the same paths (see ContextEngine docs); flat per-provider
 * merging (assemble()) cannot express that. Conditions and dependency
 * resolution see the live, already-mutated sharedTarget as their
 * providerResults argument, so a later provider's condition can react to an
 * earlier provider's write.
 * @param {object} sharedTarget - object every provider mutates in place.
 * @param {object} recipe - declarative recipe (same shape as assemble()).
 * @param {object} [initialParams] - params passed to dependency resolution.
 * @param {object} [options] - passed through to provider.provide as 3rd arg.
 * @returns {object} sharedTarget, same reference, now mutated.
 */
assembleInto(sharedTarget, recipe, initialParams = {}, options = {}) {
  if (sharedTarget === null || typeof sharedTarget !== 'object') {
    throw new Error('ContextStepExecutor.assembleInto: sharedTarget must be an object');
  }
  const validatedRecipe = this.facade.recipeParser.parse(recipe);
  for (const providerConfig of validatedRecipe.providers) {
    const providerName = providerConfig.name;
    try {
      const shouldRun = this._evaluateCondition(providerConfig.condition, initialParams, sharedTarget);
      if (!shouldRun) continue;
      const provider = this.facade.providerRegistry.get(providerConfig.type);
      const resolvedParameters = this.facade.dependencyResolver.resolveAll(
        providerConfig.parameters, initialParams, sharedTarget, providerName
      );
      const invoke = () => provider.provide(sharedTarget, resolvedParameters, options);
      if (this.facade._exceptionService) {
        this.facade._exceptionService.executeWithRetry(invoke, {}, this.facade._maxRetries);
      } else {
        invoke();
      }
    } catch (error) {
      throw new ContextEngineError(
        `Mutation-mode provider '${providerName}' failed: ${error.message}`,
        { providerName, providerType: providerConfig.type, originalError: error }
      );
    }
  }
  return sharedTarget;
}
```

Note: use `this.facade.recipeParser`/`this.facade.providerRegistry`/`this.facade.dependencyResolver` (the public getters) or `this.facade._recipeParser` etc. — match whichever the existing `assemble()` method actually uses (read it first; the research report says internal fields are read directly, e.g. `facade._logger`). Keep consistent with `assemble()`'s exact field-access style so both methods behave identically under the same facade.

- [ ] **Step 4: Wire `assembleInto` onto `ContextAssembler`**

In `GasLibraryFactory/ContextEngine/src/ContextAssembler.js` constructor, find the bind loop that currently does `['_evaluateCondition','_executeProvider','assemble','assembleAsync'].forEach(...)` (or equivalent) sourced from `ContextStepExecutor`, and add `'assembleInto'` to that list.

- [ ] **Step 5: Run test, verify it passes**

Run: `cd GasLibraryFactory/ContextEngine && npx jest src/__tests__/internal/ContextStepExecutor.test.js -t "mutation mode"`
Expected: PASS (3 tests).

- [ ] **Step 6: Write and pass the flat-mode parity regression test**

In new file `GasLibraryFactory/ContextEngine/src/__tests__/ContextAssemblerMutation.test.js`, build one recipe fixture (reuse `MockFactory.createAllJest()`/`MockFactory.createJestDataProvider` from `../../../test/fakes` per existing `ContextAssembler.test.js` conventions) with 2-3 providers with flat, independent outputs. Run it through `assembler.assemble(recipe, initialParams)` and separately through `assembler.assembleInto({}, recipe, initialParams)`, and assert the mutation-mode result (once flattened back, e.g. by having each fake provider write `target[providerName] = value` itself) matches the flat-mode result for that fixture — i.e. prove `assemble` itself is provably unchanged (call it before and after Step 3-4's edit if easiest, or simply re-run the full existing `ContextAssembler.test.js` suite unmodified and confirm it's still green).

Run: `cd GasLibraryFactory/ContextEngine && npx jest src/__tests__/ContextAssembler.test.js src/__tests__/ContextAssemblerMutation.test.js`
Expected: PASS, no changes needed to existing `ContextAssembler.test.js` assertions.

- [ ] **Step 7: Commit**

```bash
cd "GasLibraryFactory" && git add ContextEngine/src/internal/ContextStepExecutor.js ContextEngine/src/ContextAssembler.js ContextEngine/src/__tests__/internal/ContextStepExecutor.test.js ContextEngine/src/__tests__/ContextAssemblerMutation.test.js
git commit -m "feat(context-engine): add assembleInto mutation-mode assembly, backward compatible with assemble()"
```

### Part A2 (GLF): `ContextInterceptor._forEachAt` + `SwapAndEnrichInterceptor` targetPaths

**Files:**
- Modify: base `ContextInterceptor` class file (locate exact path under `GasLibraryFactory/ContextEngine/src/` — the interceptor base, sibling to `interceptors/SwapAndEnrichInterceptor.js`)
- Modify: `GasLibraryFactory/ContextEngine/src/interceptors/SwapAndEnrichInterceptor.js`
- Test: `GasLibraryFactory/ContextEngine/src/__tests__/ContextInterceptor.test.js` (existing — add `_forEachAt` cases)
- Test: `GasLibraryFactory/ContextEngine/src/__tests__/SwapAndEnrichInterceptor.test.js` (existing — add `targetPaths` cases)

**Interfaces:**
- Consumes: `LodashFacade`'s `get`/`set` from `GasLibraryFactory/CoreUtilsLib/src/facades/LodashFacade.js` (already exported: `export { cloneDeep, get, has, mapKeys, mapValues, merge, omit, pick, set };`) — import via whatever alias `ContextEngine` already uses for CoreUtilsLib (check its existing imports/package.json before adding a new one).
- Produces: `ContextInterceptor.prototype._forEachAt(data, path, itemFn)` — protected helper. `itemFn(item, index, array)` returns either `undefined` (mutate item in place, no outcome object) or `{ action: 'replace' | 'annotate' | 'skip', value?, meta? }`. `SwapAndEnrichInterceptor` constructor gains `config.targetPaths?: string[]` — when set, `_performIntercept` loops each path via `_forEachAt` instead of the single atomic swap; when absent, exact current behavior.

- [ ] **Step 1: Write failing test for `_forEachAt`**

In `ContextInterceptor.test.js`, add:

```js
describe('_forEachAt', () => {
  it('applies a per-item outcome to each array element at a nested path', () => {
    const interceptor = new ConcreteTestInterceptor(logger); // existing test subclass in this file
    const data = { focus: { classe: { consiglioDiClasse: [
      { id: 1, name: 'a' }, { id: 2, name: 'b' }, { id: 3, name: 'c' },
    ] } } };
    interceptor._forEachAt(data, 'focus.classe.consiglioDiClasse', (item) => {
      if (item.id === 1) return { action: 'replace', value: { id: 1, name: 'REPLACED' } };
      if (item.id === 2) return { action: 'annotate', meta: { isSubstitute: true } };
      return { action: 'skip' };
    });
    expect(data.focus.classe.consiglioDiClasse[0]).toEqual({ id: 1, name: 'REPLACED' });
    expect(data.focus.classe.consiglioDiClasse[1]).toEqual({ id: 2, name: 'b', isSubstitute: true });
    expect(data.focus.classe.consiglioDiClasse[2]).toEqual({ id: 3, name: 'c' });
  });

  it('is a no-op with a debug log when the path does not resolve to an array', () => {
    const interceptor = new ConcreteTestInterceptor(logger);
    const data = { focus: { classe: {} } };
    const itemFn = jest.fn();
    interceptor._forEachAt(data, 'focus.classe.consiglioDiClasse', itemFn);
    expect(itemFn).not.toHaveBeenCalled();
    expect(logger.debug).toHaveBeenCalled();
  });
});
```

(Use whatever the file's existing concrete-subclass-for-testing pattern is called — read the file first.)

- [ ] **Step 2: Run, verify fails**

Run: `cd GasLibraryFactory/ContextEngine && npx jest src/__tests__/ContextInterceptor.test.js -t "_forEachAt"`
Expected: FAIL — `_forEachAt is not a function`.

- [ ] **Step 3: Implement `_forEachAt` in the base class**

```js
/**
 * Targets a nested array by dot-path and applies a per-item decision.
 * itemFn may mutate item in place (return undefined) or return a 3-way
 * outcome { action: 'replace'|'annotate'|'skip', value?, meta? } that this
 * helper applies. No-op with a debug log if path doesn't resolve to an array.
 */
_forEachAt(data, path, itemFn) {
  const array = get(data, path);
  if (!Array.isArray(array)) {
    this._logger.debug(`_forEachAt: path '${path}' did not resolve to an array, skipping`);
    return;
  }
  array.forEach((item, index) => {
    const outcome = itemFn(item, index, array);
    if (!outcome) return;
    if (outcome.action === 'replace') array[index] = outcome.value;
    else if (outcome.action === 'annotate') Object.assign(array[index], outcome.meta);
    // 'skip' -> no-op
  });
}
```

- [ ] **Step 4: Run, verify passes**

Run: `cd GasLibraryFactory/ContextEngine && npx jest src/__tests__/ContextInterceptor.test.js -t "_forEachAt"`
Expected: PASS.

- [ ] **Step 5: Write failing test for `SwapAndEnrichInterceptor` `targetPaths`**

In `SwapAndEnrichInterceptor.test.js`, add:

```js
describe('targetPaths (multi-array per-item mode)', () => {
  it('independently swaps/annotates/skips each item across multiple configured paths', () => {
    const lookup = jest.fn((item) => {
      if (item.id === 1) return { id: 1, name: 'SUB' };
      return null;
    });
    const interceptor = new SwapAndEnrichInterceptor(logger, lookup, {
      targetPaths: ['focus.classe.consiglioDiClasse', 'focus.alunno.consiglioDiClasseFiltrato'],
    });
    const data = {
      focus: {
        classe: { consiglioDiClasse: [{ id: 1, name: 'a' }, { id: 2, name: 'b' }] },
        alunno: { consiglioDiClasseFiltrato: [{ id: 1, name: 'a' }] },
      },
    };
    const result = interceptor.intercept('consiglio', data, data, { applyOverrides: true });
    expect(result.focus.classe.consiglioDiClasse[0]).toEqual({ id: 1, name: 'SUB', isSubstitute: true, original: { id: 1, name: 'a' } });
    expect(result.focus.classe.consiglioDiClasse[1]).toEqual({ id: 2, name: 'b' });
    expect(result.focus.alunno.consiglioDiClasseFiltrato[0]).toEqual({ id: 1, name: 'SUB', isSubstitute: true, original: { id: 1, name: 'a' } });
  });

  it('keeps existing single-atomic-swap behavior when targetPaths is not configured', () => {
    const lookup = jest.fn().mockReturnValue({ swapped: true });
    const interceptor = new SwapAndEnrichInterceptor(logger, lookup, {});
    const result = interceptor.intercept('name', { original: true }, {}, { applyOverrides: true });
    expect(result).toEqual({ swapped: true, isSubstitute: true, original: { original: true } });
  });
});
```

- [ ] **Step 6: Run, verify fails, then implement**

Run: `cd GasLibraryFactory/ContextEngine && npx jest src/__tests__/SwapAndEnrichInterceptor.test.js -t "targetPaths"` → FAIL.

Generalize `_performIntercept` in `SwapAndEnrichInterceptor.js`:

```js
_performIntercept(name, data, context, options) {
  if (this._config.targetPaths && this._config.targetPaths.length > 0) {
    for (const path of this._config.targetPaths) {
      this._forEachAt(data, path, (item) => {
        const substituteData = this._substitutionLookup(item, context, options);
        if (substituteData === null || substituteData === undefined) return { action: 'skip' };
        return {
          action: 'replace',
          value: { ...substituteData, ...this._config.metadataFlags, [this._config.originalPropertyName]: item },
        };
      });
    }
    return data;
  }
  // existing single-atomic-swap path, unchanged
  const substituteData = this._substitutionLookup(data, context, options);
  if (substituteData === null || substituteData === undefined) return data;
  return { ...substituteData, ...this._config.metadataFlags, [this._config.originalPropertyName]: data };
}
```

- [ ] **Step 7: Run, verify passes**

Run: `cd GasLibraryFactory/ContextEngine && npx jest src/__tests__/SwapAndEnrichInterceptor.test.js`
Expected: PASS, including all pre-existing cases unmodified.

- [ ] **Step 8: Run full GLF ContextEngine suite + lint touched files**

Run: `cd GasLibraryFactory && npx jest ContextEngine && npx eslint ContextEngine/src/internal/ContextStepExecutor.js ContextEngine/src/ContextAssembler.js ContextEngine/src/interceptors/SwapAndEnrichInterceptor.js <base-interceptor-file>`
Expected: all green, no new lint errors.

- [ ] **Step 9: Commit**

```bash
cd "GasLibraryFactory" && git add -A ContextEngine
git commit -m "feat(context-engine): add ContextInterceptor._forEachAt and SwapAndEnrichInterceptor targetPaths for nested-array per-item swaps"
```

### Part A3 (ALDO): consume mutation mode + generalized interceptor

**Files:**
- Modify: `vendor/gaslibs.Code.js`, `vendor/CHECKSUM`, `vendor/VERSION` (via `refresh:vendor`, not by hand)
- Modify: `types/gaslibs/index.d.ts`
- Modify: `src/application/context-engine/ContextBuilder.ts`
- Modify: `src/application/context-engine/Recipe.ts` (comment only)
- Modify or delete: `src/application/context-engine/interceptors/SwapAndEnrichInterceptor.ts`
- Modify: `src/application/context-engine/ContextEngineFactory.ts` (wiring site, `grep -rn "new SwapAndEnrichInterceptor" src/`)
- Test: files under `test/unit/application/context-engine/*` (assertions unchanged, internals only)

- [ ] **Step 1: Refresh vendor**

Run: `npm run refresh:vendor`
Expected: `vendor/gaslibs.Code.js`/`CHECKSUM`/`VERSION` updated, contains `assembleInto` and `_forEachAt`/`targetPaths` support. Verify: `grep -c "assembleInto" vendor/gaslibs.Code.js` returns > 0.

- [ ] **Step 2: Update ambient types**

In `types/gaslibs/index.d.ts`, in the `--- ContextEngine (L3) ---` section:
- Add `class ContextAssembler { constructor(logger, providerRegistry, expressionEngine?, exceptionService?, interceptorRegistry?, options?); assemble(recipe: unknown, initialParams?: Record<string, unknown>): Record<string, unknown>; assembleInto(sharedTarget: object, recipe: unknown, initialParams?: Record<string, unknown>, options?: Record<string, unknown>): object; }` (match exact constructor param list confirmed by A1 research).
- Update `abstract class ContextInterceptor` to add `protected _forEachAt(data: unknown, path: string, itemFn: (item: unknown, index: number, array: unknown[]) => { action: 'replace' | 'annotate' | 'skip'; value?: unknown; meta?: Record<string, unknown> } | void): void;`.
- Add `class SwapAndEnrichInterceptor extends ContextInterceptor { constructor(logger: LoggerService, substitutionLookup: (item: unknown, context: unknown, options: unknown) => unknown | null, config?: { originalPropertyName?: string; metadataFlags?: Record<string, unknown>; targetProviders?: string[] | null; optionFlag?: string; targetPaths?: string[] }); }`.
- Delete or rewrite the stale flat-map-mismatch rationale comment at lines 24-28 to describe the new mutation-mode capability instead.

- [ ] **Step 3: Rewrite `ContextBuilder.ts`**

Read current `build()` (lines 43-56) and `initCdu` (58-85). Replace the manual loop with a call into the library:

```ts
build(params: BuildParams, recipe: Recipe): Cdu {
  const cdu = this.initCdu(params);
  const assembler = new ContextAssembler(
    this.logger, this.providers, undefined, undefined, this.interceptors, {}
  );
  assembler.assembleInto(cdu, { providers: recipe.providers.map((token) => ({ name: token, type: token, parameters: {} })) }, params, recipe.options);
  return cdu;
}
```

Adjust the recipe-shape construction to match whatever `RecipeParser.parse` in GLF actually expects (verify against A1's `recipeParser.parse(recipe)` call — recipe needs `{ providers: [{name, type, parameters, condition?}] }`; ALDO's own `Recipe.providers` is currently just `string[]` tokens — map each token to `{name: token, type: token, parameters: {}}` since ALDO's `ProviderRegistry.get(type)` keys are the same tokens). Keep `initCdu` exactly as-is (spec-mandated `tech` non-enumerable property, per `02_CDU_STRUTTURA.md §7`).

Note: interceptors still need to run after each provider (per Task A's spec: "running the registered interceptors after each provider step" is the assembler's job in mutation mode too) — if `assembleInto` as built in A1 does NOT invoke interceptors internally (confirmed by research: A1's leaner mutation-mode step deliberately skips the interceptor loop since it's decoupled from `_executeProvider`'s data pipeline), then `ContextBuilder.build()` must invoke `this.interceptors.getAll()` itself, per-provider, exactly as today — i.e. **keep the token-loop for interceptor invocation, but delete only the provider-invocation halves**, OR (cleaner) revisit A1 to have `assembleInto` accept an optional `afterEachProvider(providerName, sharedTarget)` callback that `ContextBuilder` passes to run its interceptor loop. Prefer the callback approach — go back and add it to A1's `assembleInto` signature if this ambiguity surfaces during implementation (this is exactly the kind of "design choice this document didn't anticipate" the ground rules say to resolve with the most spec-faithful choice and document at the decision point).

- [ ] **Step 4: Update `Recipe.ts` comment**

Trim/rewrite the justification comment (lines 105-141) to reflect that `ContextAssembler.assembleInto` now handles nested mutation-based assembly; keep the provider-order dependency table (lines 66-95) since it's still the authoritative ordering doc.

- [ ] **Step 5: Rewrite or delete ALDO's `SwapAndEnrichInterceptor.ts`**

Since the library's generalized class still can't express the `GestioneSupplenti` 3-way business rule (titolare/supplente resolution via `DocenteRepository`/`SupplenzaRepository`), keep ONLY the policy function, delete the array-walking:

```ts
// src/application/context-engine/ContextEngineFactory.ts (wiring site)
.registerInterceptor(new SwapAndEnrichInterceptor(
  new LoggerService(),
  (vm: DocenteCdcVM, context: Cdu, options: RecipeOptions) => resolveSwap(vm, context, options, docenti, supplenze),
  { targetPaths: ['focus.classe.consiglioDiClasse', 'focus.alunno.consiglioDiClasseFiltrato'], targetProviders: ['consiglio', 'student'], optionFlag: 'gestioneSupplenti' }
))
```

Wait — `optionFlag` in the library gates on `options[optionFlag] === true` (boolean), but ALDO's rule is a 3-way enum (`GestioneSupplenti.SOLO_SUPPLENTI`/`ENTRAMBI`/other) read via `options.gestioneSupplenti`. This is exactly the kind of "policy vs plumbing" split the task doc calls out — since the library's `_shouldIntercept` boolean gate doesn't fit a 3-way rule, do NOT use the library's built-in gating; instead pass `targetProviders` for the name filter and put the full 3-way logic (including "should this run at all" for the current rule) inside the `substitutionLookup` callback itself, returning `null` (no-op / SOLO_TITOLARI) when the rule says don't swap. Delete ALDO's own `SwapAndEnrichInterceptor` class entirely; instantiate the **library's** class at the wiring site with a policy function extracted from the old `swapList`/`effettivoSupplente` logic (module-level function `resolveSwap`, not a class).

- [ ] **Step 6: Update context-engine tests**

Run each file under `test/unit/application/context-engine/*` after the rewrite; per the task doc's correctness bar, assertions about CDU shape and supplenti-swap outcomes must NOT need to change — only imports/setup (e.g. constructing `ContextEngineFactory` the same way). If any assertion needs to change, treat it as a regression signal and fix the implementation, not the test.

Run: `npx jest test/unit/application/context-engine`
Expected: all pass unchanged in assertions.

- [ ] **Step 7: Full ALDO gate**

Run: `npm run typecheck && npm run lint && npm test && npm run verify:vendor`
Expected: all green.

- [ ] **Step 8: Commit**

```bash
git add vendor/ types/gaslibs/index.d.ts src/application/context-engine/ test/unit/application/context-engine/
git commit -m "refactor(context-engine): delegate CDU assembly to library assembleInto, generalize SwapAndEnrichInterceptor via targetPaths"
```

---

## Task B — `dynamic_columns` multi-group support + layout-position return contract

### Part B1 (GLF): `SheetProcessor` multi-group `dynamic_columns`

**Files:**
- Modify: `GasLibraryFactory/WorkspaceTemplateEngine/src/processors/SheetProcessor.js`
- Modify: `GasLibraryFactory/WorkspaceTemplateEngine/src/PlaceholderService.js` (surface the resolved layout in `processSheet`'s return value)
- Test: `GasLibraryFactory/WorkspaceTemplateEngine/src/processors/__tests__/SheetProcessor.dynamicColumns.test.js`
- Doc: new/updated file under `GasLibraryFactory/DOCS_LIBS/` documenting the new placeholder syntax

**Interfaces:**
- Produces: `_prepareDynamicColumnRequests` return contract extended (additively) to `{ valueRequests, protectionRequests, layout: { sheetName, headerRow, startColumn, columns: Array<{ header: string, column: number, sigla?: string, isLabel: boolean }> } }`. `SheetProcessor.process()` collects all placeholders' `layout`s into an array and returns it (in addition to whatever success signal it already returns) so `PlaceholderService.processSheet` can surface it.
- New placeholder syntax: `{{dynamic_columns[groups=<serialized-groups>]}}` where a single group remains expressible via the existing flat `source=...,value=...,acl=...` (backward compat, `groups` absent ⇒ exactly today's single-group parse path unchanged) OR (recommended, simpler diff) keep `source`/`value`/`acl` as *the first group* and add a new **repeatable-key** convention: `source2=...,value2=...,label2=...,source3=...,value3=...,label3=...` (numbered suffixes starting at 2, no numeric suffix = group 1) — document whichever is chosen in JSDoc + DOCS_LIBS. Prefer the numbered-suffix form: smaller diff to the existing flat `key=value,key=value` parser (extend the parse loop to bucket keys by numeric suffix into groups, rather than writing a nested mini-language parser).

- [ ] **Step 1: Write failing test — 3-group articulated-class layout**

In `SheetProcessor.dynamicColumns.test.js`, add:

```js
it('lays out multiple sequential groups with label columns between them, from one placeholder', () => {
  const context = {
    condivise: [{ sigla: 'MAT' }, { sigla: 'ITA' }],
    gruppo1: [{ sigla: 'FIS' }],
    gruppo2: [{ sigla: 'CHI' }, { sigla: 'BIO' }],
    partner1: 'Gruppo A',
    partner2: 'Gruppo B',
  };
  const placeholder = '{{dynamic_columns[source=condivise,value=sigla,source2=gruppo1,value2=sigla,label2=partner2,source3=gruppo2,value3=sigla,label3=partner2]}}';
  // NOTE: label param takes a context-key to resolve via mustache.getValue, mirroring `value`'s per-item resolution but evaluated once against the whole context, not per item.
  const result = processor._prepareDynamicColumnRequests('Sheet1', 1, 3, placeholder, context);

  const headers = result.valueRequests.map(r => r.values[0][0]);
  expect(headers).toEqual(['MAT', 'ITA', 'Gruppo A', 'FIS', 'Gruppo B', 'CHI', 'BIO']);
  expect(result.layout.columns.map(c => c.isLabel)).toEqual([false, false, true, false, true, false, false]);
  expect(result.protectionRequests.some(p => p.range.includes(/* label column letter */))).toBe(false);
});

it('keeps single-group behavior byte-identical when no numbered group keys are present', () => {
  const context = { students: [{ id: 1 }, { id: 2 }] };
  const placeholder = '{{dynamic_columns[source=students,value=id,acl=id]}}';
  const result = processor._prepareDynamicColumnRequests('Sheet1', 1, 3, placeholder, context);
  expect(result.valueRequests).toHaveLength(2);
  expect(result.protectionRequests).toHaveLength(2);
  expect(result.layout.columns).toEqual([
    { header: 1, column: 3, isLabel: false },
    { header: 2, column: 4, isLabel: false },
  ]);
});
```

Adjust exact assertion shapes once the real single-group test fixtures (already in the file) are re-read for exact header/protection formatting conventions — match their existing style precisely.

- [ ] **Step 2: Run, verify fails**

Run: `cd GasLibraryFactory/WorkspaceTemplateEngine && npx jest src/processors/__tests__/SheetProcessor.dynamicColumns.test.js -t "multiple sequential groups"`
Expected: FAIL (no `groups`/numbered-key support yet, `result.layout` undefined).

- [ ] **Step 3: Implement multi-group parsing in `_prepareDynamicColumnRequests`**

Read the full existing method first. Extend the flat `key=value` param parser to bucket by numeric suffix:

```js
_prepareDynamicColumnRequests(sheetName, startRow, startColumn, placeholder, context) {
  const match = placeholder.match(/{{dynamic_columns\[(.*?)\]}}/);
  if (!match) return { valueRequests: [], protectionRequests: [], layout: null };
  const rawParams = this._parseParams(match[1]); // existing key=value,key=value splitter, extracted if not already a helper
  const groups = this._bucketDynamicColumnGroups(rawParams); // [{source, value, acl, label}, ...] ordered by suffix, group[0] has no label

  let col = startColumn;
  const valueRequests = [{ range: this._rangeToA1(sheetName, startRow, startColumn, startRow, startColumn), values: [['']] }]; // clear placeholder
  const protectionRequests = [];
  const columns = [];

  groups.forEach((group, groupIndex) => {
    if (groupIndex > 0 && group.label) {
      const labelText = mustache.getValue(group.label, context) ?? group.label;
      valueRequests.push({ range: this._rangeToA1(sheetName, startRow, col, startRow, col), values: [[labelText]] });
      columns.push({ header: labelText, column: col, isLabel: true });
      col += 1;
      // no protectionRequests entry for label columns — structural header, not data
    }
    const sourceData = mustache.getValue(group.source, context);
    if (!Array.isArray(sourceData)) {
      this._logger.warn(`Data source '${group.source}' for dynamic_columns is not an array.`);
      return;
    }
    sourceData.forEach((item) => {
      const headerText = mustache.getValue(group.value, item);
      valueRequests.push({ range: this._rangeToA1(sheetName, startRow, col, startRow, col), values: [[headerText]] });
      columns.push({ header: headerText, column: col, isLabel: false, sigla: item[group.value] });
      if (group.acl) {
        const aclValue = mustache.getValue(group.acl, item);
        if (aclValue) {
          protectionRequests.push(this._buildProtectionRequest(sheetName, startRow, col, group.scope, group.source, aclValue));
        }
      }
      col += 1;
    });
  });

  return { valueRequests, protectionRequests, layout: { sheetName, headerRow: startRow, startColumn, columns } };
}
```

(Extract the existing single-group protection-building snippet into `_buildProtectionRequest` if not already a separate method — reuse rather than duplicate. `_bucketDynamicColumnGroups` parses `source`/`source2`/`source3`... etc. into an ordered array of `{source, value, acl, label, scope}` group objects — group 1 has no numeric suffix, matching today's flat keys exactly, so when only `source`/`value`/`acl` are present with no `source2`, `groups.length === 1` and the loop above degenerates to exactly today's single-group output — this is what makes Step 3's second test (byte-identical single-group) pass without any special-casing.)

- [ ] **Step 4: Run, verify passes**

Run: `cd GasLibraryFactory/WorkspaceTemplateEngine && npx jest src/processors/__tests__/SheetProcessor.dynamicColumns.test.js`
Expected: PASS, including every pre-existing case in the file unmodified.

- [ ] **Step 5: Surface `layout` through `PlaceholderService.processSheet`**

In `SheetProcessor.process()`, collect each placeholder's `layout` into a `layouts: []` array as it processes cells; return `{ success: true, layouts }` (or similar) instead of/alongside the current boolean-ish result. In `PlaceholderService.processSheet`, change the return type from `boolean` to something like `{ success: boolean, layouts?: Array<...> }` — but this is a **public signature change** consumed by ALDO's `TemplateEngineFacade.processSheet` which currently does `if (!service.processSheet(...)) throw`. Decide: keep `processSheet` returning `boolean` for the success path (unchanged for callers who ignore layout) and add a **second** method `processSheetWithLayout(sheetId, context, sheetName)` returning `{ success, layouts }`, OR change the one method's return type — prefer changing the one method (matches Task B's spirit of "small additive extension") since ALDO's facade already needs updating either way (Part B3, Step 1 below) and only one caller exists in this codebase's control. Write a test for `PlaceholderService.processSheet` confirming `result.layouts` includes the resolved columns for a `dynamic_columns` sheet, and confirming `result.success === false` (not a thrown error) with `layouts: []` for the swallow-and-log-error case, matching the method's existing catch-all behavior.

- [ ] **Step 6: Run full WorkspaceTemplateEngine suite + lint**

Run: `cd GasLibraryFactory && npx jest WorkspaceTemplateEngine && npx eslint WorkspaceTemplateEngine/src/processors/SheetProcessor.js WorkspaceTemplateEngine/src/PlaceholderService.js`
Expected: all green.

- [ ] **Step 7: Write DOCS_LIBS update**

Add a short section to the relevant `GasLibraryFactory/DOCS_LIBS/` doc (find the existing `WorkspaceTemplateEngine`/`dynamic_columns` doc file) documenting: the numbered-suffix `source2=/value2=/label2=/acl2=` syntax, that group 1 has no suffix, that labels are optional and evaluated once per group (not per item), and the new `layout` field on the return contract.

- [ ] **Step 8: Commit**

```bash
cd "GasLibraryFactory" && git add WorkspaceTemplateEngine DOCS_LIBS
git commit -m "feat(workspace-template-engine): support multiple sequential dynamic_columns groups with label columns and layout return contract"
```

### Part B2 (ALDO): SPECS_ALDO update

**Files:**
- Modify: `SPECS_ALDO/10_PIPELINE_DOCUMENTI.md` (§9, the sentence at the line matching "nome del foglio target, riga di intestazione colonne, colonna di partenza")

- [ ] **Step 1: Edit the spec sentence**

Replace:
> `CONF_DOC.PARAMETRI` può specificare: nome del foglio target, riga di intestazione colonne, colonna di partenza.

With:
> `CONF_DOC.PARAMETRI` può specificare: nome del foglio target (facoltativo, per selezionare una scheda non predefinita). La posizione delle colonne materia è determinata dal placeholder `{{dynamic_columns[...]}}` incorporato nel template Drive, non più da `PARAMETRI`.

- [ ] **Step 2: Commit**

```bash
git add "SPECS_ALDO/10_PIPELINE_DOCUMENTI.md"
git commit -m "docs(specs): SHEET_CON_MATERIE column placement now comes from template dynamic_columns, not CONF_DOC.PARAMETRI"
```

### Part B3 (ALDO): rewrite Sheet strategies

**Files:**
- Modify: `vendor/gaslibs.Code.js` etc. (refresh:vendor)
- Modify: `types/gaslibs/index.d.ts`
- Modify: `src/infrastructure/facades/TemplateEngineFacade.ts`
- Modify: `test/fakes/FakeTemplateEngine.ts`
- Rewrite: `src/application/strategies/SheetMaterieGeneratorStrategy.ts`
- Rewrite: `src/application/strategies/SheetMaterieConPermessiGeneratorStrategy.ts`
- Test: `test/unit/application/sheet-materie-generator.test.ts`

- [ ] **Step 1: Refresh vendor + update ambient types**

Run: `npm run refresh:vendor`. In `types/gaslibs/index.d.ts`, change `processSheet(sheetId: string, context?: Record<string, unknown>, sheetName?: string): boolean;` to:

```ts
interface SheetColumnLayout {
  header: string;
  column: number;
  isLabel: boolean;
  sigla?: string;
}
interface SheetProcessResult {
  success: boolean;
  layouts: Array<{ sheetName: string; headerRow: number; startColumn: number; columns: SheetColumnLayout[] }>;
}
// ...
processSheet(sheetId: string, context?: Record<string, unknown>, sheetName?: string): SheetProcessResult;
```

- [ ] **Step 2: Update `TemplateEngineFacade.ts`**

```ts
processSheet(sheetId: string, context: Record<string, unknown>, sheetName?: string): SheetColumnLayout[] {
  const result = this.service.processSheet(sheetId, context, sheetName);
  if (!result.success) throw new Error(`processSheet failed for sheet ${sheetId}`);
  return result.layouts.flatMap((l) => l.columns);
}
```

(Exact return shape/aggregation depends on whether ALDO only ever has one `dynamic_columns` placeholder per sheet — true for `SheetMaterieGeneratorStrategy`'s use case — so flattening `layouts[0].columns` or all of them concatenated is fine; add an `ITemplateEngine` interface update to match.)

- [ ] **Step 3: Update `FakeTemplateEngine.ts`**

Add real simulation logic for `dynamic_columns` groups (per the task's explicit warning to keep fakes in lockstep with real library semantics) — given a `context` shaped with `condivise`/`gruppo1`/`gruppo2`/labels per what `SheetMaterieGeneratorStrategy` will now put on the CDU/context object (see Step 4), compute and return the same `SheetColumnLayout[]` shape a real `processSheet` would, and record `renderedSheets` as before for other assertions.

- [ ] **Step 4: Rewrite `SheetMaterieGeneratorStrategy.ts`**

Delete `insertColumns`, `buildColumns`, `columnsFor`, `firstEmptyColumn`, `writeHeaders`, `columnIndexToLetters`, `SheetMaterieParams`/`readParams`'s `headerRow`/`startColumn` fields (keep `sheetName` field only), and `substitutePlaceholders` (confirmed redundant — `SheetProcessor.process`'s inline `mustache.render` branch already does generic cell substitution in the same pass as `dynamic_columns`).

```ts
render(fileId: string, cdu: Cdu, config: DocConfig): void {
  const params = readParams(config); // sheetName only now
  const classe = requireClasse(cdu);
  const context = { ...cdu, ...this.buildGroupsContext(classe) };
  const layout = this.templates.processSheet(fileId, context, params.sheetName);
  this.lastLayout = layout; // exposed for SheetMaterieConPermessiGeneratorStrategy
}

private buildGroupsContext(classe: CduClasse) {
  if (isArticulated(classe)) {
    return {
      condivise: materieCondivise(classe),
      gruppo1: classe.materieSeparatePrimoGruppo ?? [],
      gruppo2: classe.materieSeparateSecondoGruppo ?? [],
      partner1Label: classe.partners?.[0] ?? 'Gruppo 1',
      partner2Label: classe.partners?.[1] ?? 'Gruppo 2',
    };
  }
  return { condivise: allSubjectsDeduped(classe) };
}
```

(Port `columnsFor`'s subject → header-text resolution, i.e. `MateriaRepository.findByIdCached(...).sintesi` fallback to sigla, into the per-item `value=` expression path — since the library's `value=` is a mustache expression evaluated per-item against the source array's own items, the source arrays themselves must already carry the resolved header text as a field, e.g. map `materieCondivise(classe)` to `{ sigla, sintesi }` objects and set `value=sintesi` in the template's placeholder param, OR resolve header text into the array before handing it to `processSheet`. Since the placeholder syntax lives in the Drive template (owned outside this repo per rule 6), the `value=` param name is fixed by whatever's authored there — coordinate by choosing a stable field name convention, e.g. always expose `header` as the resolved display text on each source item, and document that `value=header` is the expected template convention going forward.)

- [ ] **Step 5: Rewrite `SheetMaterieConPermessiGeneratorStrategy.ts`**

`protectColumns` now reads `this.baseStrategy.lastLayout` (or however the returned `SheetColumnLayout[]` is threaded through) instead of `layout.startIndex + i`:

```ts
protectColumns(fileId: string, cdu: Cdu, layout: SheetColumnLayout[]): void {
  for (const col of layout) {
    if (col.isLabel) continue;
    const range = `${sheetName}!${columnIndexToLetters(col.column)}${headerRow + 1}:${columnIndexToLetters(col.column)}${lastRow}`;
    // ... same resolveDocentiMateria / RisolutoreRuoliService logic as today, unchanged
  }
}
```

Keep `columnIndexToLetters` (still needed here for range-string building) — it moves from the base strategy into this one (or a shared util), since the base strategy no longer writes headers manually but this one still needs to turn a numeric column index into a spreadsheet letter for `protectRanges`.

- [ ] **Step 6: Rewrite tests**

In `test/unit/application/sheet-materie-generator.test.ts`: update existing assertions to go through `FakeTemplateEngine.processSheet` instead of the removed `FakeSpreadsheetService.updateCalls`; add a new articulated-class fixture test (shared + label + group1 + label + group2 shape) since none exists today. Preserve all currently-tested functional outcomes (correct headers, correct order, correct ACL per column, `ConfigurationError` on missing `focus.classe`/missing sheet, empty-CDC → no `protectRanges` call).

- [ ] **Step 7: Full ALDO gate**

Run: `npm run typecheck && npm run lint && npm test && npm run verify:vendor`
Expected: green.

- [ ] **Step 8: Commit**

```bash
git add vendor/ types/gaslibs/index.d.ts src/infrastructure/facades/TemplateEngineFacade.ts test/fakes/FakeTemplateEngine.ts src/application/strategies/SheetMaterieGeneratorStrategy.ts src/application/strategies/SheetMaterieConPermessiGeneratorStrategy.ts test/unit/application/sheet-materie-generator.test.ts
git commit -m "refactor(sheet-strategies): move column placement to template dynamic_columns groups, delete manual placement code"
```

---

## Task C1 — `insertTableAtMarker` positional table insertion

### Part C1a (GLF)

**Files:**
- Modify: `GasLibraryFactory/GoogleApiWrapper/src/internal/services-managers/DocumentTableManager.js`
- Modify: `GasLibraryFactory/GoogleApiWrapper/src/services/DocumentService.js` (add `'insertTableAtMarker'` to the `_delegate` methods list for `_tableManager`)
- Test: new `GasLibraryFactory/GoogleApiWrapper/src/internal/services-managers/__tests__/DocumentTableManager.test.js` (no existing file — create fresh)

**Interfaces:**
- Produces: `DocumentTableManager.prototype.insertTableAtMarker(documentId, markerText, data, options = {})` — throws if marker not found; returns `{ success: true, rows, columns, foundElementIndex }` on success; applies same header/alternating-row/columnWidths styling as `_createTableWithStandardAPI` via a shared extracted helper `_applyTableStyling(table, data, options)`.

- [ ] **Step 1: Write failing tests in new file**

```js
const DocumentTableManager = require('../DocumentTableManager');

function makeFacade({ findTextResult = null, insertedTable = null } = {}) {
  const cell = { setBold: jest.fn(), setBackgroundColor: jest.fn(), setWidth: jest.fn() };
  const row = { getNumCells: () => 2, getCell: () => cell };
  const table = insertedTable || { getRow: () => row, getNumRows: () => 1 };
  const paragraph = { getType: () => 'PARAGRAPH' };
  const rangeElement = findTextResult === undefined ? null : { getElement: () => ({ getParent: () => paragraph }) };
  const body = {
    findText: jest.fn().mockReturnValue(rangeElement),
    getChildIndex: jest.fn().mockReturnValue(2),
    insertTable: jest.fn().mockReturnValue(table),
    appendTable: jest.fn().mockReturnValue(table),
  };
  const doc = { getBody: () => body };
  return {
    facade: { openStandard: jest.fn().mockReturnValue(doc) },
    body, doc, table,
  };
}

describe('DocumentTableManager.insertTableAtMarker', () => {
  it('inserts the table immediately after the marker paragraph, not at the end', () => {
    const { facade, body } = makeFacade();
    const manager = new DocumentTableManager(facade);
    const data = [['a', 'b']];
    const result = manager.insertTableAtMarker('doc1', '{{TABELLA:x}}', data, {});
    expect(body.findText).toHaveBeenCalledWith('{{TABELLA:x}}');
    expect(body.getChildIndex).toHaveBeenCalled();
    expect(body.insertTable).toHaveBeenCalledWith(3, data); // childIndex + 1
    expect(body.appendTable).not.toHaveBeenCalled();
    expect(result).toEqual({ success: true, rows: 1, columns: 2, foundElementIndex: 2 });
  });

  it('throws a clear error when the marker is not found', () => {
    const { facade } = makeFacade({ findTextResult: undefined });
    const manager = new DocumentTableManager(facade);
    expect(() => manager.insertTableAtMarker('doc1', '{{MISSING}}', [['a']], {})).toThrow(/marker/i);
  });

  it('applies header-row and alternating-row styling on the positional path', () => {
    const { facade, table } = makeFacade();
    const manager = new DocumentTableManager(facade);
    manager.insertTableAtMarker('doc1', '{{TABELLA:x}}', [['h1', 'h2'], ['a', 'b']], { headerRow: true, alternatingRows: true });
    const headerCell = table.getRow(0).getCell(0);
    expect(headerCell.setBold).toHaveBeenCalledWith(true);
  });
});
```

- [ ] **Step 2: Run, verify fails**

Run: `cd GasLibraryFactory/GoogleApiWrapper && npx jest src/internal/services-managers/__tests__/DocumentTableManager.test.js`
Expected: FAIL — `manager.insertTableAtMarker is not a function`.

- [ ] **Step 3: Extract shared styling helper + implement `insertTableAtMarker`**

Read `_createTableWithStandardAPI` in full first (lines ~1166-1218 per research). Extract the header/alternating/columnWidths block into `_applyTableStyling(table, data, options)`:

```js
_applyTableStyling(table, data, options) {
  if (options.headerRow && data.length > 0) {
    const headerRow = table.getRow(0);
    const numCells = headerRow.getNumCells();
    for (let i = 0; i < numCells; i++) headerRow.getCell(i).editAsText().setBold(true);
  }
  if (options.alternatingRows && data.length > 1) {
    const lightGray = '#f3f3f3';
    for (let rowIndex = 1; rowIndex < table.getNumRows(); rowIndex++) {
      if (rowIndex % 2 === 1) {
        const row = table.getRow(rowIndex);
        for (let cellIndex = 0; cellIndex < row.getNumCells(); cellIndex++) row.getCell(cellIndex).setBackgroundColor(lightGray);
      }
    }
  }
  if (options.columnWidths && Array.isArray(options.columnWidths)) {
    for (let colIndex = 0; colIndex < options.columnWidths.length; colIndex++) {
      const width = options.columnWidths[colIndex];
      if (width && table.getNumRows() > 0) table.getRow(0).getCell(colIndex).setWidth(width);
    }
  }
}
```

Update `_createTableWithStandardAPI` to call `this._applyTableStyling(table, data, options)` instead of the inline block (regression-safe: identical logic, just moved).

```js
/**
 * Inserts a table immediately after the paragraph containing markerText,
 * instead of at the document end. Marker removal is left to the caller
 * (mirrors ALDO's existing scan-then-remove two-step flow) — this method
 * only reports foundElementIndex so a follow-up removeText-style call can
 * target the exact right paragraph.
 */
insertTableAtMarker(documentId, markerText, data, options = {}) {
  try {
    const doc = this.facade.openStandard(documentId);
    const body = doc.getBody();
    const found = body.findText(markerText);
    if (!found) {
      throw new Error(`insertTableAtMarker: marker '${markerText}' not found in document ${documentId}`);
    }
    let element = found.getElement();
    while (element.getParent && element.getParent() !== body && element.getType() !== 'PARAGRAPH' && element.getType() !== 'LIST_ITEM') {
      element = element.getParent();
    }
    const childIndex = body.getChildIndex(element);
    const table = body.insertTable(childIndex + 1, data);
    this._applyTableStyling(table, data, options);
    this._logger.debug(`Inserted table at marker '${markerText}' (child index ${childIndex + 1})`);
    return { success: true, rows: data.length, columns: data[0] ? data[0].length : 0, foundElementIndex: childIndex };
  } catch (error) {
    this._logger.error(`insertTableAtMarker failed: ${error.message}`);
    throw error;
  }
}
```

(The element-walk-to-paragraph logic is a best-effort per the task's description — "walk up from the found RangeElement's getElement() to the top-level child of body if the match is nested inside a paragraph's text run"; adjust exact traversal to match real `DocumentApp` semantics if `getParent`/`getType` differ — verify against any other native-DocumentApp-touching code elsewhere in `GoogleApiWrapper` for the real API shape before finalizing, since this is the one area with zero existing test fixtures to copy from.)

- [ ] **Step 4: Add `insertTableAtMarker` to `DocumentService.js` delegate list**

In the `_tableManager` methods array (ends with `..., '_createTableWithStandardAPI'`), add `'insertTableAtMarker'`.

- [ ] **Step 5: Run, verify passes**

Run: `cd GasLibraryFactory/GoogleApiWrapper && npx jest src/internal/services-managers/__tests__/DocumentTableManager.test.js`
Expected: PASS (3 tests).

- [ ] **Step 6: Run full GoogleApiWrapper suite + lint**

Run: `cd GasLibraryFactory && npx jest GoogleApiWrapper && npx eslint GoogleApiWrapper/src/internal/services-managers/DocumentTableManager.js GoogleApiWrapper/src/services/DocumentService.js`
Expected: green.

- [ ] **Step 7: Commit**

```bash
cd "GasLibraryFactory" && git add GoogleApiWrapper
git commit -m "feat(google-api-wrapper): add DocumentTableManager.insertTableAtMarker for positional table insertion"
```

### Part C1b (ALDO)

**Files:**
- Modify: `vendor/*` (refresh:vendor), `types/gaslibs/index.d.ts`
- Modify: `src/infrastructure/facades/DocumentTableFacade.ts`
- Rewrite: `src/application/strategies/DocumentoConTabelleImportateGeneratorStrategy.ts`
- Test: `test/unit/application/documento-con-tabelle-generator.test.ts`, `test/unit/infrastructure/document-table-facade.test.ts`

- [ ] **Step 1: Refresh vendor, update ambient types**

Run: `npm run refresh:vendor`. Add to `class DocumentService` in `types/gaslibs/index.d.ts`:

```ts
insertTableAtMarker(documentId: string, markerText: string, data: string[][], options?: DocumentCreateTableOptions): { success: boolean; rows: number; columns: number; foundElementIndex: number };
```

- [ ] **Step 2: Update `DocumentTableFacade.ts`**

Remove the append-at-end limitation doc-comment (lines 12-20). Add:

```ts
insertTableAtMarker(fileId: string, marker: string, data: string[][], options?: { headerRow?: boolean }): void {
  if (data.length === 0) return;
  this.documents.insertTableAtMarker(fileId, marker, data, options);
}
```

Add this to `IDocumentTableFacade`. Keep `findTablePlaceholders`/`removeText` unchanged (caller-removes-marker design).

- [ ] **Step 3: Rewrite `DocumentoConTabelleImportateGeneratorStrategy.ts`**

Replace the "append in scan order at doc end" loop:

```ts
render(...) {
  const placeholders = this.tables.findTablePlaceholders(fileId);
  for (const ph of placeholders) {
    const data = this.readSheetAsStrings(ph.sheetFileId);
    if (data.length > 0) {
      this.tables.insertTableAtMarker(fileId, ph.marker, data, { headerRow: true });
    }
    this.tables.removeText(fileId, ph.marker);
  }
  super.render(...);
}
```

(Order: insert-then-remove, so `insertTableAtMarker`'s `findText` still finds the marker text — do not remove the marker before inserting.)

- [ ] **Step 4: Update tests**

In `test/fakes` (or inline fakes in these test files), rename/extend `FakeDocumentTableFacade.appended` tracking to `insertedAtMarker: Array<{fileId, marker, data, options}>`, update `document-table-facade.test.ts`'s `FakeDocumentService` with a stub `insertTableAtMarker`. Assert positional semantics (table associated with its own marker, not a flat "appended" list) and that `removeText` is called with the same marker after insertion.

- [ ] **Step 5: Full ALDO gate**

Run: `npm run typecheck && npm run lint && npm test && npm run verify:vendor`

- [ ] **Step 6: Commit**

```bash
git add vendor/ types/gaslibs/index.d.ts src/infrastructure/facades/DocumentTableFacade.ts src/application/strategies/DocumentoConTabelleImportateGeneratorStrategy.ts test/
git commit -m "refactor(document-tables): insert tables at their own marker position instead of appending at document end"
```

---

## Task C2 — `HtmlSanitizer` in CoreUtilsLib, delete ALDO's local escaping

### Part C2a (GLF)

**Files:**
- Create: `GasLibraryFactory/CoreUtilsLib/src/utils/HtmlSanitizer.js`
- Modify: `GasLibraryFactory/CoreUtilsLib/index.js`
- Test: `GasLibraryFactory/CoreUtilsLib/src/utils/__tests__/HtmlSanitizer.test.js`

**Interfaces:**
- Produces: `HtmlSanitizer.escapeHtml(value: string): string`, `HtmlSanitizer.safeColor(value: string, fallback: string): string`, `HtmlSanitizer.safeUrl(value: string): string` (note: ALDO's real `safeUrl` has no fallback param, always returns `'#'` — preserve exactly, do not add a fallback param the current code doesn't have), as static methods on a class (matching `ValidationUtils`'s static-method convention).

- [ ] **Step 1: Write failing tests porting every ALDO case**

```js
const { HtmlSanitizer } = require('../HtmlSanitizer');

describe('HtmlSanitizer', () => {
  describe('escapeHtml', () => {
    it('escapes &, <, >, ", \' in that priority order', () => {
      expect(HtmlSanitizer.escapeHtml('<img src=x onerror=alert(1)>'))
        .toBe('&lt;img src=x onerror=alert(1)&gt;');
    });
  });
  describe('safeColor', () => {
    it('accepts hex colors', () => { expect(HtmlSanitizer.safeColor('#c0392b', '#ddd')).toBe('#c0392b'); });
    it('accepts named colors', () => { expect(HtmlSanitizer.safeColor('red', '#ddd')).toBe('red'); });
    it('rejects injection attempts, returns fallback', () => {
      expect(HtmlSanitizer.safeColor('red;"><script>', '#ddd')).toBe('#ddd');
    });
  });
  describe('safeUrl', () => {
    it('accepts http(s) URLs', () => { expect(HtmlSanitizer.safeUrl('https://drive.google.com/x')).toBe('https://drive.google.com/x'); });
    it('rejects javascript: URIs, returns #', () => { expect(HtmlSanitizer.safeUrl('javascript:alert(1)')).toBe('#'); });
    it('trims whitespace before validating', () => { expect(HtmlSanitizer.safeUrl('  https://x.com  ')).toBe('https://x.com'); });
  });
});
```

(Port every exact case listed in the C2 research report — the escapeHtml char-by-char case, all safeColor/safeUrl cases — verbatim.)

- [ ] **Step 2: Run, verify fails**

Run: `cd GasLibraryFactory/CoreUtilsLib && npx jest src/utils/__tests__/HtmlSanitizer.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement, porting ALDO's exact logic**

```js
class HtmlSanitizer {
  static escapeHtml(raw) {
    return raw
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  static safeColor(raw, fallback) {
    return /^(#[0-9a-fA-F]{3,8}|[a-zA-Z]+)$/.test(raw) ? raw : fallback;
  }

  static safeUrl(raw) {
    const trimmed = raw.trim();
    return /^https?:\/\//i.test(trimmed) ? trimmed : '#';
  }
}

module.exports = { HtmlSanitizer };
```

- [ ] **Step 4: Export from `CoreUtilsLib/index.js`**

Add `HtmlSanitizer` to the export list alongside `ValidationUtils`/`StringUtils`.

- [ ] **Step 5: Run, verify passes**

Run: `cd GasLibraryFactory/CoreUtilsLib && npx jest src/utils/__tests__/HtmlSanitizer.test.js`
Expected: PASS.

- [ ] **Step 6: Full CoreUtilsLib suite + lint**

Run: `cd GasLibraryFactory && npx jest CoreUtilsLib && npx eslint CoreUtilsLib/src/utils/HtmlSanitizer.js CoreUtilsLib/index.js`

- [ ] **Step 7: Commit**

```bash
cd "GasLibraryFactory" && git add CoreUtilsLib
git commit -m "feat(core-utils): add HtmlSanitizer (escapeHtml/safeColor/safeUrl) ported from ALDO's boxes.ts"
```

### Part C2b (ALDO)

**Files:**
- Modify: `vendor/*` (refresh:vendor), `types/gaslibs/index.d.ts`
- Modify: `src/application/email/boxes.ts`
- Modify: `test/unit/application/email-boxes.test.ts`

- [ ] **Step 1: Refresh vendor, update ambient types**

Run: `npm run refresh:vendor`. In `types/gaslibs/index.d.ts`, under `--- CoreUtilsLib (L0) ---` (alongside `LoggerService`), add:

```ts
class HtmlSanitizer {
  static escapeHtml(raw: string): string;
  static safeColor(raw: string, fallback: string): string;
  static safeUrl(raw: string): string;
}
```

- [ ] **Step 2: Rewrite `boxes.ts`**

Delete the local `escapeHtml`/`safeColor`/`safeUrl` function bodies; re-export as thin wrappers so `emailSteps.ts`'s existing import sites (`escapeHtml`, `safeColor`) don't need to change:

```ts
export function escapeHtml(raw: string): string { return HtmlSanitizer.escapeHtml(raw); }
export function safeColor(raw: string, fallback: string): string { return HtmlSanitizer.safeColor(raw, fallback); }
export function safeUrl(raw: string): string { return HtmlSanitizer.safeUrl(raw); }
```

- [ ] **Step 3: Trim ALDO's test file**

Diff `test/unit/application/email-boxes.test.ts`'s case list against what was ported to GLF's `HtmlSanitizer.test.js` in C2a Step 1. For every case faithfully ported, delete the ALDO-side detailed case; keep one thin delegation-proof test per function:

```ts
it('escapeHtml delegates to library HtmlSanitizer', () => {
  expect(escapeHtml('<x>')).toBe(HtmlSanitizer.escapeHtml('<x>'));
});
```

Keep the box-level integration tests (note-box/documenti-box escaping assertions) since those test `boxes.ts`'s actual template rendering, not the escaping primitives themselves.

- [ ] **Step 4: Grep for other hand-written HTML escaping**

Run: `grep -rn "replace(/&\|replace(/<\|replace(/>" src/` — confirm zero hits outside `boxes.ts` (per prior audit). If found, consolidate onto `HtmlSanitizer` too.

- [ ] **Step 5: Full ALDO gate**

Run: `npm run typecheck && npm run lint && npm test && npm run verify:vendor`

- [ ] **Step 6: Commit**

```bash
git add vendor/ types/gaslibs/index.d.ts src/application/email/boxes.ts test/unit/application/email-boxes.test.ts
git commit -m "refactor(email): delegate boxes.ts HTML escaping to library HtmlSanitizer, delete local implementations"
```

---

## Task C3 — `SheetByIdStrategy` ambient type + ALDO delegation

**No GLF changes** — confirmed already exported/bundled by research.

**Files:**
- Modify: `types/gaslibs/index.d.ts`
- Rewrite: `src/application/import/CustomSourceStrategies.ts`
- Test: `test/unit/application/custom-source-strategies.test.ts`

- [ ] **Step 1: Write failing ALDO test for delegation**

In `test/unit/application/custom-source-strategies.test.ts`, add a case asserting `readSheetRows` produces the same rows via a `SheetByIdStrategy`-backed path for a >26-column sheet (the flagged behavioral difference — ALDO's current hardcoded `Z` cutoff vs. the library's `gridProperties.columnCount`-derived range) to pin the corrected behavior:

```ts
it('reads full range including columns beyond Z when no explicit range given (delegates to SheetByIdStrategy column-count logic)', () => {
  const spreadsheets = fakeSpreadsheets({ columnCount: 30, rowCount: 5 });
  const result = readSheetRows(spreadsheets, { sheetId: 's1', hasHeaders: true });
  expect(spreadsheets.getRanges).toHaveBeenCalledWith('s1', expect.stringMatching(/:AD\d+$/)); // col 30 = AD
});
```

- [ ] **Step 2: Run, verify fails or passes for the wrong reason**

Run: `npx jest test/unit/application/custom-source-strategies.test.ts -t "beyond Z"`
Expected: FAIL under current hardcoded-`Z` implementation (proves the gap).

- [ ] **Step 3: Add `SheetByIdStrategy` ambient declaration**

In `types/gaslibs/index.d.ts`, in the `--- GasDataImporter (L3) ---` section, sibling to `SourceStrategy`:

```ts
class SheetByIdStrategy extends SourceStrategy {
  constructor(logger: LoggerService, spreadsheetService: SpreadsheetService);
  extract(config: { sheetId: string; tabName?: string; range?: string; hasHeaders?: boolean }): Record<string, unknown>[];
}
```

(No `refresh:vendor` needed per C3's confirmed no-GLF-change status — but run `npm run verify:vendor` to confirm the checksum is still valid, since we're not touching GLF.)

- [ ] **Step 4: Rewrite `readSheetRows` in `CustomSourceStrategies.ts`**

Replace the hand-rolled tab/range resolution (lines 27-50) with delegation:

```ts
function readSheetRows(spreadsheets: SpreadsheetService, logger: LoggerService, config: { sheetId: string; tabName?: string; range?: string; hasHeaders?: boolean }): Record<string, unknown>[] {
  const strategy = new SheetByIdStrategy(logger, spreadsheets);
  return strategy.extract(config);
}
```

Remove the `coerce: (value: unknown) => unknown` parameter from `readSheetRows`'s signature and both call sites (lines ~70, ~108) — coercion now happens inside `SheetByIdStrategy.extract()` via its inherited `_coerceValue`. Keep the outer per-class/per-document iteration in `createCercaCartelleClasseStrategy`/`createCercaDocumentiStrategy` and the `_CLASSE` tagging logic as ALDO code, calling the new `readSheetRows` per found sheet.

- [ ] **Step 5: Update fakes/tests**

`fakeSpreadsheets()` already matches `{getSheetInfo, getRanges}` — confirmed compatible with `SheetByIdStrategy`'s constructor needs (per research), pass it directly. Add a `logger` fake (`{debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn()}`) if not already present in the test file's fixtures. Run the full test file and fix any assertion that depended on the old `Z`-cutoff behavior (this is the intended correctness fix, not a regression).

- [ ] **Step 6: Run, verify passes**

Run: `npx jest test/unit/application/custom-source-strategies.test.ts`
Expected: PASS, including the new >26-column test.

- [ ] **Step 7: Full ALDO gate**

Run: `npm run typecheck && npm run lint && npm test && npm run verify:vendor`

- [ ] **Step 8: Commit**

```bash
git add types/gaslibs/index.d.ts src/application/import/CustomSourceStrategies.ts test/unit/application/custom-source-strategies.test.ts
git commit -m "refactor(import): delegate readSheetRows to library SheetByIdStrategy, remove hand-rolled tab/range resolution and duplicate coercion"
```

---

## Final verification pass

**Files:** none (verification only)

- [ ] **Step 1: GLF full gate**

Run: `cd "GasLibraryFactory" && npm test && npm run lint` (accept pre-existing unrelated lint debt; confirm zero new errors on touched files listed above).

- [ ] **Step 2: ALDO full gate**

Run: `cd "ALDO implementing" && npm run typecheck && npm run lint && npm test && npm run verify:vendor`

- [ ] **Step 3: Native-global leak grep**

Run:
```bash
grep -rn 'DriveApp\|SpreadsheetApp\|DocumentApp\|PropertiesService\|CacheService\|UrlFetchApp\|Utilities\.\|Session\.\|ScriptApp\|LockService\|MailApp' src/ --include=*.ts | grep -v facades/
```
Expected: zero hits in ALDO `src/` outside `facades/`. Repeat equivalent grep for any new/touched GLF files outside `GoogleApiWrapper`.

- [ ] **Step 4: Confirm every workaround listed in the acceptance checklist is actually deleted**

`grep -rn "columnIndexToLetters\|firstEmptyColumn\|writeHeaders" src/application/strategies/SheetMaterieGeneratorStrategy.ts` → should only find `columnIndexToLetters` if it moved to the ConPermessi strategy, nothing else. Confirm `ContextBuilder.ts` has no manual `for (const token of recipe.providers)` loop left. Confirm ALDO's own `SwapAndEnrichInterceptor` class file is deleted (or reduced to only the policy function, no array-walk). Confirm `DocumentoConTabelleImportateGeneratorStrategy.ts` has no append-at-end loop. Confirm `boxes.ts` has no local escaping bodies. Confirm `CustomSourceStrategies.ts`'s `coerce` param is gone.

- [ ] **Step 5: Update SPECS_ALDO cross-check**

Confirm `SPECS_ALDO/10_PIPELINE_DOCUMENTI.md §9` no longer mentions `headerRow`/`startColumn` in `CONF_DOC.PARAMETRI`.
