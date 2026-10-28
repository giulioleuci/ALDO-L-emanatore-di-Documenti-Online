# Axis-Specific Generator Refactor

**Date:** 2026-08-28  
**Status:** Design (awaiting approval)  
**Scope:** Make batch document iteration axes explicit via `CONF_DOC.GENERATORE` instead of hidden in `CONF_DOC.TIPO`.

---

## 1. Problem Statement

Currently, `CONF_DOC.TIPO` serves dual purposes:

1. **Categorical** — names the document family (e.g., `DOCUMENTO_DOCENTE_CLASSE_MATERIA` is "a docent-scoped document")
2. **Discriminatory** — _forces_ DocumentBatchService to iterate over a specific axis (docent+subject pairs, class+subject pairs, or departments)

This coupling makes it impossible to:

- Render the same axis (e.g., docent+subject) via different strategies (template-based vs. spreadsheet)
- Add new iteration axes independently of rendering strategy
- Reason about which part of the code controls iteration vs. rendering

**Goal:** Make iteration axis selection explicit via `CONF_DOC.GENERATORE`, leaving `CONF_DOC.TIPO` as pure metadata (exept for `PIANO_PERS`).

---

## 2. Solution Overview

Refactor `CONF_DOC.GENERATORE` to become the single discriminator for:

- Which iteration axis DocumentBatchService uses
- Which rendering Strategy the pipeline selects

**New generators (7 total, replacing the hidden 3):**

1. `DOCUMENTO_DOCENTE_CLASSE_MATERIA` — template-based rendering, docent+subject axis
2. `SHEET_DOCENTE_CLASSE_MATERIA` — spreadsheet-based rendering, docent+subject axis
3. `DOCUMENTO_CLASSE_MATERIA` — template-based rendering, class+subject axis
4. `SHEET_CLASSE_MATERIA` — spreadsheet-based rendering, class+subject axis
5. `DOCUMENTO_DIPARTIMENTO` — template-based rendering, department axis (renamed from `DIPARTIMENTO`)
6. `SHEET_DIPARTIMENTO` — spreadsheet-based rendering, department axis
7. (Plus the existing 7 generators remain unchanged: `VERBALE_CDC`, `DOCUMENTO_GENERICO`, `FOGLIO_GENERICO`, `DOC_PERSONALIZZATO`, `SHEET_CON_MATERIE`, `SHEET_CON_MATERIE_E_PERMESSI`, `DOCUMENTO_CON_TABELLE_IMPORTATE`)

**`CONF_DOC.TIPO` becomes optional metadata** — used only for filtering/reporting, never for dispatch logic.

---

## 3. Architecture & Components

### 3.1 New Strategy Classes

Create six new Strategy implementations under `src/application/strategies/`:

#### `DocumentoDocentiClasseMateriaGeneratorStrategy.ts`

- Inputs: CDU with `focus.docente` + `focus.materia` set; config with Drive template ID
- Output: cloned, rendered Document
- Delegates to existing template rendering pipeline (same as `VERBALE_CDC`, `DOCUMENTO_GENERICO`)

#### `SheetDocentiClasseMateriaGeneratorStrategy.ts`

- Inputs: CDU with `focus.docente` + `focus.materia`; config with Drive Sheet template ID
- Output: cloned, rendered Spreadsheet
- Reuses `SheetMaterieGeneratorStrategy` logic but scoped to a single docent+subject pair (not all subjects in a class)

#### `DocumentoClasseMateriaGeneratorStrategy.ts`

- Inputs: CDU with `focus.classiMateria` set; config with Drive template ID
- Output: cloned, rendered Document
- Delegates to template rendering pipeline

#### `SheetClasseMateriaGeneratorStrategy.ts`

- Inputs: CDU with `focus.classiMateria`; config with Drive Sheet template ID
- Output: cloned, rendered Spreadsheet
- Scoped to a single class+subject pair

#### `DocumentoDipartimentoGeneratorStrategy.ts`

- Inputs: CDU with `focus.dipartimento` set; config with Drive template ID
- Output: cloned, rendered Document
- Delegates to template rendering pipeline

#### `SheetDipartimentoGeneratorStrategy.ts`

- Inputs: CDU with `focus.dipartimento`; config with Drive Sheet template ID
- Output: cloned, rendered Spreadsheet
- Scoped to a single department

All six inherit from `GeneratorStrategy` and are registered in `Bootstrap.ts`'s `strategyRegistry`.

### 3.2 Dispatch Map in DocumentBatchService

Add a static lookup table that maps generator names to their iteration handler:

```typescript
private static readonly GENERATOR_TO_AXIS = new Map<string, 'docentiClasseMateria' | 'classiMateria' | 'dipartimento' | null>([
  ['DOCUMENTO_DOCENTE_CLASSE_MATERIA', 'docentiClasseMateria'],
  ['SHEET_DOCENTE_CLASSE_MATERIA', 'docentiClasseMateria'],
  ['DOCUMENTO_CLASSE_MATERIA', 'classiMateria'],
  ['SHEET_CLASSE_MATERIA', 'classiMateria'],
  ['DOCUMENTO_DIPARTIMENTO', 'dipartimento'],
  ['SHEET_DIPARTIMENTO', 'dipartimento'],
]);
```

**Why a map, not naming convention?**

- Explicit and queryable (no parsing, no ambiguity)
- Matches existing patterns in the codebase (e.g., role resolution registries)
- Self-documenting: readers see exactly which generators are axis-specific

### 3.3 Refactored Dispatch Logic

**Current `batchGenerateHandler` (DocumentBatchService.ts, lines 94–127):**

```typescript
if (config.tipo === 'PIANO_PERS') { /* ... */ }
if (config.tipo === 'DOCUMENTO_DOCENTE_CLASSE_MATERIA') { /* ... */ }
if (config.tipo === 'DOCUMENTO_CLASSE_MATERIA') { /* ... */ }
if (config.tipo === 'DIPARTIMENTO') { /* ... */ }
return yield* this.generateClassi(config, ...);
```

**New dispatch (after refactor):**

```typescript
if (config.tipo === 'PIANO_PERS') { /* unchanged */ }

const axis = this.GENERATOR_TO_AXIS.get(config.generatore) ?? null;
if (axis === 'docentiClasseMateria') {
  return yield* this.generateDocentiClasseMateria(config, ...);
}
if (axis === 'classiMateria') {
  return yield* this.generateClassiMateria(config, ...);
}
if (axis === 'dipartimento') {
  return yield* this.generateDipartimenti(config, ...);
}

// Default: iterate over classes
return yield* this.generateClassi(config, ...);
```

**Key change:** Dispatch key shifts from `config.tipo` to `config.generatore`. The three batch handlers (`generateDocentiClasseMateria`, `generateClassiMateria`, `generateDipartimenti`) remain **unchanged** — same CDU assembly, same iteration logic. Only the Strategy selection (in RenderTemplateStep) differs.

### 3.4 Strategy Registration (Bootstrap.ts)

In `buildAldoContainer`, register all six new strategies in `strategyRegistry`:

```typescript
const registry = new Map<string, GeneratorStrategy>([
  // Existing (unchanged)
  ['VERBALE_CDC', new VerbaleGeneratorStrategy(deps.templates)],
  ['DOCUMENTO_GENERICO', new DocumentoGenericoGeneratorStrategy(deps.templates)],
  // ... others ...

  // New axis-specific generators
  [
    'DOCUMENTO_DOCENTE_CLASSE_MATERIA',
    new DocumentoDocentiClasseMateriaGeneratorStrategy(deps.templates)
  ],
  ['DOCUMENTO_CLASSE_MATERIA', new DocumentoClasseMateriaGeneratorStrategy(deps.templates)],
  ['DOCUMENTO_DIPARTIMENTO', new DocumentoDipartimentoGeneratorStrategy(deps.templates)]
]);

// Sheet-based generators (requires deps.spreadsheets)
if (deps.spreadsheets !== undefined) {
  registry.set(
    'SHEET_DOCENTE_CLASSE_MATERIA',
    new SheetDocentiClasseMateriaGeneratorStrategy(deps.spreadsheets, deps.templates)
  );
  registry.set(
    'SHEET_CLASSE_MATERIA',
    new SheetClasseMateriaGeneratorStrategy(deps.spreadsheets, deps.templates)
  );
  registry.set(
    'SHEET_DIPARTIMENTO',
    new SheetDipartimentoGeneratorStrategy(deps.spreadsheets, deps.templates)
  );
}
```

---

## 4. Data Model

### 4.1 CONF_DOC Schema

**No schema changes.** Existing columns remain:

- `GENERATORE` (String): now must be one of the 13 registered generators (7 existing + 6 new)
- `TIPO` (String): optional, used for categorization/filtering only; no longer discriminates dispatch

### 4.2 Validation Rules

1. **At config load time (ConfigurazioneDocumentoRepository):**
   - Validate that `GENERATORE` is registered in the strategy registry
   - If not, throw ConfigurationError: `"GENERATORE ${value} non registrato"`

2. **Axis-specific validation (optional, in DocumentBatchService.batchGenerateHandler):**
   - If `GENERATORE` maps to an axis (e.g., `DOCUMENTO_DOCENTE_CLASSE_MATERIA`), optionally assert that the strategy can handle the intended iteration (future-proofing, not required for launch)

### 4.3 Examples

**Old row (will not work after refactor):**

```
ID: "VERBALE_5A_MAGGIO"
TIPO: "DOCUMENTO_DOCENTE_CLASSE_MATERIA"
GENERATORE: (empty or null)
FORMATO: "DOCUMENTO"
```

**New row (template-based, docent+subject):**

```
ID: "VERBALE_DOCENTE_MATERIA"
TIPO: (empty or "DOCUMENTO") — for categorization only
GENERATORE: "DOCUMENTO_DOCENTE_CLASSE_MATERIA"
FORMATO: "DOCUMENTO"
MODELLI: { ... Drive template ID ... }
```

**New row (spreadsheet-based, class+subject):**

```
ID: "FOGLIO_CLASSE_MATERIA"
TIPO: (empty or "FOGLIO")
GENERATORE: "SHEET_CLASSE_MATERIA"
FORMATO: "SPREADSHEET"
MODELLI: { ... Drive sheet template ID ... }
```

---

## 5. Implementation Phases

### Phase 1: Create Strategy Classes (6 new files)

- Each file minimal: constructor, implements `GeneratorStrategy.generate()`
- Delegate to existing `DocumentGenerationService` methods or reuse rendering helpers
- Add unit tests for each (mock CDU, config, strategy behavior)

### Phase 2: Update DocumentBatchService

- Add `GENERATOR_TO_AXIS` map
- Refactor `batchGenerateHandler` to dispatch on `config.generatore`
- Update batch handler calls to pass config (already done)
- Integration tests: ensure dispatch routes to correct handler

### Phase 3: Update Bootstrap & Tests

- Register six new strategies in `strategyRegistry`
- Update test fixtures to use new `GENERATORE` values
- Update online test seed data (if CONF_DOC rows hardcoded)
- Update existing integration tests that reference old TIPO dispatch logic

### Phase 4: Documentation & Migration

- Update `SPECS_ALDO/01_SCHEMA_DATABASE.md` (§CONF_DOC) to reflect new dispatch logic
- Update architecture notes on generator lifecycle
- (No backward-compatibility migration needed — clean refactor)

---

## 6. Testing Strategy

### Unit Tests

- Each new Strategy class: mock CDU (focus.docente, focus.materia, etc.), mock config, verify cloned file is rendered correctly
- DocumentBatchService dispatch map: verify `GENERATOR_TO_AXIS.get()` returns correct handler name for all 6 generators

### Integration Tests

- DocumentBatchService batch flow: generate a CONF_DOC with `GENERATORE=DOCUMENTO_DOCENTE_CLASSE_MATERIA`, verify correct handler is invoked and correct Strategy (from registry) is used
- Registry loading: verify all six new generators are registered when Bootstrap runs

### Online Tests

- If seed data includes CONF_DOC rows, update them to use new GENERATORE values
- Run full batch generation flow (in online mode) to confirm axis dispatch and rendering work end-to-end

---

## 7. Assumptions & Risks

### Assumptions

1. **Batch handlers remain unchanged:** `generateDocentiClasseMateria`, `generateClassiMateria`, `generateDipartimenti` logic is orthogonal to Strategy selection.
2. **Strategy selection happens in RenderTemplateStep:** The pipeline already decouples Strategy selection from iteration; new generators simply register new Strategy implementations.
3. **No existing CONF_DOC rows depend on the old TIPO dispatch:** (Confirmed: no production data.)

### Risks

1. **Incomplete Strategy implementation:** If a new Strategy doesn't correctly handle its axis's CDU shape, errors will surface late (in batch execution). Mitigate: thorough unit tests + integration tests before Phase 3.
2. **Dispatch map & axis logic diverge:** If a generator is added to the registry but not to `GENERATOR_TO_AXIS`, dispatch silently falls back to `generateClassi`. Mitigate: document the map as the source of truth; add a check in tests that every axis-specific generator is in the map.

---

## 8. Success Criteria

1. ✅ All six new Strategies implement `GeneratorStrategy` and are registered
2. ✅ DocumentBatchService dispatches on `GENERATORE` (not `TIPO`)
3. ✅ Unit tests pass for each new Strategy
4. ✅ Integration tests confirm batch flow selects correct handler + Strategy
5. ✅ Online tests run with seed data using new GENERATORE values
6. ✅ No regressions in existing generator behavior (VERBALE_CDC, DOCUMENTO_GENERICO, etc.)
7. ✅ Documentation updated (SPECS_ALDO/01_SCHEMA_DATABASE.md)
