# Specification: `CONF_DOC` Architecture Redesign — Batch Axes, Document Formats, and Strategy Decomposition

> **Document Version:** 1.0.0 (Authoritative Design Specification)  
> **Language:** English  
> **Status:** Approved for Implementation  
> **Target Scope:** `CONF_DOC` DB Schema, `GeneratoreAxis` & `FormatoDocumento` Value Objects, `DocumentBatchService`, `DocumentGenerationService`, Strategy Registry & Factory, Context Engine Recipes, and ACL Role Resolution.

---

## 1. Executive Summary & Problem Statement

In the legacy SGSA design, `CONF_DOC.TIPO` and `CONF_DOC.GENERATORE` suffered from conflated concerns:

1. **Iteration Axis vs. Categorical Classification:**
   `CONF_DOC.TIPO` was overloaded to act both as a human-readable categorization tag / audit key (`LOG_DOCS.TIPO`) and as an execution switch driving batch iteration (`DOCUMENTO_DOCENTE_CLASSE_MATERIA`, `DOCUMENTO_CLASSE_MATERIA`, `DIPARTIMENTO`, `PIANO_PERS`). Any introduction of a new batch loop required reserving new `TIPO` strings and writing custom dispatching logic in `DocumentBatchService.batchGenerateHandler`.

2. **Strategy Explosion vs. Feature Modifiers:**
   `CONF_DOC.GENERATORE` originally stored the name of a concrete implementation class (e.g. `DOC_GENERICO`, `SHEET_CON_MATERIE`, `SHEET_CON_MATERIE_E_PERMESSI`, `DOCUMENTO_CON_TABELLE_IMPORTATE`, `VERBALE`). These strategy classes hard-coded rendering format choices and combined base rendering with orthogonal features (like importing table snapshots from Sheets or applying column ACL protections).

3. **Format Ambiguity:**
   `CONF_DOC.FORMATO` existed in schema descriptions as a generic enum but was not strictly enforced or leveraged to determine low-level template cloning and Google Workspace API invocations (`GDOC` vs `GSHEET`).

---

## 2. Core Architectural Principles of the Redesign

```
                        CONF_DOC Row Configuration
                                    │
         ┌──────────────────────────┼──────────────────────────┐
         ▼                          ▼                          ▼
CONF_DOC.GENERATORE         CONF_DOC.FORMATO           CONF_DOC.PARAMETRI
   (Batch Axis)              (File Format)              (Feature Flags)
         │                          │                          │
         ▼                          ▼                          ▼
 • Target Enumeration        • Drive File Cloning        • Modifiers:
 • CDU Recipe Selection      • Base Strategy Engine        - aggiungiMaterie
 • Target Scope Identity       (GDoc vs GSheet)            - aggiungiMaterieConPermessi
                                                           - tabelleImportate
                                                           - axis-specific params
```

1. **`GENERATORE` defines WHAT to iterate (The Batch Axis):**
   `CONF_DOC.GENERATORE` is strictly an enum of 8 generation axes. It dictates what targets are enumerated in batch jobs, what parameters are passed to `ContextEngine`, which CDU recipe is activated, and how duplicate identity is derived.
2. **`FORMATO` defines the Document Engine:**
   `CONF_DOC.FORMATO` is an enum restricted exclusively to `GDOC` and `GSHEET`.
3. **`PARAMETRI` defines Feature Modifiers:**
   `SHEET_CON_MATERIE`, `SHEET_CON_MATERIE_E_PERMESSI`, and `DOCUMENTO_CON_TABELLE_IMPORTATE` are retired as separate strategy classes. They become boolean/object feature flags inside `CONF_DOC.PARAMETRI` (`aggiungiMaterie`, `aggiungiMaterieConPermessi`, and `tabelleImportate`), all defaulting to `false`. `aggiungiMaterie` adds the dynamic subject columns with no ACL; `aggiungiMaterieConPermessi` adds them WITH cell-range protections; the two are mutually exclusive.
4. **`VerbaleGeneratorStrategy` is Deleted:**
   Custom verbale-specific strategy logic is removed; standard template placeholders with `FORMATO=GDOC` cover verbale generation.
5. **`TIPO` is purely a Domain Category Label:**
   `CONF_DOC.TIPO` is a free-form string written to `LOG_DOCS.TIPO`. The ONLY reserved value with domain-level validation is `PIANO_PERS` (for personalized learning plans, PDP/PEI/PFP).
6. **Axis-Aware Column Evaluation:**
   `PERMESSI`, `PATH_OUT`, `FILE_NAME`, `CONDIZIONE`, `GESTIONE_ARTICOLAZIONE`, and `REGISTRA_DOC` evaluate dynamically against the resolved context of the chosen axis.

---

## 3. Database Schema Specification: `CONF_DOC`

### 3.1 Column Definitions

| Column | Type | Nullable | Default | Description / Allowed Values |
|---|---|---|---|---|
| `ID` | String | No (PK) | — | Unique configuration code (e.g. `VERBALE_CDC`, `PIANI_PERSONALIZZATI`, `SCHEDA_MATERIA`). |
| `TIPO` | String | No | — | Free-form categorization label (e.g. `VERBALE`, `PIANO_LAVORO`, `PROGRAMMAZIONE`). Sole reserved value: `PIANO_PERS`. |
| `NOME` | String | No | — | Human-readable title for UI menus and dialogs. |
| `GENERATORE` | Enum (`GeneratoreAxis`) | No | — | Batch iteration axis and recipe driver. Allowed values: `CLASSE`, `DOCENTE`, `PIANO_PERSONALIZZATO`, `CLASSE_MATERIA`, `CLASSE_DOCENTE`, `CLASSE_DOCENTE_MATERIA`, `DIPARTIMENTO`, `ALUNNO`. |
| `FORMATO` | Enum (`FormatoDocumento`) | No | — | Target document format. Allowed values: `GDOC`, `GSHEET`. |
| `DUPLICAZIONE` | Enum (`DuplicazioneDocumento`) | No | `NEGATA` | Policy for handling re-generation: `NEGATA` (default) or `PERMESSA`. |
| `GESTIONE_ARTICOLAZIONE` | Enum (`GestioneArticolazione`) | No | `COMPLETA` | `COMPLETA` (default) or `ARTICOLATA`. Evaluated only on class-based axes. |
| `PATH_OUT` | String | No | — | Folder path pattern with `{{...}}` placeholder expressions and `/` separators. |
| `FILE_NAME` | String | No | — | Target file name pattern supporting `{{...}}` placeholders. |
| `MODELLI` | JSON | No | — | Drive template ID (string) or conditional template map. Must match `FORMATO`. |
| `PERMESSI` | JSON | Yes | `{}` | Role-to-permission mapping object (e.g. `{"COORDINATORI": "SCRITTURA", "DIPART.CAPO": "SCRITTURA"}`). |
| `PARAMETRI` | JSON | Yes | `{}` | Feature toggles (`aggiungiMaterie`, `aggiungiMaterieConPermessi`, `tabelleImportate`) and generator parameters. |
| `CONDIZIONE` | String | Yes | `""` | Boolean expression evaluated by `GasExpressionEngineLib`. Empty = always generate. |
| `POST_PROCESSO` | JSON (Array) | Yes | `[]` | Post-generation actions (`INSERISCI_TIMESTAMP`, `AGGIORNA_CAMPO`, `AGGIORNA_STATO_DOC`). |
| `REGISTRA_DOC` | JSON | Yes | `{}` | Optional template expressions for `LOG_DOCS` fields (`classi`, `utenti`, `materie`). |
| `REGISTRA_FOLD` | JSON | Yes | `{}` | Optional template expressions for `LOG_FOLD` fields (`classi`, `utenti`, `materie`). |

---

## 4. The 8 Generation Axes (`GeneratoreAxis`)

Every axis defines:
- The discrete iteration unit enumerated by `DocumentBatchService`.
- The activated `ContextEngine` recipe and parameters.
- The `tipoTarget` written to `meta.parametriInput.tipoTarget`.
- The target identity written to `LOG_DOCS.SOTTOTIPO` and used for deduplication.

```
┌─────────────────────────┬───────────────────────────────┬─────────────────────────┬──────────────┬────────────────────────────┐
│ GENERATORE Axis         │ Batch Target Unit             │ CDU Recipe              │ tipoTarget   │ LOG_DOCS.SOTTOTIPO         │
├─────────────────────────┼───────────────────────────────┼─────────────────────────┼──────────────┼────────────────────────────┤
│ CLASSE                  │ Each active class             │ CLASSE_COMPLETA         │ classe       │ ""                         │
│ DOCENTE                 │ Each active teacher (one doc) │ DOCENTE_AGGREGATO       │ docente      │ ""                         │
│ PIANO_PERSONALIZZATO    │ Each active student piano     │ PIANO_PERSONALIZZATO    │ alunno       │ focus.piano.tipo           │
│ CLASSE_MATERIA          │ Each (class, subject)         │ CLASSE_MATERIA          │ classe       │ ""                         │
│ CLASSE_DOCENTE          │ Each (class, teacher) pair    │ CLASSE_DOCENTE          │ classe       │ ""                         │
│ CLASSE_DOCENTE_MATERIA  │ Each (class, teacher, subject)│ CLASSE_DOCENTE_MATERIA  │ classe       │ ""                         │
│ DIPARTIMENTO            │ Each DIPART row               │ DIPARTIMENTO_COMPLETO   │ dipartimento │ ""                         │
│ ALUNNO                  │ Each active student           │ ALUNNO_COMPLETO         │ alunno       │ ""                         │
└─────────────────────────┴───────────────────────────────┴─────────────────────────┴──────────────┴────────────────────────────┘
```

### 4.1 Detailed Semantics per Axis

#### 1. `CLASSE`
- **Target Unit:** Each active class in `CLASSI` (filtered by `GESTIONE_ARTICOLAZIONE`).
- **Recipe:** `CLASSE_COMPLETA`.
- **Target Scope:** Class object (`focus.classe`).
- **Use cases:** Class council minutes, class report cards, general class-level overviews.

#### 2. `DOCENTE` (Aggregated Teacher Axis)
- **Target Unit:** Each unique teacher email having at least one active teaching assignment across all active classes. Exactly **one aggregate document per teacher** is generated.
- **Recipe:** `DOCENTE_AGGREGATO`.
- **Target Scope:** Scoped to the teacher's profile (`focus.docente`), with aggregated subjects across all assigned classes (`destinatario.contesto.cattedre` / `focus.docente.cattedre`).
- **Use cases:** Teacher comprehensive schedule, individual annual workload summary.

#### 3. `PIANO_PERSONALIZZATO`
- **Target Unit:** Each individual personalized learning plan (PDP/PEI/PFP) belonging to an active student.
- **Recipe:** `PIANO_PERSONALIZZATO`.
- **Target Scope:** `focus.alunno` + `focus.piano`.
- **Constraint:** `CONF_DOC.TIPO` MUST be `PIANO_PERS`. `MODELLI` must contain 5 conditional branches matching `TipoPiano`.
- **Use cases:** PDP DSA, PDP BES, PDP Stranieri, PEI, PFP generation.

#### 4. `CLASSE_MATERIA`
- **Target Unit:** Each distinct subject assigned in an active class (regardless of how many teachers teach it).
- **Recipe:** `CLASSE_MATERIA`.
- **Target Scope:** `focus.classe` + `focus.materia` + `focus.classiMateria.docenti`.
- **Constraint:** If substitutions are present, ACL permissions and body texts resolve via `PERMESSI.regolaSupplente` (`SOLO_SUPPLENTI` or `ENTRAMBI`).
- **Use cases:** Subject syllabus for a class, class subject register.

#### 5. `CLASSE_DOCENTE`
- **Target Unit:** Each distinct `(classe, docente)` pair across all active classes. A teacher teaching multiple subjects in the same class receives exactly **one document for that class**.
- **Recipe:** `CLASSE_DOCENTE` (`CLASSE_COMPLETA` + `docenteClasseFocusProvider`).
- **Target Scope:** `focus.classe` + `focus.docente` (representing the teacher's role within that specific class).
- **Use cases:** Teacher's evaluation report for a specific class, subject-agnostic teacher-class assignment letter.

#### 6. `CLASSE_DOCENTE_MATERIA`
- **Target Unit:** Each role-resolved triple `(classe, docente, materia)` in the active teaching assignments.
- **Recipe:** `CLASSE_DOCENTE_MATERIA`.
- **Target Scope:** `focus.classe` + `focus.docente` + `focus.materia`.
- **Use cases:** Final subject program per teacher per class ("Programma svolto").

#### 7. `DIPARTIMENTO`
- **Target Unit:** Each row in the `DIPART` table.
- **Recipe:** `DIPARTIMENTO_COMPLETO`.
- **Target Scope:** `focus.dipartimento` (`anagrafica`, `capo`, `materie`, `docenti`, `didattica.documenti`). No class dimension.
- **Use cases:** Department minutes, department curriculum planning.

#### 8. `ALUNNO`
- **Target Unit:** Each active student in `ALUNNI`.
- **Recipe:** `ALUNNO_COMPLETO`.
- **Target Scope:** `focus.alunno` (with complete profile, curriculum, didattica, plans, grades/carenze).
- **Use cases:** Student portfolio, individual report dossier, formal certificate.

---

## 5. Rendering Engine & Feature Composition

The previous static Strategy Registry is replaced by a deterministic **Strategy Factory Pipeline**.

```
                           [Document Config]
                                   │
                                   ▼
                       Check FORMATO enum
                        /              \
                   GDOC                  GSHEET
                    │                      │
                    ▼                      ▼
        DocGenericoStrategy      FoglioGenericoStrategy
                    │                      │
       PARAMETRI.tabelleImportate?    PARAMETRI.aggiungiMaterie /
                                       aggiungiMaterieConPermessi?
             /            \         /          |            \
          true           false   none   aggiungiMaterie  aggiungiMaterieConPermessi
           │               │      │           │                   │
           ▼               ▼      ▼           ▼                   ▼
      Wrapped with     DocGenerico FoglioGenerico  SheetMaterie    SheetMaterie
     DocumentoCon-                 (no columns)    Generico        ConPermessi
   TabelleImportate                                (columns,       (columns +
                                                      no ACL)        ACL)
```

### 5.1 `PARAMETRI` Schema & Defaults

```typescript
export interface MateriePermessiConfig {
  sheetName?: string;                 // Optional: target tab name (default: active/first tab)
  gestioneSupplenti?: GestioneSupplenti; // Optional override for column ACL resolution
}

export interface DocumentoParametri {
  /** Enables dynamic subject columns on Google Sheets, with NO cell-range protection. */
  aggiungiMaterie?: boolean;

  /** Enables dynamic subject columns + cell-range protections on Google Sheets. */
  aggiungiMaterieConPermessi?: boolean | MateriePermessiConfig;

  /** Enables {{TABELLA:<sheetFileId>}} placeholder replacement in Google Docs. */
  tabelleImportate?: boolean;
  
  /** Extensible key-value pairs for domain-specific parameters */
  [key: string]: unknown;
}
```

`aggiungiMaterie` and `aggiungiMaterieConPermessi` are mutually exclusive — together they replace the single retired `materiePermessi` flag, split by whether the added subject columns carry cell-range ACL protection (see §5.2 rule 4).

### 5.2 Validation Rules & Invariant Errors

1. **Format Compatibility:**
   - If `FORMATO === 'GSHEET'` and `PARAMETRI.tabelleImportate === true`, throw `ConfigurationError("L'importazione tabelle è supportata unicamente su formato GDOC")`.
   - If `FORMATO === 'GDOC'` and (`PARAMETRI.aggiungiMaterie` or `PARAMETRI.aggiungiMaterieConPermessi`) is truthy, throw `ConfigurationError("Le colonne materie sono supportate unicamente su formato GSHEET")`.
2. **Axis Relevance:**
   - If `GENERATORE === 'DIPARTIMENTO'` and (`PARAMETRI.aggiungiMaterie` or `PARAMETRI.aggiungiMaterieConPermessi`) is truthy, throw `ConfigurationError("Le colonne materie non sono applicabili all'asse DIPARTIMENTO (nessun consiglio di classe)")`.
3. **Mandatory Fields:**
   - Missing or invalid `FORMATO` (not in `GDOC | GSHEET`) throws `ConfigurationError`.
   - Missing or invalid `GENERATORE` (not in `GeneratoreAxis`) throws `ConfigurationError`.
4. **Flag Exclusivity:**
   - If both `PARAMETRI.aggiungiMaterie` and `PARAMETRI.aggiungiMaterieConPermessi` are truthy, throw `ConfigurationError("aggiungiMaterie e aggiungiMaterieConPermessi sono mutuamente esclusivi")`.

---

## 6. Axis-Aware Role Resolution (`PERMESSI`)

ACL permissions in `CONF_DOC.PERMESSI` map abstract role strings to Drive access levels (`SCRITTURA`, `LETTURA`, `COMMENTO`).

### 6.1 Available Abstract Roles per Axis

```
┌─────────────────────────┬────────────────────────────────────────────────────────────────────────┐
│ Axis                    │ Valid & Meaningful Abstract Roles in PERMESSI                          │
├─────────────────────────┼────────────────────────────────────────────────────────────────────────┤
│ CLASSE                  │ COORDINATORI, CDC, DOCENTI_NO_RELIGIONE, DOCENTI_IRC_ALT,              │
│                         │ SEGRETARIO_CDC, TUTOR_ASL, TUTOR_ORIENT, RAPPRESENTANTI_STUDENTI,      │
│                         │ GENITORI_CLASSE, CAPO_ISTITUTO, RAPPRESENTANTI_GENITORI                │
│ DOCENTE                 │ DOCENTE_CORRENTE, CAPO_ISTITUTO                                        │
│ PIANO_PERSONALIZZATO    │ COORDINATORI, CDC_FILTER_ALUNNO, ALUNNO, FAMIGLIA, REF_BES,            │
│                         │ CAPO_ISTITUTO                                                          │
│ CLASSE_MATERIA          │ DOCENTE_MATERIA, COORDINATORI, CAPO_ISTITUTO                           │
│ CLASSE_DOCENTE          │ DOCENTE_CORRENTE, COORDINATORI, CAPO_ISTITUTO                          │
│ CLASSE_DOCENTE_MATERIA  │ DOCENTE_CORRENTE, DOCENTE_MATERIA, COORDINATORI, CAPO_ISTITUTO         │
│ DIPARTIMENTO            │ CAPO_DIPART, DOCENTI_DIPARTIMENTO, CAPO_ISTITUTO                       │
│ ALUNNO                  │ ALUNNO, FAMIGLIA, COORDINATORI, CDC_FILTER_ALUNNO, CAPO_ISTITUTO       │
└─────────────────────────┴────────────────────────────────────────────────────────────────────────┘

CAPO_ISTITUTO and VICEPRESIDE (not in table) are always valid.
```

### 6.2 New & Updated Abstract Role Definitions

1. **`CAPO_DIPART`:**
   - **Resolution Source:** Reads `cdu.focus.dipartimento.capo.email` (if populated).
   - **Fallback:** If `focus.dipartimento` is absent or `cdu.meta.parametriInput.materiaCorrente` is supplied in a subject context, resolves the department head responsible for that subject via `dipartimentoRepository.findByMateria(materiaId)`.
2. **`DOCENTE_CORRENTE`:**
   - **Resolution Source:** Reads `cdu.focus.docente.email`.
   - **Behavior:** Yields an array with the single `Email` of the active teacher in focus.

---

## 7. Implementation Breakdown & Code Changes

### 7.1 Domain Layer
- **`src/domain/value-objects/enums.ts`**:
  - Add `GeneratoreAxis` enum (`CLASSE`, `DOCENTE`, `PIANO_PERSONALIZZATO`, `CLASSE_MATERIA`, `CLASSE_DOCENTE`, `CLASSE_DOCENTE_MATERIA`, `DIPARTIMENTO`, `ALUNNO`).
  - Update `FormatoOutput` or declare `FormatoDocumento` (`GDOC`, `GSHEET`).
- **`src/domain/entities/ConfigurazioneDocumento.ts`**:
  - Property `generatore: GeneratoreAxis` (typed enum).
  - Property `formato: FormatoDocumento`.
  - Update `getParametri()` returning typed `DocumentoParametri`.
  - Validate `generatore` and `formato` in `fromData()`.

### 7.2 Application Layer
- **`src/application/strategies/`**:
  - Delete `VerbaleGeneratorStrategy.ts`.
  - Ensure `DocumentoGenericoGeneratorStrategy`, `FoglioGenericoGeneratorStrategy`, `DocumentoConTabelleImportateGeneratorStrategy`, and `SheetMaterieConPermessiGeneratorStrategy` accept modular invocation options.
- **`src/application/factories/DocumentStrategyFactory.ts`**:
  - Create strategy factory implementing the resolution algorithm from §5.
- **`src/application/services/DocumentGenerationService.ts`**:
  - Replace `strategyRegistry` map with `DocumentStrategyFactory`.
  - Map `config.generatore` directly to recipe execution:
    - `generateForClasse(...)`
    - `generateForDocente(...)` [New]
    - `generateForPiano(...)`
    - `generateForClasseMateria(...)`
    - `generateForClasseDocente(...)` [New]
    - `generateForDocenteClasseMateria(...)`
    - `generateForDipartimento(...)`
    - `generateForAlunno(...)`
- **`src/application/services/DocumentBatchService.ts`**:
  - Refactor `batchGenerateHandler` switch statement to dispatch on `config.generatore`.
  - Add checkpoint target collections for `docenteTargets` and `classeDocenteTargets`.
  - Maintain backward compatibility for resumed checkpoints.
- **`src/application/services/RisolutoreRuoliService.ts`**:
  - Register `CAPO_DIPART` / `DIPART.CAPO`.
  - Register `DOCENTE_CORRENTE`.
  - Register `DOCENTI_DIPARTIMENTO`.
- **`src/application/context-engine/Recipe.ts`**:
  - Add recipe `DOCENTE_AGGREGATO` for the `DOCENTE` axis.
  - Add recipe `CLASSE_DOCENTE` for the `CLASSE_DOCENTE` axis.

### 7.3 Infrastructure & Composition Root
- **`src/config/Bootstrap.ts` & `src/config/ApplicationComposition.ts`**:
  - Wire `DocumentStrategyFactory` and remove legacy strategy registrations.
- **`SPECS_ALDO/01_SCHEMA_DATABASE.md` & `03_VALUE_OBJECTS_ED_ENUM.md`**:
  - Synchronize specifications to reflect `CONF_DOC.GENERATORE` as `GeneratoreAxis` and `CONF_DOC.FORMATO` as `GDOC | GSHEET`.

---

## 8. Verification & Test Plan

1. **Unit Tests (`test/unit/`):**
   - **`ConfigurazioneDocumento.test.ts`**: Verify parsing and validation of all 8 axes and both formats; test error on invalid values.
   - **`DocumentStrategyFactory.test.ts`**: Test combinations of `FORMATO` and `PARAMETRI` (`aggiungiMaterie`, `aggiungiMaterieConPermessi`, `tabelleImportate`), including invalid combination checks.
   - **`DocumentBatchService.test.ts`**: Test batch execution generators across all 8 axes; verify correct target enumeration, progress calculation, and checkpoint resumption.
   - **`RisolutoreRuoliService.test.ts`**: Verify resolution of `CAPO_DIPART`, `DOCENTE_CORRENTE`, and `DOCENTI_DIPARTIMENTO` under various CDU conditions.
2. **Integration Tests (`test/integration/`):**
   - Execute end-to-end document generation pipelines for each axis with mock Drive and Sheets adapters.
3. **Type & Lint Checks:**
   - Execute `npm run typecheck` and `npm run lint`.
