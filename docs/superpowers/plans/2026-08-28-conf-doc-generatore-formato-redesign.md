# CONF_DOC GENERATORE/FORMATO Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `CONF_DOC.GENERATORE` the sole batch-iteration-axis discriminator (8 axes: `CLASSE`, `DOCENTE`, `PIANO_PERSONALIZZATO`, `CLASSE_MATERIA`, `CLASSE_DOCENTE`, `CLASSE_DOCENTE_MATERIA`, `DIPARTIMENTO`, `ALUNNO`), make `CONF_DOC.FORMATO` (`GDOC`/`GSHEET`) the sole document-engine discriminator via a `DocumentStrategyFactory`, fold `aggiungiMaterie`/`aggiungiMaterieConPermessi`/`tabelleImportate` into `CONF_DOC.PARAMETRI` feature flags, delete `VerbaleGeneratorStrategy`, and re-key `DocumentBatchService`/`DocumentGenerationService`/`RenderTemplateStep` off `CONF_DOC.TIPO` (which becomes a free-form label, `PIANO_PERS` excepted) onto `CONF_DOC.GENERATORE`.

**Architecture:** Today `GENERATORE` is a free string used only as a `strategyRegistry` lookup key (7 strategy classes), while `TIPO` drives every axis dispatch branch in `DocumentBatchService.batchGenerateHandler` and the `sottotipo()`/duplicate-check logic in `documentSteps.ts`. This plan flips that: `GENERATORE` becomes a validated `GeneratoreAxis` enum driving axis dispatch (and, by extension, `LOG_DOCS.SOTTOTIPO`), `FORMATO` (reusing the existing `FormatoOutput` enum, narrowed to `GDOC`/`GSHEET` by validation) plus `PARAMETRI.aggiungiMaterie`/`aggiungiMaterieConPermessi`/`tabelleImportate` drive a small `DocumentStrategyFactory` that replaces the `Map<string, GeneratorStrategy>` registry. `aggiungiMaterie` (no ACL) and `aggiungiMaterieConPermessi` (with ACL) are the user's resolution to the spec's original single `materiePermessi` flag, which conflated "add the columns" with "protect them" and left `SheetMaterieGeneratorStrategy` (columns, no ACL) unreachable — splitting the flag keeps both `SheetMaterieGeneratorStrategy` and `SheetMaterieConPermessiGeneratorStrategy` selectable. Five of the eight axes (`CLASSE`, `PIANO_PERSONALIZZATO` via `ALUNNO_COMPLETO`'s sibling `PIANO_PERSONALIZZATO` recipe, `CLASSE_MATERIA`, `CLASSE_DOCENTE_MATERIA`, `DIPARTIMENTO`, `ALUNNO`) already have working `DocumentGenerationService.generateForX`/CDU recipes from the 2026-08-28 axis work (commits `b83d6df`..`8475d93`) and are reused as-is, just re-keyed. Two axes are genuinely new (`DOCENTE` aggregate, `CLASSE_DOCENTE`) and get new focus providers mirroring the existing `DocenteClasseMateriaFocusProvider` pattern.

**Tech Stack:** TypeScript, GAS V8, GasLibraryFactory (ContextEngine, PipelineFramework, DomainRepositoryLib, GasExpressionEngineLib, RoleResolutionLib), Jest (ts-jest).

**Spec:** `docs/superpowers/specs/2026-08-28-conf-doc-generatore-formato-redesign.md`

## Global Constraints

- Target GAS V8: synchronous code only, no Node/browser APIs. Source is transpiled Babel → Chrome 80.
- Native GAS globals (`DriveApp`, `SpreadsheetApp`, etc.) only inside `GoogleApiWrapper` (L2); all ALDO code routes through facades — enforced by ESLint `no-restricted-globals`, `npm run lint` must pass.
- `src/domain/` must not import GAS/library modules.
- New services/facades wired in `src/config/Bootstrap.ts`, resolved via `ServiceContainer`, never constructed ad hoc.
- Never edit `dist/*` (generated).
- Reuse `IExpressionEngine`/`GasExpressionEngineLib` for MODELLI/CONDIZIONE evaluation — already wired via `ConfigurazioneDocumentoRepository`, do not reimplement.
- No production `CONF_DOC` data exists yet (per the 2026-08-28 axis-specific-generators plan, confirmed still true) — no data-migration step is included for renamed/retired `GENERATORE`/`TIPO` values.

## Judgment Calls (read before implementing Task 2 / Task 5)

The spec's §5 strategy-factory diagram names exactly 4 reachable strategies (`DocumentoGenericoGeneratorStrategy`, `FoglioGenericoGeneratorStrategy`, `DocumentoConTabelleImportateGeneratorStrategy`, `SheetMaterieConPermessiGeneratorStrategy`) selected purely from `FORMATO` + the two `PARAMETRI` flags. Two existing behaviors don't fit that 2×2 matrix and the spec never mentions retiring them (unlike `VerbaleGeneratorStrategy`, which §2.4 explicitly names for deletion):

1. **`DocPersonalizzatoGeneratorStrategy`** (the `piano.<campo>` compatibility alias merge used by `PIANO_PERSONALIZZATO` today). Task 2 keeps it reachable by special-casing `GeneratoreAxis.PIANO_PERSONALIZZATO` in the factory ahead of the generic `FORMATO`/`tabelleImportate` branch, so existing PDP/PEI/PFP Drive templates that read `{{piano.campo}}` keep working. This is a deliberate deviation from the literal §5 diagram — flagged here rather than silently dropped.
2. **`SheetMaterieGeneratorStrategy`** (plain per-subject dynamic columns, **no** ACL protection — today reachable via `GENERATORE=SHEET_CON_MATERIE`) — **resolved, no longer a gap.** The user chose to split the spec's single `materiePermessi` flag into two: `PARAMETRI.aggiungiMaterie` (columns, no ACL) selects `SheetMaterieGeneratorStrategy`; `PARAMETRI.aggiungiMaterieConPermessi` (columns + ACL) selects `SheetMaterieConPermessiGeneratorStrategy`, same as the old `materiePermessi=true`. The two flags are mutually exclusive (constructor-validated in Task 1). This is a deliberate deviation from the spec's literal 2×2 `FORMATO`×flag diagram (now a 1×3 fork on the GSHEET side) — the spec docs (`SPEC_GENERATORE_FORMATO.md` and its copy under `docs/superpowers/specs/`) have already been updated to match before this plan was finalized.

---

## File Structure

- `src/domain/value-objects/enums.ts` — add `GeneratoreAxis` enum (8 values).
- `src/domain/entities/ConfigurazioneDocumento.ts` — type `generatore: GeneratoreAxis`, validate `generatore`/`formato` in the constructor (throw `ConfigurationError` per spec §5.2), keep `formato: FormatoOutput` (narrowed by validation, no new parallel enum — see Task 1 rationale).
- `src/application/factories/DocumentStrategyFactory.ts` — **new**, replaces the `strategyRegistry` `Map`.
- `src/application/strategies/VerbaleGeneratorStrategy.ts` — **deleted**.
- `src/application/pipelines/documentSteps.ts` — `RenderTemplateStep` uses the factory; `sottotipo()`/`CheckDuplicatesStep`'s `tipi` array re-key from `TIPO` string literals to `confDoc(ctx).generatore` enum comparisons.
- `src/application/services/DocumentGenerationService.ts` — `strategyRegistry` dep → `strategyFactory`; drop the three now-redundant `!this.strategyRegistry.has(...)` guards (validation moved to `ConfigurazioneDocumento.fromData`); add `generateForClasseDocente` and `generateForDocente`.
- `src/application/services/DocumentBatchService.ts` — dispatch re-keyed from `config.tipo` to `config.generatore` across all 8 axes; new `generateClasseDocente`/`generateDocenti`/`generateAlunni` batch methods; new `ClasseDocenteBatchTarget`/`DocenteBatchTarget`/`AlunnoBatchTarget` checkpoint types.
- `src/application/services/RisolutoreRuoliService.ts` — add `DOCENTE_CORRENTE`, `DOCENTI_DIPARTIMENTO`, and a `CAPO_DIPART` alias (extending `capoDipartimento` with the `focus.dipartimento.capo.email` fast path from spec §6.2.1) to `buildRegistro()`.
- `src/application/context-engine/providers/DocenteClasseFocusProvider.ts` — **new**, `CLASSE_DOCENTE` axis.
- `src/application/context-engine/providers/DocenteAggregatoFocusProvider.ts` — **new**, `DOCENTE` axis.
- `src/application/context-engine/Recipe.ts` — add `CLASSE_DOCENTE` and `DOCENTE_AGGREGATO` recipes; `BuildParams` gains nothing new (`classiCompetenza`/`docenteCorrente` already exist).
- `src/application/context-engine/ContextEngineFactory.ts` — register the two new providers.
- `src/application/context-engine/Cdu.ts` — `focus.docente` widened to carry `cattedre?: CattedraVM[]` for the `DOCENTE` axis.
- `src/config/Bootstrap.ts` — replace `strategyRegistry` registration with `strategyFactory`; drop `VerbaleGeneratorStrategy` import/registration; wire `DocumentGenerationService.strategyFactory`.
- `SPECS_ALDO/01_SCHEMA_DATABASE.md`, `SPECS_ALDO/02_CDU_STRUTTURA.md` — sync `CONF_DOC.GENERATORE`/`FORMATO` semantics, new `focus.docente.cattedre` path.
- Tests: `test/unit/domain/configurazione-documento.test.ts`, `test/unit/application/factories/document-strategy-factory.test.ts` (new), `test/unit/application/pipelines/document-steps.test.ts`, `test/unit/application/document-generation-service.test.ts`, `test/unit/application/document-batch-service.test.ts`, `test/unit/application/risolutore-ruoli-service.test.ts`, `test/unit/application/context-engine/providers/docente-classe-focus-provider.test.ts` (new), `test/unit/application/context-engine/providers/docente-aggregato-focus-provider.test.ts` (new).

---

### Task 1: Domain — `GeneratoreAxis` enum + `ConfigurazioneDocumento` validation

**Files:**
- Modify: `src/domain/value-objects/enums.ts`
- Modify: `src/domain/entities/ConfigurazioneDocumento.ts`
- Test: `test/unit/domain/configurazione-documento.test.ts` (create if it doesn't exist yet — check first with `find test/unit/domain -iname "configurazione-documento*"`)

**Interfaces:**
- Produces: `GeneratoreAxis` enum (`CLASSE`, `DOCENTE`, `PIANO_PERSONALIZZATO`, `CLASSE_MATERIA`, `CLASSE_DOCENTE`, `CLASSE_DOCENTE_MATERIA`, `DIPARTIMENTO`, `ALUNNO`); `ConfigurazioneDocumento.generatore: GeneratoreAxis`; constructor throws `ConfigurationError` for an invalid/missing `GENERATORE` or `FORMATO` (not `GDOC`/`GSHEET`).
- Consumes: existing `FormatoOutput` enum (`GDOC`/`GSHEET`/`PDF`/`TEXT`) — no new parallel `FormatoDocumento` type is introduced; `CONF_DOC.FORMATO` is validated to only ever be `GDOC` or `GSHEET` at construction time, `PDF`/`TEXT` become invalid values for `CONF_DOC` rows (they stay in the shared enum since `documentSteps.ts:buildFileLink` already has a generic fallback branch for them — grep confirmed no other consumer needs a separate type).

- [ ] **Step 1: Write failing test for `GeneratoreAxis` + validation**

```ts
// test/unit/domain/configurazione-documento.test.ts
import { ConfigurazioneDocumento } from '../../../src/domain/entities/ConfigurazioneDocumento';
import { GeneratoreAxis } from '../../../src/domain/value-objects/enums';
import { COL_CONF_DOC } from '../../../src/config/schema';
import { ConfigurationError } from '../../../src/domain/errors/DomainError';

describe('ConfigurazioneDocumento — GENERATORE/FORMATO validation', () => {
  const validRow = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
    [COL_CONF_DOC.ID]: 'X',
    [COL_CONF_DOC.TIPO]: 'VERBALE',
    [COL_CONF_DOC.GENERATORE]: 'CLASSE',
    [COL_CONF_DOC.FORMATO]: 'GDOC',
    ...overrides
  });

  it('accepts every documented GeneratoreAxis value', () => {
    for (const axis of Object.values(GeneratoreAxis)) {
      expect(ConfigurazioneDocumento.fromData(validRow({ [COL_CONF_DOC.GENERATORE]: axis })).generatore).toBe(
        axis
      );
    }
  });

  it('rejects an unknown GENERATORE', () => {
    expect(() => ConfigurazioneDocumento.fromData(validRow({ [COL_CONF_DOC.GENERATORE]: 'BOH' }))).toThrow(
      ConfigurationError
    );
  });

  it('rejects a missing GENERATORE', () => {
    expect(() =>
      ConfigurazioneDocumento.fromData(validRow({ [COL_CONF_DOC.GENERATORE]: undefined }))
    ).toThrow(ConfigurationError);
  });

  it('accepts GDOC/GSHEET and rejects PDF/TEXT/unknown FORMATO', () => {
    expect(ConfigurazioneDocumento.fromData(validRow({ [COL_CONF_DOC.FORMATO]: 'GSHEET' })).formato).toBe(
      'GSHEET'
    );
    expect(() => ConfigurazioneDocumento.fromData(validRow({ [COL_CONF_DOC.FORMATO]: 'PDF' }))).toThrow(
      ConfigurationError
    );
    expect(() => ConfigurazioneDocumento.fromData(validRow({ [COL_CONF_DOC.FORMATO]: undefined }))).toThrow(
      ConfigurationError
    );
  });

  it('rejects tabelleImportate=true on GSHEET', () => {
    const row = validRow({
      [COL_CONF_DOC.FORMATO]: 'GSHEET',
      [COL_CONF_DOC.PARAMETRI]: JSON.stringify({ tabelleImportate: true })
    });
    expect(() => ConfigurazioneDocumento.fromData(row)).toThrow(
      "L'importazione tabelle è supportata unicamente su formato GDOC"
    );
  });

  it('rejects aggiungiMaterie truthy on GDOC', () => {
    const row = validRow({
      [COL_CONF_DOC.FORMATO]: 'GDOC',
      [COL_CONF_DOC.PARAMETRI]: JSON.stringify({ aggiungiMaterie: true })
    });
    expect(() => ConfigurazioneDocumento.fromData(row)).toThrow(
      'Le colonne materie sono supportate unicamente su formato GSHEET'
    );
  });

  it('rejects aggiungiMaterieConPermessi truthy on GDOC', () => {
    const row = validRow({
      [COL_CONF_DOC.FORMATO]: 'GDOC',
      [COL_CONF_DOC.PARAMETRI]: JSON.stringify({ aggiungiMaterieConPermessi: true })
    });
    expect(() => ConfigurazioneDocumento.fromData(row)).toThrow(
      'Le colonne materie sono supportate unicamente su formato GSHEET'
    );
  });

  it('rejects aggiungiMaterie and aggiungiMaterieConPermessi both truthy', () => {
    const row = validRow({
      [COL_CONF_DOC.FORMATO]: 'GSHEET',
      [COL_CONF_DOC.PARAMETRI]: JSON.stringify({ aggiungiMaterie: true, aggiungiMaterieConPermessi: true })
    });
    expect(() => ConfigurazioneDocumento.fromData(row)).toThrow(
      'aggiungiMaterie e aggiungiMaterieConPermessi sono mutuamente esclusivi'
    );
  });

  it('rejects aggiungiMaterie on the DIPARTIMENTO axis', () => {
    const row = validRow({
      [COL_CONF_DOC.GENERATORE]: 'DIPARTIMENTO',
      [COL_CONF_DOC.FORMATO]: 'GSHEET',
      [COL_CONF_DOC.PARAMETRI]: JSON.stringify({ aggiungiMaterie: true })
    });
    expect(() => ConfigurazioneDocumento.fromData(row)).toThrow(
      "Le colonne materie non sono applicabili all'asse DIPARTIMENTO (nessun consiglio di classe)"
    );
  });

  it('rejects aggiungiMaterieConPermessi on the DIPARTIMENTO axis', () => {
    const row = validRow({
      [COL_CONF_DOC.GENERATORE]: 'DIPARTIMENTO',
      [COL_CONF_DOC.FORMATO]: 'GSHEET',
      [COL_CONF_DOC.PARAMETRI]: JSON.stringify({ aggiungiMaterieConPermessi: true })
    });
    expect(() => ConfigurazioneDocumento.fromData(row)).toThrow(
      "Le colonne materie non sono applicabili all'asse DIPARTIMENTO (nessun consiglio di classe)"
    );
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest --config jest.config.cjs test/unit/domain/configurazione-documento.test.ts`
Expected: FAIL — `GeneratoreAxis` doesn't exist (compile error) and/or no validation is thrown.

- [ ] **Step 3: Add the enum**

In `src/domain/value-objects/enums.ts`, add after `GestioneArticolazione`:

```ts
export enum GeneratoreAxis {
  CLASSE = 'CLASSE',
  DOCENTE = 'DOCENTE',
  PIANO_PERSONALIZZATO = 'PIANO_PERSONALIZZATO',
  CLASSE_MATERIA = 'CLASSE_MATERIA',
  CLASSE_DOCENTE = 'CLASSE_DOCENTE',
  CLASSE_DOCENTE_MATERIA = 'CLASSE_DOCENTE_MATERIA',
  DIPARTIMENTO = 'DIPARTIMENTO',
  ALUNNO = 'ALUNNO'
}
```

- [ ] **Step 4: Validate in `ConfigurazioneDocumento`**

In `src/domain/entities/ConfigurazioneDocumento.ts`, import `GeneratoreAxis` and `ConfigurationError`, change the `generatore` field type, and replace the constructor body's `generatore`/`formato` assignment with validated versions (keep everything else — `gestioneArticolazione`, `modelliRaw`, etc. — unchanged):

```ts
import { FormatoOutput, GestioneArticolazione, GeneratoreAxis } from '../value-objects/enums';
import { ConfigurationError } from '../errors/DomainError';
// ...
public readonly generatore: GeneratoreAxis;
public readonly formato: FormatoOutput;
// ...
constructor(data: ConfigurazioneDocumentoData = {}) {
  super(data);
  this.id = typeof data[COL_CONF_DOC.ID] === 'string' ? (data[COL_CONF_DOC.ID] as string) : null;
  this.tipo =
    typeof data[COL_CONF_DOC.TIPO] === 'string' ? (data[COL_CONF_DOC.TIPO] as string) : '';
  const generatoreRaw = data[COL_CONF_DOC.GENERATORE];
  if (!Object.values(GeneratoreAxis).includes(generatoreRaw as GeneratoreAxis)) {
    throw new ConfigurationError(`CONF_DOC ${this.id ?? '?'}: GENERATORE non valido: ${String(generatoreRaw)}`);
  }
  this.generatore = generatoreRaw as GeneratoreAxis;
  const formatoRaw = data[COL_CONF_DOC.FORMATO];
  if (formatoRaw !== FormatoOutput.GDOC && formatoRaw !== FormatoOutput.GSHEET) {
    throw new ConfigurationError(`CONF_DOC ${this.id ?? '?'}: FORMATO non valido: ${String(formatoRaw)}`);
  }
  this.formato = formatoRaw;
  this.gestioneArticolazione =
    data[COL_CONF_DOC.GESTIONE_ARTICOLAZIONE] === GestioneArticolazione.ARTICOLATA
      ? GestioneArticolazione.ARTICOLATA
      : GestioneArticolazione.COMPLETA;
  this.modelliRaw =
    typeof data[COL_CONF_DOC.MODELLI] === 'string' ? (data[COL_CONF_DOC.MODELLI] as string) : null;
  this.condizioneRaw =
    typeof data[COL_CONF_DOC.CONDIZIONE] === 'string' ? (data[COL_CONF_DOC.CONDIZIONE] as string) : '';
  this.parametriRaw =
    typeof data[COL_CONF_DOC.PARAMETRI] === 'string' ? (data[COL_CONF_DOC.PARAMETRI] as string) : null;
  this.permessiRaw =
    typeof data[COL_CONF_DOC.PERMESSI] === 'string' ? (data[COL_CONF_DOC.PERMESSI] as string) : null;

  const parametri = this.getParametri();
  const aggiungiMaterie = Boolean(parametri.aggiungiMaterie);
  const aggiungiMaterieConPermessi = Boolean(parametri.aggiungiMaterieConPermessi);
  if (this.formato === FormatoOutput.GSHEET && parametri.tabelleImportate === true) {
    throw new ConfigurationError("L'importazione tabelle è supportata unicamente su formato GDOC");
  }
  if (this.formato === FormatoOutput.GDOC && (aggiungiMaterie || aggiungiMaterieConPermessi)) {
    throw new ConfigurationError('Le colonne materie sono supportate unicamente su formato GSHEET');
  }
  if (this.generatore === GeneratoreAxis.DIPARTIMENTO && (aggiungiMaterie || aggiungiMaterieConPermessi)) {
    throw new ConfigurationError(
      "Le colonne materie non sono applicabili all'asse DIPARTIMENTO (nessun consiglio di classe)"
    );
  }
  if (aggiungiMaterie && aggiungiMaterieConPermessi) {
    throw new ConfigurationError('aggiungiMaterie e aggiungiMaterieConPermessi sono mutuamente esclusivi');
  }
}
```

Note: `getParametri()` is called from inside the constructor — it only reads `this.parametriRaw`, already assigned above it, so this is safe (no forward reference to an uninitialized field).

- [ ] **Step 5: Run to verify it passes**

Run: `npx jest --config jest.config.cjs test/unit/domain/configurazione-documento.test.ts`
Expected: PASS.

- [ ] **Step 6: Run the full domain/entity suite to catch fixture breakage**

Run: `npx jest --config jest.config.cjs test/unit/domain test/unit/infrastructure/repositories`
Expected: every other test constructing a `ConfigurazioneDocumento`/`ConfigurazioneDocumentoData` fixture now needs valid `GENERATORE`/`FORMATO` values — fix any fixture that used a strategy-name `GENERATORE` (e.g. `'DOCUMENTO_GENERICO'`) by replacing it with the appropriate `GeneratoreAxis` value for that fixture's intent (e.g. `'CLASSE'`), and set `FORMATO` explicitly if a fixture previously relied on the `GDOC` default with an invalid/absent value.

- [ ] **Step 7: Commit**

```bash
git add src/domain/value-objects/enums.ts src/domain/entities/ConfigurazioneDocumento.ts test/unit/domain/configurazione-documento.test.ts
git commit -m "feat(domain): GeneratoreAxis enum + CONF_DOC GENERATORE/FORMATO/PARAMETRI validation"
```

---

### Task 2: `DocumentStrategyFactory` replacing `strategyRegistry`

**Files:**
- Create: `src/application/factories/DocumentStrategyFactory.ts`
- Modify: `src/application/pipelines/documentSteps.ts` (`RenderTemplateStep`)
- Modify: `src/application/services/DocumentGenerationService.ts` (`DocumentGenerationDeps.strategyRegistry` → `strategyFactory`; drop the 3 `!this.strategyRegistry.has(...)` guards)
- Modify: `src/config/Bootstrap.ts` (registration)
- Delete: `src/application/strategies/VerbaleGeneratorStrategy.ts` + its test file (`find test -iname "verbale-generator-strategy*"`)
- Test: `test/unit/application/factories/document-strategy-factory.test.ts` (new), `test/unit/application/pipelines/document-steps.test.ts` (or wherever `RenderTemplateStep` is tested — `grep -rl "RenderTemplateStep" test/unit`)

**Interfaces:**
- Consumes: `ConfigurazioneDocumento.formato`/`.generatore`/`.getParametri()` (Task 1), existing strategy classes.
- Produces: `class DocumentStrategyFactory { resolve(config: ConfigurazioneDocumento): GeneratorStrategy }`.

- [ ] **Step 1: Write failing factory test**

```ts
// test/unit/application/factories/document-strategy-factory.test.ts
import { DocumentStrategyFactory } from '../../../../src/application/factories/DocumentStrategyFactory';
import { DocumentoGenericoGeneratorStrategy } from '../../../../src/application/strategies/DocumentoGenericoGeneratorStrategy';
import { FoglioGenericoGeneratorStrategy } from '../../../../src/application/strategies/FoglioGenericoGeneratorStrategy';
import { DocPersonalizzatoGeneratorStrategy } from '../../../../src/application/strategies/DocPersonalizzatoGeneratorStrategy';
import { DocumentoConTabelleImportateGeneratorStrategy } from '../../../../src/application/strategies/DocumentoConTabelleImportateGeneratorStrategy';
import { SheetMaterieGeneratorStrategy } from '../../../../src/application/strategies/SheetMaterieGeneratorStrategy';
import { SheetMaterieConPermessiGeneratorStrategy } from '../../../../src/application/strategies/SheetMaterieConPermessiGeneratorStrategy';
import { ConfigurazioneDocumento } from '../../../../src/domain/entities/ConfigurazioneDocumento';
import { COL_CONF_DOC } from '../../../../src/config/schema';

function config(overrides: Record<string, unknown>): ConfigurazioneDocumento {
  return ConfigurazioneDocumento.fromData({
    [COL_CONF_DOC.ID]: 'X',
    [COL_CONF_DOC.TIPO]: 'T',
    [COL_CONF_DOC.GENERATORE]: 'CLASSE',
    [COL_CONF_DOC.FORMATO]: 'GDOC',
    ...overrides
  });
}

describe('DocumentStrategyFactory', () => {
  const docGenerico = {} as DocumentoGenericoGeneratorStrategy;
  const foglioGenerico = {} as FoglioGenericoGeneratorStrategy;
  const docPersonalizzato = {} as DocPersonalizzatoGeneratorStrategy;
  const docTabelle = {} as DocumentoConTabelleImportateGeneratorStrategy;
  const sheetMaterie = {} as SheetMaterieGeneratorStrategy;
  const sheetPermessi = {} as SheetMaterieConPermessiGeneratorStrategy;

  it('GDOC + no tabelleImportate -> DocumentoGenerico', () => {
    const factory = new DocumentStrategyFactory(
      docGenerico,
      foglioGenerico,
      docPersonalizzato,
      docTabelle,
      sheetMaterie,
      sheetPermessi
    );
    expect(factory.resolve(config({}))).toBe(docGenerico);
  });

  it('GDOC + tabelleImportate=true -> DocumentoConTabelleImportate', () => {
    const factory = new DocumentStrategyFactory(
      docGenerico,
      foglioGenerico,
      docPersonalizzato,
      docTabelle,
      sheetMaterie,
      sheetPermessi
    );
    expect(
      factory.resolve(config({ [COL_CONF_DOC.PARAMETRI]: JSON.stringify({ tabelleImportate: true }) }))
    ).toBe(docTabelle);
  });

  it('PIANO_PERSONALIZZATO axis on GDOC always -> DocPersonalizzato (judgment call)', () => {
    const factory = new DocumentStrategyFactory(
      docGenerico,
      foglioGenerico,
      docPersonalizzato,
      docTabelle,
      sheetMaterie,
      sheetPermessi
    );
    expect(factory.resolve(config({ [COL_CONF_DOC.GENERATORE]: 'PIANO_PERSONALIZZATO' }))).toBe(
      docPersonalizzato
    );
  });

  it('GSHEET + no flags -> FoglioGenerico', () => {
    const factory = new DocumentStrategyFactory(
      docGenerico,
      foglioGenerico,
      docPersonalizzato,
      docTabelle,
      sheetMaterie,
      sheetPermessi
    );
    expect(factory.resolve(config({ [COL_CONF_DOC.FORMATO]: 'GSHEET' }))).toBe(foglioGenerico);
  });

  it('GSHEET + aggiungiMaterie=true -> SheetMaterie (no ACL)', () => {
    const factory = new DocumentStrategyFactory(
      docGenerico,
      foglioGenerico,
      docPersonalizzato,
      docTabelle,
      sheetMaterie,
      sheetPermessi
    );
    expect(
      factory.resolve(
        config({
          [COL_CONF_DOC.FORMATO]: 'GSHEET',
          [COL_CONF_DOC.PARAMETRI]: JSON.stringify({ aggiungiMaterie: true })
        })
      )
    ).toBe(sheetMaterie);
  });

  it('GSHEET + aggiungiMaterieConPermessi=true -> SheetMaterieConPermessi', () => {
    const factory = new DocumentStrategyFactory(
      docGenerico,
      foglioGenerico,
      docPersonalizzato,
      docTabelle,
      sheetMaterie,
      sheetPermessi
    );
    expect(
      factory.resolve(
        config({
          [COL_CONF_DOC.FORMATO]: 'GSHEET',
          [COL_CONF_DOC.PARAMETRI]: JSON.stringify({ aggiungiMaterieConPermessi: true })
        })
      )
    ).toBe(sheetPermessi);
  });

  it('throws when the required optional strategy was never wired (off-GAS)', () => {
    const factory = new DocumentStrategyFactory(docGenerico, foglioGenerico, docPersonalizzato);
    expect(() =>
      factory.resolve(config({ [COL_CONF_DOC.PARAMETRI]: JSON.stringify({ tabelleImportate: true }) }))
    ).toThrow('DOCUMENTO_CON_TABELLE_IMPORTATE');
    expect(() => factory.resolve(config({ [COL_CONF_DOC.FORMATO]: 'GSHEET' }))).not.toThrow();
    expect(() =>
      factory.resolve(
        config({
          [COL_CONF_DOC.FORMATO]: 'GSHEET',
          [COL_CONF_DOC.PARAMETRI]: JSON.stringify({ aggiungiMaterie: true })
        })
      )
    ).toThrow('SHEET_CON_MATERIE');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest --config jest.config.cjs test/unit/application/factories/document-strategy-factory.test.ts`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement the factory**

```ts
// src/application/factories/DocumentStrategyFactory.ts
import type { GeneratorStrategy } from '../strategies/GeneratorStrategy';
import type { DocumentoGenericoGeneratorStrategy } from '../strategies/DocumentoGenericoGeneratorStrategy';
import type { FoglioGenericoGeneratorStrategy } from '../strategies/FoglioGenericoGeneratorStrategy';
import type { DocPersonalizzatoGeneratorStrategy } from '../strategies/DocPersonalizzatoGeneratorStrategy';
import type { DocumentoConTabelleImportateGeneratorStrategy } from '../strategies/DocumentoConTabelleImportateGeneratorStrategy';
import type { SheetMaterieGeneratorStrategy } from '../strategies/SheetMaterieGeneratorStrategy';
import type { SheetMaterieConPermessiGeneratorStrategy } from '../strategies/SheetMaterieConPermessiGeneratorStrategy';
import type { ConfigurazioneDocumento } from '../../domain/entities/ConfigurazioneDocumento';
import { FormatoOutput, GeneratoreAxis } from '../../domain/value-objects/enums';
import { PipelineError } from '../../domain/errors/DomainError';

/**
 * Replaces the old GENERATORE-keyed strategyRegistry Map (spec §5): the base
 * engine is chosen from FORMATO, PARAMETRI.tabelleImportate/aggiungiMaterie/
 * aggiungiMaterieConPermessi pick the wrapper (the last two are mutually
 * exclusive, enforced by ConfigurazioneDocumento's constructor validation —
 * Task 1 — so resolve() never has to arbitrate between them). PIANO_PERSONALIZZATO
 * is special-cased ahead of the generic GDOC branch to keep the
 * {{piano.campo}} alias merge working — see "Judgment Calls" in the plan doc.
 * docTabelle/sheetMaterie/sheetPermessi are optional because their real
 * dependencies (SpreadsheetService/DocumentService) are GAS-only and
 * Bootstrap.ts skips them off-GAS, mirroring the old registry's conditional
 * `.set(...)` calls.
 */
export class DocumentStrategyFactory {
  constructor(
    private readonly docGenerico: DocumentoGenericoGeneratorStrategy,
    private readonly foglioGenerico: FoglioGenericoGeneratorStrategy,
    private readonly docPersonalizzato: DocPersonalizzatoGeneratorStrategy,
    private readonly docTabelle?: DocumentoConTabelleImportateGeneratorStrategy,
    private readonly sheetMaterie?: SheetMaterieGeneratorStrategy,
    private readonly sheetPermessi?: SheetMaterieConPermessiGeneratorStrategy
  ) {}

  resolve(config: ConfigurazioneDocumento): GeneratorStrategy {
    const parametri = config.getParametri();
    if (config.formato === FormatoOutput.GSHEET) {
      if (parametri.aggiungiMaterieConPermessi) {
        if (this.sheetPermessi === undefined) {
          throw new PipelineError('SHEET_CON_MATERIE_E_PERMESSI non disponibile in questo ambiente');
        }
        return this.sheetPermessi;
      }
      if (parametri.aggiungiMaterie) {
        if (this.sheetMaterie === undefined) {
          throw new PipelineError('SHEET_CON_MATERIE non disponibile in questo ambiente');
        }
        return this.sheetMaterie;
      }
      return this.foglioGenerico;
    }
    if (config.generatore === GeneratoreAxis.PIANO_PERSONALIZZATO) return this.docPersonalizzato;
    if (parametri.tabelleImportate === true) {
      if (this.docTabelle === undefined) {
        throw new PipelineError('DOCUMENTO_CON_TABELLE_IMPORTATE non disponibile in questo ambiente');
      }
      return this.docTabelle;
    }
    return this.docGenerico;
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx jest --config jest.config.cjs test/unit/application/factories/document-strategy-factory.test.ts`
Expected: PASS.

- [ ] **Step 5: Re-key `RenderTemplateStep` onto the factory**

In `src/application/pipelines/documentSteps.ts`, replace the `RenderTemplateStep` class:

```ts
export class RenderTemplateStep extends Step {
  constructor(
    logger: LoggerService,
    private readonly strategies: DocumentStrategyFactory
  ) {
    super('RenderTemplate', logger, {
      shouldExecuteCondition: generateGate,
      requiredKeys: ['newFileId']
    });
  }
  protected _executeLogic(ctx: PipelineContext): void {
    const strategy = this.strategies.resolve(confDoc(ctx));
    strategy.render(ctx.get<string>('newFileId')!, cdu(ctx), confDoc(ctx));
  }

  protected override _getLogDetails(ctx: PipelineContext): string {
    return confDoc(ctx).generatore;
  }
}
```

Remove the now-unused `GeneratorStrategy` type import at the top of the file and add `import type { DocumentStrategyFactory } from '../factories/DocumentStrategyFactory';`. Find and update the matching `RenderTemplateStep` unit test (`grep -rl "new RenderTemplateStep" test/unit`) to construct it with a `DocumentStrategyFactory`-shaped stub (`{ resolve: () => stubStrategy }`) instead of a `Map`.

- [ ] **Step 6: Re-key `DocumentGenerationService` and its pipeline wiring**

In `src/application/services/DocumentGenerationService.ts`:
- Replace `strategyRegistry: Map<string, GeneratorStrategy>;` with `strategyFactory: DocumentStrategyFactory;` in `DocumentGenerationDeps` and the matching private field/constructor assignment.
- Delete the three occurrences of:
  ```ts
  if (!this.strategyRegistry.has(config.generatore)) {
    throw new PipelineError(`GENERATORE non registrato: ${config.generatore}`);
  }
  ```
  (in `generateForClasseWithRecipe`, `generateForDipartimento`, `generateForAlunnoWithRecipe`) — `ConfigurazioneDocumento.fromData(row)` on the line just above each already throws `ConfigurationError` for an invalid `GENERATORE` (Task 1), so this check is now dead weight.
- In `buildPipeline`, change `new RenderTemplateStep(this.logger, this.strategyRegistry)` to `new RenderTemplateStep(this.logger, this.strategyFactory)`.
- Remove the now-unused `GeneratorStrategy` import if nothing else in the file references it.

Update `test/unit/application/document-generation-service.test.ts`'s wiring helper(s) (`grep -n "strategyRegistry" test/unit/application/document-generation-service.test.ts`) to pass a `strategyFactory: { resolve: () => stubStrategy }` instead of a `Map`.

- [ ] **Step 7: Delete `VerbaleGeneratorStrategy` and rewire Bootstrap**

```bash
rm src/application/strategies/VerbaleGeneratorStrategy.ts
find test -iname "*verbale-generator-strategy*" -delete
```

In `src/config/Bootstrap.ts`:
- Remove `import { VerbaleGeneratorStrategy } from '../application/strategies/VerbaleGeneratorStrategy';`.
- Keep the `import { SheetMaterieGeneratorStrategy } from '../application/strategies/SheetMaterieGeneratorStrategy';` — it is now wired directly into the factory as the `aggiungiMaterie` (no-ACL) strategy (per the user's decision to split `materiePermessi`, see "Judgment Calls" above); it is no longer only reachable as `SheetMaterieConPermessiGeneratorStrategy`'s superclass.
- Replace the `c.register('strategyRegistry', ...)` block with:

```ts
c.register('strategyFactory', (container) => {
  const docGenerico = new DocumentoGenericoGeneratorStrategy(deps.templates);
  const foglioGenerico = new FoglioGenericoGeneratorStrategy(deps.templates);
  const docPersonalizzato = new DocPersonalizzatoGeneratorStrategy(deps.templates);
  let docTabelle: DocumentoConTabelleImportateGeneratorStrategy | undefined;
  let sheetMaterie: SheetMaterieGeneratorStrategy | undefined;
  let sheetPermessi: SheetMaterieConPermessiGeneratorStrategy | undefined;
  if (deps.spreadsheets !== undefined) {
    const materie = container.get<MateriaRepository>('materie');
    sheetMaterie = new SheetMaterieGeneratorStrategy(deps.spreadsheets, materie, deps.templates);
    sheetPermessi = new SheetMaterieConPermessiGeneratorStrategy(
      deps.spreadsheets,
      materie,
      deps.templates,
      container.get<RisolutoreRuoliService>('risolutoreRuoli')
    );
    if (deps.documents !== undefined) {
      docTabelle = new DocumentoConTabelleImportateGeneratorStrategy(
        deps.templates,
        deps.spreadsheets,
        new DocumentTableFacade(deps.documents),
        logger
      );
    }
  }
  return new DocumentStrategyFactory(
    docGenerico,
    foglioGenerico,
    docPersonalizzato,
    docTabelle,
    sheetMaterie,
    sheetPermessi
  );
});
```

Add `import { DocumentStrategyFactory } from '../application/factories/DocumentStrategyFactory';`. In the `documentGenerationService` registration, replace `strategyRegistry: container.get<Map<string, GeneratorStrategy>>('strategyRegistry'),` with `strategyFactory: container.get<DocumentStrategyFactory>('strategyFactory'),`.

- [ ] **Step 8: Run affected suites**

Run: `npx jest --config jest.config.cjs test/unit/application/factories test/unit/application/pipelines test/unit/application/document-generation-service.test.ts test/unit/config`
Expected: PASS. Fix any remaining fixture referencing `strategyRegistry`, `VerbaleGeneratorStrategy`, or `GENERATORE=VERBALE_CDC`/`SHEET_CON_MATERIE`/`DOCUMENTO_GENERICO` (old strategy-name values) by replacing with the appropriate `GeneratoreAxis` value.

- [ ] **Step 9: Commit**

```bash
git add src/application/factories/DocumentStrategyFactory.ts src/application/pipelines/documentSteps.ts src/application/services/DocumentGenerationService.ts src/config/Bootstrap.ts test
git rm src/application/strategies/VerbaleGeneratorStrategy.ts
git commit -m "feat(documents): DocumentStrategyFactory replaces GENERATORE-keyed strategyRegistry, delete VerbaleGeneratorStrategy"
```

---

### Task 3: Re-key `documentSteps.ts` axis-derived logic off `TIPO`

**Files:**
- Modify: `src/application/pipelines/documentSteps.ts` (`sottotipo()`, `CheckDuplicatesStep`)
- Test: whichever file covers `CheckDuplicatesStep`/`sottotipo` (`grep -rl "sottotipo\|CheckDuplicatesStep" test/unit/application/pipelines`)

**Interfaces:**
- Consumes: `ConfigurazioneDocumento.generatore` (Task 1, now `GeneratoreAxis`).
- Produces: same `sottotipo()`/dedup-`tipi` behavior, now keyed on `GENERATORE` instead of the old `TIPO` string literals `'DOCUMENTO_DOCENTE_CLASSE_MATERIA'`/`'DOCUMENTO_CLASSE_MATERIA'`.

- [ ] **Step 1: Write failing test**

Find the existing test exercising `sottotipo()` for the docente/materia and classe/materia cases (search for `DOCUMENTO_DOCENTE_CLASSE_MATERIA` or `SOTTOTIPO` inside `test/unit/application/pipelines/`). Add/adjust cases asserting the SOTTOTIPO composition now triggers off `GENERATORE=CLASSE_DOCENTE_MATERIA`/`GENERATORE=CLASSE_MATERIA` with an arbitrary, non-matching `TIPO` value (e.g. `TIPO='PROGRAMMA_SVOLTO'`), proving `TIPO` no longer drives it:

```ts
it('composes materia::docente SOTTOTIPO from GENERATORE=CLASSE_DOCENTE_MATERIA regardless of TIPO', () => {
  const ctx = buildContextWith({
    config: { [COL_CONF_DOC.TIPO]: 'QUALSIASI_ETICHETTA', [COL_CONF_DOC.GENERATORE]: 'CLASSE_DOCENTE_MATERIA' },
    cdu: { focus: { materia: { sigla: 'MATE' }, docente: { email: 'a@b.it' } } }
  });
  // ... invoke the step/function under test and assert SOTTOTIPO === 'MATE::a@b.it'
});
```//: adapt to this suite's existing `buildContextWith`-style helper — inspect the file's current helpers before writing this, they are the authoritative shape.

- [ ] **Step 2: Run to verify it fails**

Run the matching test file. Expected: FAIL (still keyed on `TIPO`, so a mismatched `TIPO` yields `''` instead of the composed SOTTOTIPO).

- [ ] **Step 3: Re-key `sottotipo()` and the duplicate-check `tipi` array**

```ts
function sottotipo(ctx: PipelineContext): string {
  if (isPianoPersonalizzato(ctx)) return cdu(ctx).focus.piano?.tipo ?? '';
  if (confDoc(ctx).generatore === GeneratoreAxis.CLASSE_DOCENTE_MATERIA) {
    const materiaId = cdu(ctx).focus.materia?.sigla ?? '';
    const docenteEmail = cdu(ctx).focus.docente?.email ?? '';
    return `${materiaId}::${docenteEmail}`;
  }
  if (confDoc(ctx).generatore === GeneratoreAxis.CLASSE_MATERIA) {
    return cdu(ctx).focus.materia?.sigla ?? '';
  }
  return '';
}
```

In `CheckDuplicatesStep._executeLogic`, the `tipi` array currently guards a legacy-checkpoint-compat alias (`DOCUMENTO_DOCENTE_MATERIA`) for the duplicate-identity `TIPO` component — that alias was about the **`TIPO` column value written into `LOG_DOCS.TIPO`**, which is unaffected by this migration (TIPO stays free-form per spec §2.5), so leave the `tipi`/`idGen` duplicate-identity logic untouched. Only `sottotipo()` (used for the `SOTTOTIPO` component of that same identity) changes. Import `GeneratoreAxis` from `'../../domain/value-objects/enums'` at the top of the file (already importing `FormatoOutput` from there).

- [ ] **Step 4: Run to verify it passes**

Run the same test file. Expected: PASS.

- [ ] **Step 5: Run the full pipeline test suite**

Run: `npx jest --config jest.config.cjs test/unit/application/pipelines`
Expected: PASS — fix any fixture still relying on `TIPO=DOCUMENTO_DOCENTE_CLASSE_MATERIA`/`DOCUMENTO_CLASSE_MATERIA` driving `SOTTOTIPO` by adding the matching `GENERATORE` value to that fixture.

- [ ] **Step 6: Commit**

```bash
git add src/application/pipelines/documentSteps.ts test/unit/application/pipelines
git commit -m "refactor(documents): SOTTOTIPO composition keyed on GENERATORE, not TIPO"
```

---

### Task 4: `RisolutoreRuoliService` — `DOCENTE_CORRENTE`, `DOCENTI_DIPARTIMENTO`, `CAPO_DIPART`

**Files:**
- Modify: `src/application/services/RisolutoreRuoliService.ts`
- Test: `test/unit/application/risolutore-ruoli-service.test.ts` (or wherever this service is tested — `find test/unit -iname "*risolutore-ruoli*"`)

**Interfaces:**
- Produces: three new registry entries in `buildRegistro()` — `DOCENTE_CORRENTE`, `DOCENTI_DIPARTIMENTO`, `CAPO_DIPART` (alias of the existing `CAPO_DIPARTIMENTO`, extended per spec §6.2.1).
- Consumes: `ctx.cdu.focus.docente` (already populated by `DocenteClasseMateriaFocusProvider` today, and by the new `DocenteClasseFocusProvider`/`DocenteAggregatoFocusProvider` in Tasks 5–6), `ctx.cdu.focus.dipartimento` (populated by `DipartimentoProvider`).

- [ ] **Step 1: Write failing tests**

```ts
it('DOCENTE_CORRENTE resolves cdu.focus.docente.email', () => {
  const cdu = baseCdu({ focus: { docente: { email: 'prof@scuola.it', nomeCompleto: 'Prof', genere: 'M' } } });
  expect(service.risolvi('DOCENTE_CORRENTE', cdu).map((e) => e.value)).toEqual(['prof@scuola.it']);
});

it('DOCENTE_CORRENTE is empty when focus.docente is absent', () => {
  expect(service.risolvi('DOCENTE_CORRENTE', baseCdu({})).length).toBe(0);
});

it('DOCENTI_DIPARTIMENTO resolves cdu.focus.dipartimento.docenti', () => {
  const cdu = baseCdu({
    focus: { dipartimento: { docenti: [{ email: 'a@x.it' }, { email: 'b@x.it' }] } }
  });
  expect(service.risolvi('DOCENTI_DIPARTIMENTO', cdu).map((e) => e.value).sort()).toEqual(['a@x.it', 'b@x.it']);
});

it('CAPO_DIPART reads focus.dipartimento.capo.email directly when populated', () => {
  const cdu = baseCdu({ focus: { dipartimento: { capo: { email: 'capo@x.it' } } } });
  expect(service.risolvi('CAPO_DIPART', cdu).map((e) => e.value)).toEqual(['capo@x.it']);
});

it('CAPO_DIPART falls back to findByMateria(materiaCorrente) when focus.dipartimento is absent', () => {
  // mirror the existing 'resolves CAPO_DIPARTIMENTO via findByMateria' test fixture/mocks
});
```

Adapt `baseCdu(...)` to this suite's existing CDU-builder helper — inspect the file first.

- [ ] **Step 2: Run to verify it fails**

Run the matching test file. Expected: FAIL — `Ruolo non registrato: DOCENTE_CORRENTE` / `DOCENTI_DIPARTIMENTO` / `CAPO_DIPART`.

- [ ] **Step 3: Implement**

In `buildRegistro()`, add:

```ts
['DOCENTE_CORRENTE', (c) => this.docenteCorrente(c)],
['DOCENTI_DIPARTIMENTO', (c) => this.docentiDipartimento(c)],
['CAPO_DIPART', (c) => this.emailsOf(this.capoDipart(c))],
```

New private methods (near `capoDipartimento`):

```ts
private docenteCorrente(ctx: RoleContext): Email[] {
  const email = ctx.cdu.focus.docente?.email;
  return email !== undefined && email.trim() !== '' ? [Email.of(email)] : [];
}

private docentiDipartimento(ctx: RoleContext): Email[] {
  return (ctx.cdu.focus.dipartimento?.docenti ?? []).flatMap((d) =>
    d.email.trim() === '' ? [] : [Email.of(d.email)]
  );
}

/** CAPO_DIPART (spec §6.2.1): prefers the already-resolved focus.dipartimento.capo, falls back to the existing materia-driven lookup (capoDipartimento) shared with CAPO_DIPARTIMENTO. */
private capoDipart(ctx: RoleContext): Docente[] {
  const focusCapoEmail = ctx.cdu.focus.dipartimento?.capo?.email;
  if (focusCapoEmail !== undefined && focusCapoEmail.trim() !== '') {
    const docente = this.docenti.findById(focusCapoEmail);
    return docente === null ? [] : [docente];
  }
  return this.capoDipartimento(ctx);
}
```

`CduDipartimentoFocus.capo` is already typed `PersonVM | null` and `PersonVM` already has an `email` field (per `Cdu.ts` — confirm with `grep -n "email" src/application/context-engine/mappers/personVmMapper.ts` if the field name differs from `email`).

- [ ] **Step 4: Run to verify it passes**

Run the matching test file. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/application/services/RisolutoreRuoliService.ts test/unit/application/risolutore-ruoli-service.test.ts
git commit -m "feat(roles): DOCENTE_CORRENTE, DOCENTI_DIPARTIMENTO, CAPO_DIPART role strategies"
```

---

### Task 5: `CLASSE_DOCENTE` axis — `DocenteClasseFocusProvider` + recipe + service method

**Files:**
- Create: `src/application/context-engine/providers/DocenteClasseFocusProvider.ts`
- Modify: `src/application/context-engine/Recipe.ts` (new `CLASSE_DOCENTE` recipe)
- Modify: `src/application/context-engine/ContextEngineFactory.ts` (register provider)
- Modify: `src/application/services/DocumentGenerationService.ts` (`generateForClasseDocente`)
- Test: `test/unit/application/context-engine/providers/docente-classe-focus-provider.test.ts` (new), `test/unit/application/document-generation-service.test.ts`

**Interfaces:**
- Consumes: `cdu.focus.classe.consiglioDiClasse` (already populated by the `consiglio` provider), `BuildParams.docenteCorrente`.
- Produces: provider token `docenteClasseFocus`; sets `cdu.focus.docente` (the teacher's `PersonVM`, no `materia` narrowing — unlike `DocenteClasseMateriaFocusProvider`); `DocumentGenerationService.generateForClasseDocente(target: ClasseId, docenteEmail: string, confDocId: string, jobId?: string): DocumentGenerationResult`.

- [ ] **Step 1: Write failing provider test**

```ts
// test/unit/application/context-engine/providers/docente-classe-focus-provider.test.ts
import { DocenteClasseFocusProvider } from '../../../../../src/application/context-engine/providers/DocenteClasseFocusProvider';
import { PipelineError } from '../../../../../src/domain/errors/DomainError';
import type { Cdu } from '../../../../../src/application/context-engine/Cdu';
import type { BuildParams } from '../../../../../src/application/context-engine/Recipe';

function cduWithConsiglio(consiglio: Array<{ email: string }>): Cdu {
  return {
    focus: {
      classe: {
        consiglioDiClasse: consiglio.map((d) => ({
          anagrafica: { email: d.email, nomeCompleto: d.email, genere: 'M' },
          materie: [],
          materieDescrizione: '',
          materieSigle: '',
          ruoli: { isCoordinatore: false, isTutorAsl: false, isTutorOrientamento: false, descrizione: [] },
          stato: { isSupplente: false, sostituisce: null },
          tipoArticolazione: null,
          gruppoNome: null,
          isITP: false,
          flags: { isNotLast: true }
        }))
      }
    }
  } as unknown as Cdu;
}

describe('DocenteClasseFocusProvider', () => {
  it('sets focus.docente to the matching council member', () => {
    const cdu = cduWithConsiglio([{ email: 'rossi@x.it' }, { email: 'bianchi@x.it' }]);
    new DocenteClasseFocusProvider().provide(cdu, { docenteCorrente: 'bianchi@x.it' } as BuildParams);
    expect(cdu.focus.docente?.email).toBe('bianchi@x.it');
  });

  it('throws PipelineError when the teacher is not on the council', () => {
    const cdu = cduWithConsiglio([{ email: 'rossi@x.it' }]);
    expect(() =>
      new DocenteClasseFocusProvider().provide(cdu, { docenteCorrente: 'assente@x.it' } as BuildParams)
    ).toThrow(PipelineError);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest --config jest.config.cjs test/unit/application/context-engine/providers/docente-classe-focus-provider.test.ts`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement the provider**

```ts
// src/application/context-engine/providers/DocenteClasseFocusProvider.ts
import type { ContextProvider } from '../ContextProvider';
import type { Cdu } from '../Cdu';
import type { BuildParams } from '../Recipe';
import { PipelineError } from '../../../domain/errors/DomainError';

/**
 * Resolves `focus.docente` for the CLASSE_DOCENTE axis: the whole teacher, no
 * single-subject narrowing (unlike DocenteClasseMateriaFocusProvider) — the
 * axis is "one document per (classe, docente) pair", covering every subject
 * that teacher holds in this class council.
 */
export class DocenteClasseFocusProvider implements ContextProvider {
  provide(cdu: Cdu, params: BuildParams): void {
    const cdc = cdu.focus.classe?.consiglioDiClasse ?? [];
    const docenteCdc = cdc.find((d) => d.anagrafica.email === params.docenteCorrente);
    if (docenteCdc === undefined) {
      throw new PipelineError(
        `CLASSE_DOCENTE: docente ${params.docenteCorrente ?? ''} non trovato nel consiglio di classe`
      );
    }
    cdu.focus.docente = docenteCdc.anagrafica;
  }
}
```

- [ ] **Step 4: Register recipe + provider**

In `Recipe.ts`, add after `CLASSE_MATERIA`:

```ts
CLASSE_DOCENTE: [
  'school',
  'class',
  'students',
  'tutor',
  'consiglio',
  'materie',
  'esame',
  'progetti',
  'partner',
  'rappresentanti',
  'statistiche',
  'storicoClasse',
  'pianiPersClasse',
  'docenteClasseFocus'
],
```

(mirrors `CLASSE_DOCENTE_MATERIA` minus the materia-narrowing token, so the class-wide CDU is unchanged — only `focus.docente` is added). This axis does **not** need the `SOLO_SUPPLENTI` `gestioneSupplenti` default the `recipe()` function applies to `CLASSE_MATERIA`/`CLASSE_DOCENTE_MATERIA` (no per-subject ACL routing decision here) — leave the `recipeDefaults` ternary in `recipe()` untouched, it already only special-cases those two names.

In `ContextEngineFactory.ts`, add the import and registration next to `docenteClasseMateriaFocus`:

```ts
import { DocenteClasseFocusProvider } from './providers/DocenteClasseFocusProvider';
// ...
.registerProvider('docenteClasseFocus', new DocenteClasseFocusProvider())
```

- [ ] **Step 5: Run to verify provider test passes**

Run: `npx jest --config jest.config.cjs test/unit/application/context-engine/providers/docente-classe-focus-provider.test.ts`
Expected: PASS.

- [ ] **Step 6: Add `generateForClasseDocente` — write failing service test**

In `test/unit/application/document-generation-service.test.ts`, mirror the existing `generateForDocenteClasseMateria`/`generateForClasseMateria` tests:

```ts
it('generateForClasseDocente builds a CDU with focus.docente set and no materia narrowing', () => {
  // wire like the existing generateForClasseMateria test, assert:
  // cdu.focus.docente?.email === docenteEmail
  // cdu.focus.classe is still fully populated (consiglio, materie, etc.)
});
```

- [ ] **Step 7: Run to verify it fails**

Run: `npx jest --config jest.config.cjs test/unit/application/document-generation-service.test.ts -t "generateForClasseDocente"`
Expected: FAIL — method missing.

- [ ] **Step 8: Implement**

In `DocumentGenerationService.ts`, add next to `generateForClasseMateria`:

```ts
/** One document per (classe, docente) pair — every subject that teacher holds in this class. */
generateForClasseDocente(
  target: ClasseId,
  docenteEmail: string,
  confDocId: string,
  jobId?: string
): DocumentGenerationResult {
  return this.generateForClasseWithRecipe(
    target,
    confDocId,
    'CLASSE_DOCENTE',
    { docenteCorrente: docenteEmail },
    jobId
  );
}
```

- [ ] **Step 9: Run to verify it passes**

Run: `npx jest --config jest.config.cjs test/unit/application/document-generation-service.test.ts`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add src/application/context-engine/providers/DocenteClasseFocusProvider.ts src/application/context-engine/Recipe.ts src/application/context-engine/ContextEngineFactory.ts src/application/services/DocumentGenerationService.ts test
git commit -m "feat(cdu): CLASSE_DOCENTE axis — DocenteClasseFocusProvider, recipe, generateForClasseDocente"
```

---

### Task 6: `DOCENTE` aggregate axis — `DocenteAggregatoFocusProvider` + recipe + service method

**Files:**
- Modify: `src/application/context-engine/Cdu.ts` (`focus.docente` widened)
- Create: `src/application/context-engine/providers/DocenteAggregatoFocusProvider.ts`
- Modify: `src/application/context-engine/Recipe.ts` (new `DOCENTE_AGGREGATO` recipe)
- Modify: `src/application/context-engine/ContextEngineFactory.ts` (register provider — needs `IClasseRepository`, `IMateriaRepository`, `ITeachingAssignmentResolver`, already available in `ContextEngineDependencies`)
- Modify: `src/application/services/DocumentGenerationService.ts` (`generateForDocente` — classe-independent, mirrors `generateForDipartimento`'s shape)
- Test: `test/unit/application/context-engine/providers/docente-aggregato-focus-provider.test.ts` (new), `test/unit/application/document-generation-service.test.ts`

**Interfaces:**
- Consumes: `BuildParams.docenteCorrente`, `BuildParams.classiCompetenza` (every class id the teacher teaches in — the caller, `DocumentGenerationService.generateForDocente`, supplies this; it is **not** auto-derived by the provider), `ITeachingAssignmentResolver.resolveConsiglio`, `IMateriaRepository`.
- Produces: provider token `docenteAggregatoFocus`; `cdu.focus.docente: PersonVM & { cattedre: CattedraVM[] }`; `DocumentGenerationService.generateForDocente(docenteEmail: string, classiCompetenza: string[], confDocId: string, jobId?: string): DocumentGenerationResult`.

This axis has no single `focus.classe` (a teacher's aggregate document spans many classes) so it does **not** reuse `generateForClasseWithRecipe` — same reasoning `generateForDipartimento` already used to justify its own standalone method instead of reusing that helper.

- [ ] **Step 1: Widen `Cdu.ts`'s `focus.docente` type**

In `src/application/context-engine/Cdu.ts`, change:

```ts
focus: {
  classe?: CduClasse;
  alunno?: CduAlunno;
  dipartimento?: CduDipartimentoFocus;
  carenza?: CduCarenzaFocus;
  piano?: CduPianoFocus;
  docente?: PersonVM & { cattedre?: CattedraVM[] };
  materia?: SubjectVM;
  classiMateria?: { docenti: PersonVM[] };
};
```

(`CattedraVM` is already imported in this file via... check: it currently is NOT imported in `Cdu.ts` — add `import type { CattedraVM } from './Cdu';`? No — `CattedraVM` is declared IN `Cdu.ts` itself (see the `CduDestinatario` section), so no new import is needed, just reference it.)

- [ ] **Step 2: Write failing provider test**

```ts
// test/unit/application/context-engine/providers/docente-aggregato-focus-provider.test.ts
import { DocenteAggregatoFocusProvider } from '../../../../../src/application/context-engine/providers/DocenteAggregatoFocusProvider';
import { ClasseId } from '../../../../../src/domain/value-objects/ClasseId';
import { MateriaId } from '../../../../../src/domain/value-objects/MateriaId';
// build fake IClasseRepository/IMateriaRepository/ITeachingAssignmentResolver mocks,
// mirroring the mocking style already used in test/unit/application/context-engine/providers/consiglio-classe-provider.test.ts
// (inspect that file first for the exact TeachingAssignment/Classe fixture shape)

describe('DocenteAggregatoFocusProvider', () => {
  it('aggregates cattedre across every class in params.classiCompetenza for the target docente', () => {
    // Given: classe '5A' where docente teaches MATE, classe '1F' where the same
    // docente teaches FISI; resolveConsiglio returns assignments filtered to
    // docenteEffettivo.email === params.docenteCorrente per class.
    // Then: cdu.focus.docente.email === docenteCorrente,
    //       cdu.focus.docente.cattedre has 2 entries (one per class), each with
    //       its own materie list.
  });

  it('throws PipelineError when the docente has no assignment in any listed class', () => {
    // resolveConsiglio returns no matching assignment in any classiCompetenza entry
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `npx jest --config jest.config.cjs test/unit/application/context-engine/providers/docente-aggregato-focus-provider.test.ts`
Expected: FAIL — module doesn't exist.

- [ ] **Step 4: Implement the provider**

```ts
// src/application/context-engine/providers/DocenteAggregatoFocusProvider.ts
import type { ContextProvider } from '../ContextProvider';
import type { Cdu, CattedraVM } from '../Cdu';
import type { BuildParams } from '../Recipe';
import type { IClasseRepository } from '../../../domain/repositories/IClasseRepository';
import type { IMateriaRepository } from '../../../domain/repositories/IMateriaRepository';
import type { ITeachingAssignmentResolver } from '../../ports/ITeachingAssignmentResolver';
import { ClasseId } from '../../../domain/value-objects/ClasseId';
import { PipelineError } from '../../../domain/errors/DomainError';
import { buildSubjectVm } from '../mappers/subjectVmMapper';

/**
 * DOCENTE axis (spec §4.1.2): one aggregate document per teacher, scoped to
 * `focus.docente` with subjects grouped per class across every class they
 * teach in (`params.classiCompetenza`, supplied by
 * `DocumentGenerationService.generateForDocente` — this provider does not
 * enumerate the teacher's classes itself). Deliberately independent of
 * `focus.classe`/the `consiglio` token: unlike every other class-scoped
 * recipe, DOCENTE_AGGREGATO has no single class in focus.
 */
export class DocenteAggregatoFocusProvider implements ContextProvider {
  constructor(
    private readonly classi: IClasseRepository,
    private readonly materie: IMateriaRepository,
    private readonly teachingAssignments: ITeachingAssignmentResolver
  ) {}

  provide(cdu: Cdu, params: BuildParams): void {
    const docenteEmail = params.docenteCorrente;
    if (docenteEmail === null || docenteEmail === undefined || docenteEmail.trim() === '') {
      throw new PipelineError('DOCENTE: docenteCorrente mancante');
    }
    const classiCompetenza = params.classiCompetenza ?? [];
    const cattedre: CattedraVM[] = [];
    let anagrafica: Cdu['focus']['docente'] | undefined;

    for (const classeIdValue of classiCompetenza) {
      const classe = this.classi.findById(ClasseId.of(classeIdValue));
      if (classe === null) continue;
      const assignments = this.teachingAssignments
        .resolveConsiglio(classe, params.now, { includeReligioneAlt: true })
        .filter((a) => a.docenteEffettivo.email.value === docenteEmail);
      if (assignments.length === 0) continue;
      if (anagrafica === undefined) {
        const first = assignments[0]!.docenteEffettivo;
        anagrafica = {
          nomeCompleto: `${first.nome} ${first.cognome}`.trim(),
          email: first.email.value,
          genere: first.genere
        };
      }
      const materie = assignments
        .map((a) =>
          buildSubjectVm(this.materie, {
            materia: a.slot.materia.value,
            kind: a.slot.kind,
            specifica: a.slot.specifica
          })
        )
        .filter((m): m is NonNullable<typeof m> => m !== null);
      cattedre.push({ classeNome: classe.nome, anno: classe.anno.value, sezione: classe.sezione, materie });
    }

    if (anagrafica === undefined) {
      throw new PipelineError(`DOCENTE: nessuna cattedra trovata per ${docenteEmail}`);
    }
    cdu.focus.docente = { ...anagrafica, cattedre };
  }
}
```

Before finalizing this step, verify the exact export name/signature for building a `SubjectVM` from a teaching-slot shape — grep `grep -n "export function" src/application/context-engine/mappers/subjectVmMapper.ts` and `grep -n "materiaVmFromSlot" src/application/pipelines/emailSteps.ts` (used by the existing `buildCattedre` in Task-context reading above) — use whichever helper is actually exported (`materiaVmFromSlot` was seen imported in `emailSteps.ts`; if it lives in a module reachable from `context-engine/providers/`, prefer reusing it verbatim over calling `buildSubjectVm` if that name doesn't exist) and adjust the snippet's import/call accordingly. Also verify `Docente.genere`'s type against `PersonVM.genere` (both should be the `Genere` enum — confirm with `grep -n "genere" src/application/context-engine/mappers/personVmMapper.ts`) so the anagrafica object satisfies `PersonVM` without a cast.

- [ ] **Step 5: Register recipe + provider**

In `Recipe.ts`:

```ts
DOCENTE_AGGREGATO: ['school', 'docenteAggregatoFocus'],
```

In `ContextEngineFactory.ts`:

```ts
import { DocenteAggregatoFocusProvider } from './providers/DocenteAggregatoFocusProvider';
// ...
.registerProvider('docenteAggregatoFocus', new DocenteAggregatoFocusProvider(classi, materie, teachingAssignments))
```

- [ ] **Step 6: Run to verify provider test passes**

Run: `npx jest --config jest.config.cjs test/unit/application/context-engine/providers/docente-aggregato-focus-provider.test.ts`
Expected: PASS.

- [ ] **Step 7: Add `generateForDocente` — write failing service test, then implement**

Test mirrors `generateForDipartimento`'s existing test (classe-independent CDU build):

```ts
it('generateForDocente builds a DOCENTE_AGGREGATO CDU scoped to the teacher, not a class', () => {
  // assert cdu.focus.docente.email === docenteEmail, cdu.focus.classe === undefined
});
```

Run: `npx jest --config jest.config.cjs test/unit/application/document-generation-service.test.ts -t "generateForDocente"` — expect FAIL (method missing).

Implement, mirroring `generateForDipartimento`'s structure exactly (same CONF_DOC lookup / `ConfigurazioneDocumento.fromData` / transaction / pipeline-execute / rollback shape — copy that method's body and adapt the `contextBuilder.build` call and result variable names):

```ts
/**
 * One aggregate document per teacher (spec §4.1.2) — DOCENTE_AGGREGATO recipe,
 * tipoTarget 'docente'. No class dimension in focus, so — like
 * generateForDipartimento — this doesn't reuse generateForClasseWithRecipe.
 */
generateForDocente(
  docenteEmail: string,
  classiCompetenza: string[],
  confDocId: string,
  jobId?: string
): DocumentGenerationResult {
  const startedAt = Date.now();
  const row = this.db.table(TABLE.CONF_DOC).find((r) => r[COL_CONF_DOC.ID] === confDocId);
  if (!row) throw new PipelineError(`CONF_DOC ${confDocId} non trovato`);
  const config = ConfigurazioneDocumento.fromData(row);

  const cdu = this.contextBuilder.build(
    {
      target: docenteEmail,
      tipoTarget: 'docente',
      now: this.now,
      idConfigurazione: confDocId,
      tipoOperazione: 'GENERAZIONE_DOCUMENTO',
      classiCompetenza,
      docenteCorrente: docenteEmail
    },
    recipe('DOCENTE_AGGREGATO')
  );

  this.db.beginTransaction();
  let ctx: PipelineContext;
  try {
    ctx = this.getPipeline(jobId).execute({ config: row, confDoc: config, cdu });
  } catch (e) {
    this.db.rollback();
    throw e;
  }

  const critical = ctx.getFlag<string>('criticalError');
  if (critical !== null) {
    this.db.rollback();
    throw new PipelineError(critical);
  }
  this.db.commit();

  return this.resultFromContext(ctx, startedAt);
}
```

`BuildParams.tipoTarget` is currently typed `'classe' | 'alunno' | 'dipartimento'` (`Recipe.ts`) and `CduMeta.parametriInput.tipoTarget` mirrors it (`Cdu.ts`) — both need `'docente'` added to that union as part of this step.

- [ ] **Step 8: Run to verify it passes**

Run: `npx jest --config jest.config.cjs test/unit/application/document-generation-service.test.ts`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/application/context-engine/Cdu.ts src/application/context-engine/providers/DocenteAggregatoFocusProvider.ts src/application/context-engine/Recipe.ts src/application/context-engine/ContextEngineFactory.ts src/application/services/DocumentGenerationService.ts test
git commit -m "feat(cdu): DOCENTE aggregate axis — DocenteAggregatoFocusProvider, recipe, generateForDocente"
```

---

### Task 7: `DocumentBatchService` — re-key dispatch to `GENERATORE`, add `DOCENTE`/`CLASSE_DOCENTE`/`ALUNNO` batch axes

**Files:**
- Modify: `src/application/services/DocumentBatchService.ts`
- Test: `test/unit/application/document-batch-service.test.ts`

**Interfaces:**
- Consumes: `ConfigurazioneDocumento.generatore: GeneratoreAxis` (Task 1); `DocumentGenerationService.generateForClasseDocente`/`generateForDocente` (Tasks 5–6); `IAlunnoRepository.findAttivi()` (already a constructor dependency, used by `generatePiani`).
- Produces: `batchGenerateHandler` dispatches on `config.generatore` for all 8 axes; new `ClasseDocenteBatchTarget`, `DocenteBatchTarget` (`{ docenteEmail: string; classiCompetenza: string[] }`), `AlunnoBatchTarget` (`{ email: string }`) checkpoint types; new `generateClasseDocente`, `generateDocenti`, `generateAlunni` private generator methods.

- [ ] **Step 1: Write failing tests for the dispatch re-key**

In `test/unit/application/document-batch-service.test.ts`, change the existing `wireDocentiClasseMateria`/`wireClassiMateria`/`wireDipartimenti` factories' fixture `CONF_DOC` rows to set `GENERATORE` to the new axis-only values (`CLASSE_DOCENTE_MATERIA`, `CLASSE_MATERIA`, `DIPARTIMENTO`) instead of relying on `TIPO`, and add:

```ts
test('dispatch routes purely on GENERATORE, ignoring an unrelated TIPO label', () => {
  const { service, generated } = wireClassiMateria({ tipoLabel: 'ETICHETTA_LIBERA_QUALSIASI' });
  drain(service.batchGenerateHandler({ confDocId: 'SCHEDA_MATERIA', jobId: 'job_cm' }));
  expect(generated.length).toBeGreaterThan(0); // still dispatches to generateClassiMateria via GENERATORE
});

test('PIANO_PERS TIPO constraint is still enforced independently of GENERATORE', () => {
  // config.tipo !== 'PIANO_PERS' but config.generatore === 'PIANO_PERSONALIZZATO' -> ConfigurationError, per spec §4.1.3
});
```

(Adapt `wireClassiMateria`'s options signature to accept an optional `tipoLabel` override if it doesn't already parametrize `TIPO` — inspect the current factory function first.)

Add two new test blocks for the brand-new axes:

```ts
describe('DocumentBatchService.generateClasseDocente', () => {
  test('emits one target per (classe, docente) pair, not per (classe, docente, materia)', () => {
    // 5A: docente 'bianchi' teaches MATE+FISI -> ONE target {classe:'5A', docenteEmail:'bianchi'}
  });
  test('resume from persisted classeDocenteTargets skips completed work', () => { /* ... */ });
});

describe('DocumentBatchService.generateDocenti', () => {
  test('emits one target per unique docente email across ALL active classes, with classiCompetenza aggregated', () => {
    // docente teaching in 5A and 1F -> ONE target { docenteEmail, classiCompetenza: ['5A','1F'] }
  });
});

describe('DocumentBatchService.generateAlunni', () => {
  test('emits one target per active student, calling generateForAlunno', () => {
    // mirror generateClassi's shape but over this.alunni.findAttivi()
  });
});
```

- [ ] **Step 2: Run to verify these fail**

Run: `npx jest --config jest.config.cjs test/unit/application/document-batch-service.test.ts`
Expected: FAIL — new axes/methods don't exist, and old fixtures still set `TIPO` not `GENERATORE`.

- [ ] **Step 3: Add new checkpoint types**

```ts
export interface ClasseDocenteBatchTarget {
  classe: string;
  docenteEmail: string;
}
export interface DocenteBatchTarget {
  docenteEmail: string;
  classiCompetenza: string[];
}
export interface AlunnoBatchTarget {
  email: string;
}
```

Extend `BatchResumeState`:

```ts
classeDocenteTargets?: ClasseDocenteBatchTarget[];
docenteTargets?: DocenteBatchTarget[];
alunnoTargets?: AlunnoBatchTarget[];
```

- [ ] **Step 4: Re-key `batchGenerateHandler` dispatch**

Replace the whole `TIPO`-branch block with a `GENERATORE`-keyed dispatch. `PIANO_PERS` stays a `TIPO` gate per spec §4.1.3 ("`CONF_DOC.TIPO` MUST be `PIANO_PERS`"), independent of which `GENERATORE` value routes there:

```ts
if (config.tipo === 'PIANO_PERS' && config.generatore !== GeneratoreAxis.PIANO_PERSONALIZZATO) {
  throw new ConfigurationError(
    `CONF_DOC ${confDocId} ha TIPO PIANO_PERS ma GENERATORE ${config.generatore} (atteso PIANO_PERSONALIZZATO)`
  );
}
if (config.generatore === GeneratoreAxis.PIANO_PERSONALIZZATO) {
  if (config.tipo !== 'PIANO_PERS') {
    throw new ConfigurationError(`CONF_DOC ${confDocId} deve avere TIPO PIANO_PERS`);
  }
  return yield* this.generatePiani(config, confDocId, jobId, resume, processed, errori);
}
switch (config.generatore) {
  case GeneratoreAxis.CLASSE_DOCENTE_MATERIA:
    return yield* this.generateDocentiClasseMateria(config, confDocId, jobId, resume, processed, errori);
  case GeneratoreAxis.CLASSE_MATERIA:
    return yield* this.generateClassiMateria(config, confDocId, jobId, resume, processed, errori);
  case GeneratoreAxis.CLASSE_DOCENTE:
    return yield* this.generateClasseDocente(config, confDocId, jobId, resume, processed, errori);
  case GeneratoreAxis.DOCENTE:
    return yield* this.generateDocenti(config, confDocId, jobId, resume, processed, errori);
  case GeneratoreAxis.DIPARTIMENTO:
    return yield* this.generateDipartimenti(confDocId, jobId, resume, processed, errori);
  case GeneratoreAxis.ALUNNO:
    return yield* this.generateAlunni(confDocId, jobId, resume, processed, errori);
  case GeneratoreAxis.CLASSE:
    return yield* this.generateClassi(config, confDocId, jobId, resume, processed, errori);
  default:
    return yield* this.generateClassi(config, confDocId, jobId, resume, processed, errori);
}
```

Delete the old `if (config.tipo === 'DOCUMENTO_DOCENTE_MATERIA') throw ...` legacy-rename guard from `9e085ef` — it guarded a `TIPO` value that no longer drives dispatch at all now that `GENERATORE` does; keep the `docenteMateriaTargets` resume-compat fallback inside `generateDocentiClasseMateria` untouched (that's about resuming an old **checkpoint shape**, unrelated to the dispatch key). Add `import { GeneratoreAxis } from '../../domain/value-objects/enums';` at the top.

- [ ] **Step 5: Implement `generateClasseDocente`**

Mirror `generateClassiMateria` exactly, but dedup key is `${classeId}:${docenteEmail}` (drop `materiaId` from the target and the key) and it calls `this.documenti.generateForClasseDocente(...)`:

```ts
private *generateClasseDocente(
  config: ConfigurazioneDocumento,
  confDocId: string,
  jobId: string,
  resume: BatchResumeState | null,
  processed: string[],
  errori: string[]
): Generator<BatchCheckpoint, BatchResult, void> {
  let targets: ClasseDocenteBatchTarget[];
  if (resume === null) {
    targets = [];
    const seen = new Set<string>();
    const attive = this.classi.filterPerGestioneArticolazione(
      this.classi.findAttive(),
      config.gestioneArticolazione
    );
    for (const classe of attive) {
      const assignments = this.teachingAssignments.resolveConsiglio(classe, this.now, {
        includeReligioneAlt: true
      });
      for (const assignment of assignments) {
        const classeId = classe.id ?? '';
        const docenteEmail = assignment.docenteEffettivo.email.value;
        const key = `${classeId}:${docenteEmail}`;
        if (seen.has(key)) continue;
        seen.add(key);
        targets.push({ classe: classeId, docenteEmail });
      }
    }
  } else {
    if (resume.classeDocenteTargets === undefined) {
      throw new ConfigurationError(
        `Stato di ripresa ${confDocId} privo dei target classe/docente persistiti`
      );
    }
    targets = resume.classeDocenteTargets.map((t) => ({ ...t }));
  }

  if (resume === null) {
    this.monitor?.registerJob(jobId);
    this.monitor?.startJob(jobId);
  }
  this.logger?.logBatchStart(targets.length);

  for (let i = resume?.nextIndex ?? 0; i < targets.length; i++) {
    const target = targets[i]!;
    const targetId = `${target.classe}:${target.docenteEmail}`;
    this.logger?.logItemStart(i + 1, targets.length, 'Target', targetId, 'DOCUMENT');
    let message: string;
    const itemStartedAt = Date.now();
    try {
      const result = this.documenti.generateForClasseDocente(
        ClasseId.of(target.classe),
        target.docenteEmail,
        confDocId,
        jobId
      );
      const name = result.fileName ?? targetId;
      const outcome = DocumentBatchService.documentOutcome(result.status);
      this.logger?.logSummary(outcome, result.durationMs, name, {
        depth: 1,
        isLast: true,
        ancestorHasNext: [i + 1 < targets.length]
      });
      message = `${outcome}: ${name} (${result.status} in ${result.durationMs}ms)`;
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e);
      errori.push(`${targetId}: ${reason}`);
      this.logger?.logSummary('Document failed', Math.max(0, Date.now() - itemStartedAt), `${targetId}: ${reason}`, {
        depth: 1,
        isLast: true,
        ancestorHasNext: [i + 1 < targets.length]
      });
      message = `Errore ${i + 1}/${targets.length} ${targetId}: ${reason}`;
    }
    processed.push(targetId);
    const percentage = ((i + 1) / targets.length) * 100;
    this.monitor?.updateProgress(jobId, percentage, message);
    yield {
      confDocId,
      jobId,
      percentage,
      nextIndex: i + 1,
      processed: processed.slice(),
      errori: errori.slice(),
      classeDocenteTargets: targets
    };
  }

  const success = errori.length === 0;
  this.monitor?.completeJob(jobId, `${processed.length} documenti classe/docente elaborati, ${errori.length} errori`);
  return { success, totale: targets.length, processed, errori };
}
```

- [ ] **Step 6: Implement `generateDocenti`**

Enumerates every active class, groups role-resolved assignments by `docenteEmail`, collecting the distinct `classiCompetenza` per teacher:

```ts
private *generateDocenti(
  config: ConfigurazioneDocumento,
  confDocId: string,
  jobId: string,
  resume: BatchResumeState | null,
  processed: string[],
  errori: string[]
): Generator<BatchCheckpoint, BatchResult, void> {
  let targets: DocenteBatchTarget[];
  if (resume === null) {
    const classiPerDocente = new Map<string, Set<string>>();
    const attive = this.classi.filterPerGestioneArticolazione(
      this.classi.findAttive(),
      config.gestioneArticolazione
    );
    for (const classe of attive) {
      const classeId = classe.id ?? '';
      const assignments = this.teachingAssignments.resolveConsiglio(classe, this.now, {
        includeReligioneAlt: true
      });
      for (const assignment of assignments) {
        const docenteEmail = assignment.docenteEffettivo.email.value;
        const set = classiPerDocente.get(docenteEmail) ?? new Set<string>();
        set.add(classeId);
        classiPerDocente.set(docenteEmail, set);
      }
    }
    targets = [...classiPerDocente.entries()].map(([docenteEmail, classi]) => ({
      docenteEmail,
      classiCompetenza: [...classi]
    }));
  } else {
    if (resume.docenteTargets === undefined) {
      throw new ConfigurationError(`Stato di ripresa ${confDocId} privo dei target docente persistiti`);
    }
    targets = resume.docenteTargets.map((t) => ({ docenteEmail: t.docenteEmail, classiCompetenza: [...t.classiCompetenza] }));
  }

  if (resume === null) {
    this.monitor?.registerJob(jobId);
    this.monitor?.startJob(jobId);
  }
  this.logger?.logBatchStart(targets.length);

  for (let i = resume?.nextIndex ?? 0; i < targets.length; i++) {
    const target = targets[i]!;
    this.logger?.logItemStart(i + 1, targets.length, 'Target', target.docenteEmail, 'DOCUMENT');
    let message: string;
    const itemStartedAt = Date.now();
    try {
      const result = this.documenti.generateForDocente(
        target.docenteEmail,
        target.classiCompetenza,
        confDocId,
        jobId
      );
      const name = result.fileName ?? target.docenteEmail;
      const outcome = DocumentBatchService.documentOutcome(result.status);
      this.logger?.logSummary(outcome, result.durationMs, name, {
        depth: 1,
        isLast: true,
        ancestorHasNext: [i + 1 < targets.length]
      });
      message = `${outcome}: ${name} (${result.status} in ${result.durationMs}ms)`;
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e);
      errori.push(`${target.docenteEmail}: ${reason}`);
      this.logger?.logSummary('Document failed', Math.max(0, Date.now() - itemStartedAt), `${target.docenteEmail}: ${reason}`, {
        depth: 1,
        isLast: true,
        ancestorHasNext: [i + 1 < targets.length]
      });
      message = `Errore ${i + 1}/${targets.length} ${target.docenteEmail}: ${reason}`;
    }
    processed.push(target.docenteEmail);
    const percentage = ((i + 1) / targets.length) * 100;
    this.monitor?.updateProgress(jobId, percentage, message);
    yield {
      confDocId,
      jobId,
      percentage,
      nextIndex: i + 1,
      processed: processed.slice(),
      errori: errori.slice(),
      docenteTargets: targets
    };
  }

  const success = errori.length === 0;
  this.monitor?.completeJob(jobId, `${processed.length} docenti elaborati, ${errori.length} errori`);
  return { success, totale: targets.length, processed, errori };
}
```

- [ ] **Step 7: Implement `generateAlunni`**

Mirror `generateClassi`'s shape exactly but iterate `this.alunni.findAttivi()` and call `this.documenti.generateForAlunno`:

```ts
private *generateAlunni(
  confDocId: string,
  jobId: string,
  resume: BatchResumeState | null,
  processed: string[],
  errori: string[]
): Generator<BatchCheckpoint, BatchResult, void> {
  const attivi = this.alunni.findAttivi();
  if (resume === null) {
    this.monitor?.registerJob(jobId);
    this.monitor?.startJob(jobId);
  }
  this.logger?.logBatchStart(attivi.length);

  for (let i = resume?.nextIndex ?? 0; i < attivi.length; i++) {
    const alunno = attivi[i]!;
    const email = alunno.email.value;
    this.logger?.logItemStart(i + 1, attivi.length, 'Target', email, 'DOCUMENT');
    let message = `Generazione documento alunno ${email}`;
    const itemStartedAt = Date.now();
    try {
      const result = this.documenti.generateForAlunno(email, confDocId, jobId);
      const name = result.fileName ?? email;
      const outcome = DocumentBatchService.documentOutcome(result.status);
      this.logger?.logSummary(outcome, result.durationMs, name, {
        depth: 1,
        isLast: true,
        ancestorHasNext: [i + 1 < attivi.length]
      });
      message = `${outcome}: ${name} (${result.status} in ${result.durationMs}ms)`;
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e);
      errori.push(`${email}: ${reason}`);
      this.logger?.logSummary('Document failed', Math.max(0, Date.now() - itemStartedAt), `${email}: ${reason}`, {
        depth: 1,
        isLast: true,
        ancestorHasNext: [i + 1 < attivi.length]
      });
      message = `Errore: ${reason} (alunno ${email})`;
    }
    processed.push(email);
    const percentage = ((i + 1) / attivi.length) * 100;
    this.monitor?.updateProgress(jobId, percentage, message);
    yield {
      confDocId,
      jobId,
      percentage,
      nextIndex: i + 1,
      processed: processed.slice(),
      errori: errori.slice()
    };
  }

  const success = errori.length === 0;
  this.monitor?.completeJob(jobId, `${processed.length} alunni elaborati, ${errori.length} errori`);
  return { success, totale: attivi.length, processed, errori };
}
```

Verify `IAlunnoRepository.findAttivi()` returns objects with an `.email: Email` field (matching `alunno.email.value` usage above) by checking `grep -n "findAttivi" src/domain/repositories/IAlunnoRepository.ts` — `generatePiani` already calls `this.alunni.findAttivi()` and uses `alunno.email.value` (see current source, Step 149-151), so this is a verified, existing pattern.

- [ ] **Step 8: Run to verify all new/changed tests pass**

Run: `npx jest --config jest.config.cjs test/unit/application/document-batch-service.test.ts`
Expected: PASS.

- [ ] **Step 9: Run the full unit suite for regressions in dependent fixtures**

Run: `npm test`
Expected: PASS. Fix any other test file constructing a `CONF_DOC`/`ConfigurazioneDocumento` fixture that used a bare `TIPO` value the old dispatch relied on (`grep -rn "DOCUMENTO_DOCENTE_CLASSE_MATERIA\|DOCUMENTO_CLASSE_MATERIA\|'DIPARTIMENTO'" test/unit test/integration src/onlinetests` and update each to set the matching `GENERATORE` value instead/also).

- [ ] **Step 10: Commit**

```bash
git add src/application/services/DocumentBatchService.ts test
git commit -m "feat(batch): re-key axis dispatch onto GENERATORE, add DOCENTE/CLASSE_DOCENTE/ALUNNO batch axes"
```

---

### Task 8: Documentation sync

**Files:**
- Modify: `SPECS_ALDO/01_SCHEMA_DATABASE.md`
- Modify: `SPECS_ALDO/02_CDU_STRUTTURA.md`

**Interfaces:** none new — documentation only.

- [ ] **Step 1: Rewrite the `CONF_DOC` `GENERATORE`/`FORMATO`/`TIPO` semantics**

In `SPECS_ALDO/01_SCHEMA_DATABASE.md` §`CONF_DOC` (around line 325+):
- Replace the "Altri `CONF_DOC.TIPO` riservati (asse di batch)" block (line 371+) — batch axis is no longer driven by `TIPO`. Rewrite as: "`GENERATORE` pilota l'asse di iterazione del batch (`DocumentBatchService.batchGenerateHandler`) — valori ammessi: `CLASSE`, `DOCENTE`, `PIANO_PERSONALIZZATO`, `CLASSE_MATERIA`, `CLASSE_DOCENTE`, `CLASSE_DOCENTE_MATERIA`, `DIPARTIMENTO`, `ALUNNO` (§4 dello spec di redesign). `TIPO` resta un'etichetta libera scritta in `LOG_DOCS.TIPO`, salvo il vincolo residuo: se `GENERATORE=PIANO_PERSONALIZZATO`, `TIPO` DEVE essere `PIANO_PERS`." Keep the `PIANI.TIPO`/`PIANO_PERS` paragraph (lines 349-363) as-is — unaffected.
- Add a row/paragraph documenting `FORMATO` is restricted to `GDOC`/`GSHEET` only (constructor-validated, `ConfigurationError` otherwise) and `PARAMETRI.aggiungiMaterie`/`aggiungiMaterieConPermessi`/`tabelleImportate` feature flags (the first two mutually exclusive) with the exact compatibility rules from spec §5.2 (quote the four Italian `ConfigurationError` messages verbatim so the spec doc and the code error text never drift).
- Note the retirement of `SHEET_CON_MATERIE_E_PERMESSI`/`DOCUMENTO_CON_TABELLE_IMPORTATE`/`VERBALE_CDC`/`SHEET_CON_MATERIE`/`DOC_PERSONALIZZATO`/`DOCUMENTO_GENERICO`/`FOGLIO_GENERICO` as `GENERATORE` *values* (they never were axis values, but were the old registry keys — clarify this column's meaning changed entirely, not just its allowed value list).

- [ ] **Step 2: Document the two new CDU paths**

In `SPECS_ALDO/02_CDU_STRUTTURA.md`, add:
- `focus.docente` for the `CLASSE_DOCENTE` axis (no `materia` narrowing — same shape used today by `CLASSE_DOCENTE_MATERIA`, just without the per-subject filter).
- `focus.docente.cattedre` (`CattedraVM[]`) for the `DOCENTE` aggregate axis — one entry per class the teacher teaches, subjects grouped per class (mirrors `destinatario.contesto.cattedre`'s email-pipeline shape, §4.1.2/new §4.5 entry).

- [ ] **Step 3: Commit**

```bash
git add SPECS_ALDO/01_SCHEMA_DATABASE.md SPECS_ALDO/02_CDU_STRUTTURA.md
git commit -m "docs(specs): CONF_DOC GENERATORE-driven axis dispatch, FORMATO/PARAMETRI rules, new focus.docente paths"
```

---

### Task 9: Full verification gate

**Files:** none — verification only.

**Interfaces:** none.

- [ ] **Step 1: Typecheck**

Run: `npm run typecheck`
Expected: PASS. Fix any remaining `strategyRegistry`/`Map<string, GeneratorStrategy>`/old-`GENERATORE`-string-literal type errors surfaced by the enum tightening in Task 1.

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: PASS (no `no-restricted-globals` violations — nothing in this plan touches native GAS globals directly).

- [ ] **Step 3: Full unit + integration + build suites**

Run: `npm test && npm run test:integration && npm run test:build`
Expected: all green.

- [ ] **Step 4: Online build (offline-test gate)**

Run: `npm run build:online`
Expected: PASS — this also re-runs the full offline suite as a push gate (per `CLAUDE.md`'s Build Modes section); do not run `push:online` (no push without explicit user request).

- [ ] **Step 5: Commit (only if any fixup was needed in this task)**

```bash
git add -A
git commit -m "fix: verification-gate fixups for CONF_DOC GENERATORE/FORMATO redesign"
```

If Steps 1–4 all passed with zero changes, skip this commit — there's nothing to commit.

---

## Self-Review

- **Spec coverage:** §3 schema/enums → Task 1. §5/§5.2 factory + validation → Tasks 1–2. §6 role resolution → Task 4. §4 all 8 axes → Tasks 5–7 (6 axes — `CLASSE`, `PIANO_PERSONALIZZATO`, `CLASSE_MATERIA`, `CLASSE_DOCENTE_MATERIA`, `DIPARTIMENTO`, `ALUNNO` — reuse existing `DocumentGenerationService`/`DocumentBatchService` methods re-keyed in Task 7; `CLASSE_DOCENTE` new in Task 5; `DOCENTE` new in Task 6). §2 principle 4 (delete `VerbaleGeneratorStrategy`) → Task 2 Step 7. §2 principle 5 (`TIPO` free-form) → Task 3 (documentSteps.ts) + Task 7 Step 4 (batch dispatch). §7.3 doc sync → Task 8. §8 test plan → a unit test task accompanies every code task; Task 9 covers integration/build/typecheck/lint.
- **Placeholder scan:** no TBD/TODO; every step carries real, codebase-verified signatures and file paths, except the two spots explicitly marked for on-the-spot verification before finalizing (Task 6 Step 4's `materiaVmFromSlot`/`buildSubjectVm` name check, and `Docente.genere`/`PersonVM.genere` type check) — both are narrow, single-line lookups the implementer resolves by grep before writing that one function, not open-ended design.
- **Type consistency:** `generateForClasseDocente(target, docenteEmail, confDocId, jobId)` (Task 5) and its batch caller in `generateClasseDocente` (Task 7 Step 5) agree. `generateForDocente(docenteEmail, classiCompetenza, confDocId, jobId)` (Task 6) and its batch caller in `generateDocenti` (Task 7 Step 6) agree. `DocumentStrategyFactory.resolve(config)` (Task 2) matches its single call site in `RenderTemplateStep` (Task 2 Step 5). `GeneratoreAxis` values used in `DocumentBatchService`'s switch (Task 7 Step 4) match exactly the 8 enum members defined in Task 1 Step 3.
- **Known gaps carried forward (not silently resolved — see "Judgment Calls" above):** `PIANO_PERSONALIZZATO` axis's `DocPersonalizzatoGeneratorStrategy` special-case in the factory deviates from the literal §5 diagram — this is intentional and the spec docs were updated to match. The original `SheetMaterieGeneratorStrategy` "columns without ACL" gap is resolved: the user chose to split `materiePermessi` into `aggiungiMaterie` (no ACL) / `aggiungiMaterieConPermessi` (with ACL), both wired into the factory (Task 2 Step 7), so no gap remains.
