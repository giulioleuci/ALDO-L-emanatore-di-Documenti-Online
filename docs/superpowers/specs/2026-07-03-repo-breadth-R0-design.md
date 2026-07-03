# Repository & Specification Breadth — R0 Foundations Design

**Date:** 2026-07-03
**Status:** Approved (design phase)
**Parent decomposition:** Repository/Spec subsystem → R0 (foundations + lookups), R1 (Alunno aggregate), R2 (Docente & cattedra dynamics), R3 (config/log/master). This doc covers **R0**.
**Sources of truth:** `SPECS_ALDO/01_SCHEMA_DATABASE.md`, `02_CDU_STRUTTURA.md`; subsystem specs `06_REPOSITORY.md`, `07_SPECIFICATIONS.md`, entity/VO specs `03`/`04`/`05`.
**Builds on:** `docs/superpowers/specs/2026-07-01-aldo-implementation-design.md` (Phase 0 + slice, merged to master).

---

## 1. Decision locked

Repositories and persisted entities adopt the **vendored `DomainRepositoryLib` (L3)** — the spec-faithful path (`06 §Pattern generali`). This reshapes the slice's VO-rich entity model onto the lib's `Entity`/hydration model and requires a heavier offline test harness. Approved with that cost understood.

The lib's real contract (read from `GasLibraryFactory/DomainRepositoryLib` as sanctioned "extremely necessary" reading):

- **`Repository`** (`src/Repository.js`): abstract; ctor `(database, tableName, EntityClass, logger?, cache?, exceptionService?, options?)`. Provides `find(spec)`, `findOne`, `findById`, `findByIdOrFail`, `findAll`, `exists`, `count`, `save`, `saveMany`, `patch`, `delete*`, `refresh`. **Hard seam:** `_getTable()` needs `database.tables[tableName]` exposing `getByPK(id)` / `getAllRows()`; `find()` uses `database.select(['*']).from(name)...execute()` when `QueryTranslator.validate(spec)` passes, else `_table.getAllRows()` + `spec.isSatisfiedBy(entity)` in memory.
- **`Entity`** (`src/Entity.js`): abstract; ctor `(data = {})` sets `_id/_createdAt/_updatedAt/_dirtyFields/...`; subclass assigns its own fields from `data`. Hydration calls `EntityClass.fromData(data)` if a static exists, else `new EntityClass(data)`. Dehydration calls `entity.toData()`.
- **Specifications**: lib provides `Specification`, `FieldSpecification`, `FunctionSpecification`, `CompositeSpecification`, `SpecificationBuilder`; composition via `.and()/.or()/.not()`. `FieldSpecification` is DB-translatable; `FunctionSpecification` is in-memory only.
- Errors: `EntityNotFoundException`, `DomainException`, `InvariantViolationException`. Validation re-exports Zod (`z`, `ValidationException`).

---

## 2. R0 scope, split into two plans

R0 is large and touches already-merged code, so it splits:

- **R0a — Adoption + refactor (slice stays green).** Test harness for lib-based repos; ambient types for the lib; `FakeDatabaseService`; refactor the merged `Classe`/`Docente` onto `Entity`, `ClasseRepository` onto `Repository`, `AlunniAttiviSpec` onto `FieldSpecification`; adjust `ContextBuilder`/`VerbaleGeneratorStrategy`/`DocumentGenerationService` and all slice tests. **Exit: the entire Phase-0 slice test suite is green on the new foundation** (regression guard) + `build:testoffline` exit 0.
- **R0b — Lookup clusters.** On the proven foundation, add the four cached lookup clusters: `Materia`, `Indirizzo`, `Dipartimento`, `RuoloSpeciale` — entities + VOs + repositories + their specs (`06 §4–7`, `07 §4–6,14`).

This document specifies both; R0a is planned/built first.

---

## 3. Offline test harness (R0a, the linchpin)

Lib-based repositories need the real `Repository`/`Entity`/specification classes at test time. Approach, in order of preference:

1. **Jest setup loads the real lib as globals.** A `test/setup/loadDomainRepositoryLib.ts` (referenced via `setupFilesAfterEnv`) imports `DomainRepositoryLib` from the monorepo source and `Object.assign(globalThis, DRL)`, exposing `Entity`, `Repository`, `Specification`, `FieldSpecification`, `FunctionSpecification`, `CompositeSpecification`, `EntityNotFoundException`, etc. Jest `moduleNameMapper` aliases the lib's internal deps to monorepo dirs: `@CoreUtilsLib`, `@GasSchemaValidatorLib`, `@GasResilienceLib` → `../GasLibraryFactory/<lib>`. `transformIgnorePatterns` must allow transpiling those `.js` sources via babel-jest.
2. **Fallback if source-aliasing proves too tangled:** load the vendored `vendor/gaslibs.Code.js` in the setup file (it already `Object.assign`es all lib classes onto the global). Downside: it's GAS-targeted (URL shim, `crypto.getRandomValues` warning) and larger; use only if (1) fails.

**The first R0a task is a spike** that stands up the harness and proves a trivial `class Foo extends Entity` + a `Repository` subclass resolve and run under Jest, before any refactor. If neither approach works cleanly, stop and escalate (this is the one genuine technical risk in R0).

**Ambient types:** extend `types/gaslibs/index.d.ts` with `declare class Entity`, `declare class Repository<T>` (generic over entity), `declare class FieldSpecification`, `declare class FunctionSpecification`, `declare class CompositeSpecification`, and `EntityNotFoundException`, authored from the lib's public API in §1. These type the globals for ALDO's TS at compile time.

**`FakeDatabaseService`** (`test/fakes/FakeDatabaseService.ts`): satisfies the `Repository` seam without SheetDBLib —
```
tables: { [name]: { getByPK(id): Row|null; getAllRows(): Row[]; insert(row); update(pk,row); } }
select(cols).from(name).where(...).execute(): Row[]   // minimal builder for FieldSpecification path
save(): void                                          // Unit-of-Work flush marker
```
Seeded from the existing `test/fixtures/tables.ts` (UPPERCASE columns). Most ALDO specs will hit the in-memory `getAllRows()` path; the minimal `select/from/where/execute` covers `FieldSpecification`-translatable specs. Keep it thin — extend only as a spec actually exercises a path.

---

## 4. Entity model (R0a)

ALDO persisted entities become `Entity` subclasses. Pattern (from the lib's own integration test):
```ts
class Docente extends Entity {
  cognome: string | null; nome: string | null; genere: Genere | null;
  constructor(data: DocenteData = {}) {
    super(data);
    this.id = data.EMAIL ?? null;          // EMAIL is the PK
    this.cognome = data.COGNOME ?? null;
    this.nome = data.NOME ?? null;
    this.genere = (data.GENERE as Genere) ?? null;
  }
  cognomeNome(): string { return `${this.cognome ?? ''} ${this.nome ?? ''}`.trim(); }
  nomeConAppellativo(): string { return `${appellativo(this.genere!)} ${this.cognomeNome()}`; }
  toData(): Row { return { EMAIL: this.id, COGNOME: this.cognome, NOME: this.nome, GENERE: this.genere }; }
  static fromData(data: Row): Docente { return new Docente(data); }
}
```
- VOs (`ClasseId`, `AnnoCorso`, `Email`, `MateriaId`) remain for validation/behavior but are reconstructed inside the entity (in `fromData`/getters), not stored as the hydration shape — hydration works on flat rows.
- `Classe` refactors the same way (`ID`→`id`, `ANNO`→`anno` exposing `AnnoCorso`, `INDIRIZZO`→`indirizzo`).
- `ConsiglioDiClasse` stays a **pure computed aggregate** (not persisted, not `Entity`-derived) — unchanged from the slice.
- Consumers adjust to the new shape: `ContextBuilder` reads `classe.anno` (VO) / `classe.nome`; `VerbaleGeneratorStrategy` and `DocumentGenerationService` unchanged except where they touched entity fields. **All slice tests are updated and must stay green.**

Column-name↔property mapping is explicit in each entity's constructor/`toData` (UPPERCASE DB columns per `01`), not relying on the lib's auto camelCase mapper — explicitness keeps `01` fidelity checkable.

---

## 5. Repository refactor (R0a)

`ClasseRepository` becomes `class ClasseRepository extends Repository` (`super(db, 'CLASSI', Classe)`), keeping its domain query methods (`findById` via base, `getConsiglioDiClasse`, `getAlunniAttivi`) but sourcing rows through the base/`_table` seam. The interface `IClasseRepository` stays as the domain-facing contract; `ClasseRepository` implements it while extending the lib base. Unit-of-Work: mutations go through `save()`/`saveMany()` + `database.save()` (`06 §Unit of Work`).

---

## 6. Specification refactor (R0a) + lookups (R0b)

- `Specification` (ALDO's slice interface) is superseded by the lib's `Specification`/`FieldSpecification`/`FunctionSpecification`. `AlunniAttiviSpec` becomes a `FieldSpecification` on `{ ATTIVO: true }` (translatable) with `isSatisfiedBy` intact; composition via `.and()/.or()/.not()`.
- **R0b lookup clusters** (`06 §4–7`, `07 §4–6,14`), each = entity(+VO) + repository(+cache) + specs, TDD per unit:
  - **Materia**: `Materia extends Entity` (ID/NOME/SINTESI/ESAME_CFG→`EsameConfig` VO); `MateriaRepository` (full cache) with `findEsamePrima/Seconda`; specs `MateriePerDipartimentoSpec`, `MaterieEsamePrimaSpec`, `MaterieEsameSecondaSpec` (all `toQueryObject=null`).
  - **Indirizzo**: `Indirizzo extends Entity` (ID/NOME/NOME_SINTETICO/TIPO→`TipoIstituto`); `IndirizzoRepository` (cache) `findByTipo`; spec `IndirizziPerTipoSpec`.
  - **Dipartimento**: `Dipartimento extends Entity` (ID/NOME/CAPO/MATERIE-csv) + `DipartimentoId` VO; `DipartimentoRepository` (cache) `getCapo/getDocenti/getMaterie/setCapo`; (Docente/Materia deps injected).
  - **RuoloSpeciale**: `RuoloSpeciale extends Entity` (ID/NOME/DOCENTE-csv); `RuoloSpecialeRepository` (cache) `findByDocente`(CONTAINS)/`getDocenti`/`assegnaRuolo`; spec `RuoliPerDocenteSpec`.
- Lookup caching (`06 §Caching`): full in-memory load on first access, held for the session. In tests the `FakeDatabaseService` backs them; cache correctness is unit-tested (second call doesn't re-read).

---

## 7. Layering, gates, DB-name fidelity

- ESLint gates unchanged and must stay green. Entities extending the ambient global `Entity` in `src/domain/**` is lint-clean (a global, not an outer-layer import, not a native GAS global). Repositories remain in `src/infrastructure/repositories/**`.
- All table/column names UPPERCASE per `01`; every new entity's mapping cross-checked against `01` (as Task 1 established — DOCENTI is `COGNOME`/`NOME`).
- Composite-PK tables (not in R0) are R1+; R0 entities are single-PK (Materia/Indirizzo/Dipart/Ruoli by `ID`, plus refactored Classe/Docente by ID/EMAIL).

---

## 8. Definition of done

- **R0a:** harness spike green; `Classe`/`Docente`/`ClasseRepository`/`AlunniAttiviSpec` refactored onto the lib; **every merged slice test green** (unit + integration, incl. the Verbale end-to-end); lint + typecheck clean; `build:testoffline` exit 0.
- **R0b:** four lookup clusters implemented TDD with caching tests; lint/typecheck clean; `build:testoffline` exit 0; names verified vs `01`; specs verified vs `07`.

## 9. Non-goals / risks

- **Risk:** the Jest-loads-real-lib harness (§3) is the one genuine unknown; the R0a spike de-risks it before any refactor, with the vendored-bundle fallback.
- Not in R0: composite-PK repos, dynamic-column breadth of `ClasseRepository` (`getDocentiPerMateria` etc. → R2), role resolution (ContextEngine cycle), the full 64-spec catalogue (only Alunno-slice + the four lookup clusters' specs here).
- The lib's `patch`/`delete`/domain-events surface is available but unused until a consumer needs it (YAGNI).
