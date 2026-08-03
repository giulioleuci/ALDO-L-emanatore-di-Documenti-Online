# Estrazioni da ALDO → GasLibraryFactory

> Analisi via `codebase-memory-mcp` — 2026-07-31
> Metodologia: `get_architecture` + `search_graph` + `trace_path` + `get_code_snippet` su entrambi i grafi
> (`home-giulio-Desktop-ALDO-implementing` e `home-giulio-Desktop-ALDO-implementing-GasLibraryFactory`).

---

## Indice delle priorità

| # | Componente | File ALDO | Libreria GLF target | Priorità | Effort |
|---|---|---|---|---|---|
| 1 | `LazyRef<T>` | `src/application/storico/LazyRef.ts` | `CoreUtilsLib` | 🟢 Alta | ~2h |
| 2 | Specs → allineamento a GLF | `src/domain/specifications/` | `DomainRepositoryLib` | 🟡 Media | ~4h |
| 3 | `RowScopeExpansion` (subset) | `src/infrastructure/role-resolution/RowScopeExpansion.ts` | `RoleResolutionLib` | 🟡 Media | ~1g |
| 4 | `AlberoCartelle` | `src/infrastructure/services/AlberoCartelle.ts` | `GoogleApiWrapper` | 🟠 Bassa | ~1-2g |
| 5 | `AldoTeachingResolutionConfig` | `src/infrastructure/role-resolution/AldoTeachingResolutionConfig.ts` | — | 🔴 Non estrarre | — |
| 6 | `formatOggi` | `src/application/context-engine/dates.ts` | `CoreUtilsLib` | 🔴 Non prioritario | ~3h |

---

## 1. `LazyRef<T>` → `CoreUtilsLib`

### Codice attuale

```ts
// src/application/storico/LazyRef.ts
export class LazyRef<T> {
  private resolved = false;
  private value: T | undefined;
  constructor(private readonly loader: () => T) {}

  get(): T {
    if (!this.resolved) {
      this.value = this.loader();
      this.resolved = true;
    }
    return this.value as T;
  }

  isResolved(): boolean { return this.resolved; }
}
```

### Verifica graph

- **Callers confermati (fan-in=4)**: tutti in `src/application/context-engine/providers/`:
  - `PianiPersAlunnoStoricoProvider.provide`
  - `DocumentiStoricoProvider.provide`
  - `StoricoProvider.provide`
  - `PianiPersClasseStoricoProvider.provide`
- **Dipendenze esterne**: zero (classe pura, nessun import).
- **Equivalente in GLF**: `CoreUtilsLib` ha `LazyServiceContainer` (DI container lazy) e
  `SystemEnvironmentUtils.once()` (wrapper funzione), ma **nessun lazy value generico**.
  `LazyServiceContainer` è troppo orientato a DI per essere usato come `LazyRef<T>`.

### Analisi

Pattern universale GAS: utile ogni volta che un provider ha un carico pesante (es. lettura foglio
storico) che non deve ripetersi in un'esecuzione. Zero dipendenze ALDO-specifiche: il porting è
copia + adattamento a stile JS GLF + test.

### Azione proposta

Aggiungere `LazyRef` a `CoreUtilsLib/src/utils/` (o `CoreUtilsLib/src/internal/`) come classe
JS esportata. Aggiornare `DOCS_LIBS/CoreUtilsLib.md`. ALDO poi importa da GLF.

### Complessità: ⬛⬜⬜⬜⬜ (triviale)

---

## 2. Specs ALDO → allineamento a `DomainRepositoryLib.Specification`

### Situazione

ALDO definisce una propria TS interface locale in `src/domain/specifications/Specification.ts`:

```ts
export interface Specification<T> {
  isSatisfiedBy(candidate: T): boolean;
  toQueryObject(): Record<string, unknown> | null;
}
```

**32 classi concrete** implementano questa interface (fan-in=28 sul tipo).

### Verifica graph — scoperta critica

Il graph conferma:

1. **`toQueryObject` è implementata e ritorna oggetti reali** in ~22/32 specs (le restanti
   ritornano `null` — es. `ClassiArticolateSpec`, `CarenzeNonNotificateSpec`).
2. **`isSatisfiedBy` ha `in_degree=0`** su TUTTE le specs concrete → **nessuno le chiama
   nel runtime ALDO**. Le specs sono usate esclusivamente tramite `SheetDbAdapter.find(predicate)`
   con predicate lambda inline, mai passando una `Specification<T>` come oggetto.
3. **`SheetDbAdapter.find()` non accetta specs**: firma `find(predicate: (row: Row) => boolean)` —
   il pushdown via `toQueryObject` è potenzialmente attivo ma il wiring non è mai connesso.

### GLF ha già tutto

`DomainRepositoryLib` ha: `Specification` (classe base con `and/or/not`), `CompositeSpecification`,
`FieldSpecification`, `FunctionSpecification`, `ExpressionSpecification`, `SpecificationBuilder`.
Il contratto `isSatisfiedBy + toQueryObject` è identico.

### Analisi

Il problema non è "estrarre" ma **allineare**: ALDO ridefinisce localmente ciò che GLF già
offre, e il pushdown `toQueryObject → SheetDBLib.find()` non è mai connesto. Le specs
esistono come oggetti ma vengono scartate in favore di lambda dirette.

Due possibili azioni:

**A (allineamento solo tipaggio)**: Fare in modo che le 32 specs ALDO estendano
`DomainRepositoryLib.Specification` anziché l'interfaccia locale. Rimuove la duplicazione
del contratto. Effort ~2h.

**B (wiring pushdown, più ambizioso)**: Connettere `SheetTableAdapter` al pattern
`QueryableSpecification` di GLF — passare specs (non lambda) ai repository, sfruttare
`toQueryObject` per filtri nativi `SheetDBLib`. Effort ~1g + test.

> [!WARNING]
> Finché `isSatisfiedBy` ha `in_degree=0`, il sistema funziona ma le specs non vengono mai
> invocate come oggetti polimorfici — sono solo contenitori del contratto `toQueryObject`.
> Il fatto che `toQueryObject` abbia anch'essa `in_degree=0` (callers=0) su tutte le 32
> implementazioni conferma che il pushdown non è attivo in nessun percorso di esecuzione.

### Azione proposta

Minimo: opzione A (allineamento tipaggio). Se il pushdown è desiderato, discutere B separatamente.

### Complessità: ⬛⬛⬜⬜⬜ (bassa-media)

---

## 3. `RowScopeExpansion` (subset) → `RoleResolutionLib`

### Componenti del file

```
src/infrastructure/role-resolution/RowScopeExpansion.ts  (211 righe)
├── splitCsvList(raw)                      → utility CSV pura
├── groupMateriaEntriesBySlot(materieRaw)  → parsing "MATERIA.itp" → {kind, specifica, materie[]}
├── nominalPairsForAnchor(...)             → dipende da IClasseRepository
├── expandRowScope(...)                    → dipende da IClasseRepository
├── expandRowToPairs(...)                  → dipende da IClasseRepository
├── slotCompatible(a, b)                   → utility confronto slot pura
└── pairsOverlap(a, b)                     → utility confronto coppie pura
```

### Verifica graph — callers reali

- `expandRowScope` → chiamato da `expandRows` (privata di `AldoTeachingResolutionConfig`)
  E da `SupplenzaRepository.creaSupplenza` (validazione overlap al momento della creazione).
- `groupMateriaEntriesBySlot` → stessa catena + `expandRowToPairs`.
- `pairsOverlap` → chiamato da `SupplenzaRepository.creaSupplenza`.
- `slotCompatible` → chiamato da `pairsOverlap`.

### Analisi

Il file contiene due livelli di logica:

**Livello 1 — estraibile senza dipendenze**: `splitCsvList`, `groupMateriaEntriesBySlot`,
`slotCompatible`, `pairsOverlap`. Sono funzioni pure che operano su stringhe/array, nessuna
dipendenza da ALDO. Andrebbero in `RoleResolutionLib/src/utils/` o come helper pubblici.
Queste 4 funzioni coprono il parsing del formato `MATERIA.itp`/`MATERIA.specifica` che
qualsiasi app con cattedre CSV userebbe.

**Livello 2 — non estraibile senza astrazione**: `nominalPairsForAnchor`, `expandRowScope`,
`expandRowToPairs`. Dipendono da `IClasseRepository` (interface ALDO-specifica con
`findByDocenteAssegnato` e `getTeachingSlots`). Per portarle in GLF servirebbe una
interface generica in `RoleResolutionLib` che astraesse il concetto di "repository di classi
con cattedre". Questo è un'estensione non banale di GLF.

### Azione proposta

**Breve termine**: Estrarre le 4 funzioni pure (Livello 1) in `RoleResolutionLib`. Nessuna
dipendenza da eliminare, effort ~3h.
**Lungo termine**: Valutare se `IClasseRepository` (o una sua astrazione) appartiene a GLF —
decisione separata, impatto maggiore.

### Complessità Livello 1: ⬛⬛⬜⬜⬜ (bassa-media)
### Complessità Livello 2: ⬛⬛⬛⬛⬜ (alta — richiede nuova interface in GLF)

---

## 4. `AlberoCartelle` → `GoogleApiWrapper`

### Codice

Classe ~61 righe. Logica: find-or-create cartella Drive con audit row su `LOG_FOLD` (SheetDB).
Dipendenze:
- `IDriveFacade` (ALDO interface — wrappa `GoogleApiWrapper.DriveService`)
- `IDatabase` (ALDO interface — wrappa `SheetDBLib`)
- `LOG_FOLD`/`COL_LOG_FOLD.*` costanti ALDO
- Helper locali puri: `firstNonBlank`, `folderName`, `mergeCsv` (tutte nello stesso file)
- **Nessuna dipendenza esterna oltre a quelle due interfaces**

### Verifica graph — callers reali

- `PrepareInfrastructureStep._executeLogic` (pipeline doc)
- `Bootstrap.buildAldoContainer` (wiring composition root)

### Analisi

Il pattern "find-or-create con audit log" è generico, ma le **colonne del log** (`TIPO`, `NOME`,
`PATH`, `LINK`, `CLASSI`, `UTENTI`, `MATERIE`) sono ALDO-specifiche. Per portarla in GLF
servirebbe parametrizzare lo schema del log come config object — trasformando la classe in
qualcosa tipo `AuditedFolderService<TSchema>`. Il guadagno per altri progetti GAS esiste
(chiunque gestisca cartelle Drive vuole audit), ma il refactor è non banale.

`GoogleApiWrapper.DriveService` ha già `findFolderByPath` / `createFolder`. Aggiungere
find-or-create come metodo diretto (senza log) sarebbe semplice, ma il log è la parte
di valore per ALDO.

### Azione proposta

Tenere in `src/infrastructure/services/AlberoCartelle.ts` come infra-helper ALDO-locale.
Il valore di estrarlo è condizionato alla decisione di parametrizzare lo schema — richiede
decisione architetturale separata. Non blocca nessun altro lavoro.

### Complessità se estratto: ⬛⬛⬛⬛⬜ (alta)

---

## 5. `AldoTeachingResolutionConfig` — NON estrarre

### Motivo

149 righe, fortemente accoppiato a:
- `TABLE.*` / `COL_*` costanti schema ALDO
- `ClasseRepository` (implementazione concreta ALDO)
- `MateriaId`, `Classe` entities ALDO
- Business rule ALDO-specifiche: classi articolate, specifica catalog, `isReligioneAlt`

Usa `RoleResolutionLib` correttamente. È il "wiring layer" che configura
`EffectiveAssignmentResolver` con le sorgenti dati ALDO. Per design è e deve restare
domain-specific. Fan-in=2 (usata solo da `Bootstrap` + un test).

**Nessuna azione.**

---

## 6. `formatOggi` — Non prioritario

### Codice

```ts
// src/application/context-engine/dates.ts
export function formatOggi(d: Date): CduMeta['date']['oggi'] {
  const fmt = (pattern: string): string => utils.formatDate(d, pattern, { utc: true }) ?? '';
  return {
    breve: fmt('DD/MM/YYYY'),
    estesa: `${fmt('DD')} ${MESI[d.getUTCMonth()]} ${fmt('YYYY')}`,
    iso: fmt('YYYY-MM-DD'),
    giorno: fmt('DD'),
    mese: fmt('MM'),
    anno: fmt('YYYY'),
    ora: fmt('HH:mm')
  };
}
```

### Analisi

12 righe. Il tipo di ritorno `CduMeta['date']['oggi']` è fortemente ALDO-tipizzato. La logica
è triviale (delegato interamente a `utils.formatDate` GLF). `MESI` è un array italiano hardcoded.
Per generalizzarla in GLF andrebbe restituita una `Record<string, string>` generica con pattern
configurabili dall'esterno — ma a quel punto il valore è quasi zero (chi usa GLF può già
chiamare `utils.formatDate` direttamente).

Fan-in=2 (2 callers nel context-engine).

**Nessuna azione nel breve termine.**

---

## Riepilogo decisioni

| Componente | Decisione | Prossimo passo |
|---|---|---|
| `LazyRef<T>` | ✅ Estrarre in `CoreUtilsLib` | Aprire issue GLF, portare classe + test JS |
| Specs allineamento (opzione A) | ✅ Allineare a GLF class | Rimuovere `Specification.ts` locale, far estendere GLF |
| Specs pushdown (opzione B) | ❓ Dipende da decisione | Valutare separatamente con utente |
| `RowScopeExpansion` Livello 1 (funzioni pure) | ✅ Estrarre in `RoleResolutionLib` | 4 funzioni pure → `RoleResolutionLib/src/utils/` |
| `RowScopeExpansion` Livello 2 (con `IClasseRepository`) | ❓ Richiede decisione su interface GLF | Valutare con utente se `IClasseRepository` va in GLF |
| `AlberoCartelle` | ⏸ Tenere in ALDO per ora | Rivalutare se si vuole `AuditedFolderService<T>` |
| `AldoTeachingResolutionConfig` | ❌ Non estrarre | — |
| `formatOggi` | ❌ Non prioritario | — |
