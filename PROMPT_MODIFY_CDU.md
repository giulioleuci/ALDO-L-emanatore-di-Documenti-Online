# TASK: WorkspaceTemplateEngine-Oriented CDU Restructuring (placeholders, loops, and filters)

## Context & Objectives

The CDU (*Contesto Dati Unificato* / Unified Data Context) is the JSON structure passed to `WorkspaceTemplateEngine` to produce official documents (PDP, PEI, CDC minutes, etc.) and email notifications. **The CURRENT structure is described in `SPECS_ALDO/02_CDU_STRUTTURA.md`** (the active specification document in the repository, source of truth for CDU paths).

The current structure is correct from a data perspective, but it is NOT designed for primary consumption by the template engine:

- It uses **maps with dynamic keys** (`focus.alunno.curriculum["[MateriaId]"].specifiche`, `focus.classe.studenti.perSpecificita["[MateriaId]"]["[specifica]"]`) which CANNOT be addressed in placeholders without hardcoding the ID;
- It exposes **incomplete personal data structures** (`coordinatori: { nome, email, materia, appellativo }`, `anagrafica: { nome, cognome, email, genere, appellativo }` in CDC, `sostituisce: { nome, email }`): missing surname/gender/declension, forcing templates to concatenate or infer;
- It lacks **semantic partitions** (COMUNE/SEPARATO, PRIMA/SECONDA prova, ITP), which would lead to `where`/`exclude` filters with hardcoded domain values;
- It does not expose **precomputed strings/labels** (`appellativoCompleto`, `materieDescrizione`, `tipoLabel`, `religioneLabel`, `docentiDescrizione`), forcing concatenations inside templates;
- It lacks sections now required by real generators (`esame`, `progetti`, `storico`, flat `materie[]` catalog, `materiePerPrincipale`, `partner` projection, `sheet.materieColonne`).

**Objective:** Restructure the entire CDU so that:
1. `WorkspaceTemplateEngine` is the PRIMARY consumer: every printable/iterable data point is reachable via a short, stable path, perfectly usable in structural loops (`bullet_list`, `number_list`, `tablerow_loop`, `tablecol_loop`, `dynamic_rows`, `dynamic_columns`) and pipe filters.
2. In placeholders **there must NEVER appear a hardcoded ID, address, name, email, or abbreviation**: everything is resolved by the CDU.
3. Placeholders are never excessively long: repetitive parts (even 1:1 copies) live in the CDU, not in the template.
4. **Simplicity of placeholders prevails over CDU compactness**.

The structural target is `02_CDU_STRUTTURA_NEW_OTTIMIZZATA.md`. This document lists ALL modifications to apply to bring the current structure (`SPECS_ALDO/02_CDU_STRUTTURA.md`) to that target, providing before/after pairs for each node and validation rules.

> **Note on the migration path:** An intermediate form exists (`02_STRUTTURA_CDU_NEW.md`) which already introduces modernization (PersonVM/SubjectVM, `materie[]` catalog, `esame`, `progetti`, `storico`, `partner` projection). The target `02_CDU_STRUTTURA_NEW_OTTIMIZZATA.md` incorporates that modernization **and** adds optimization for the template engine. Since the current structure is the original version, this report describes the complete delta from original → target (modernization + optimization), without assuming the intermediate form is already applied.

**CRITICAL DIRECTIVES:**
1. **THOROUGH CODE ANALYSIS BEFORE MODIFICATIONS:** Before making any changes, carefully analyze the codebase to ensure that the provided instructions are correct and consistent with existing system logic. Use "superpowers" skills, codebase-memory-mcp and systematic code inspection to verify existing implementations, paths, types, and logic before proceeding with modifications.
2. **NO BACKWARD COMPATIBILITY NEEDED:** The system is not in production. Completely remove old forms (dynamic key maps `curriculum` and `perSpecificita`, `studenti.perIndirizzo`, `studenti.indirizziPresenti`, partial personal data structures) without any backward compatibility layer.
3. **VERIFICATION FIRST:** Before writing or modifying code, verify in the codebase whether requested structures or helpers already partially exist (e.g. `materieDescrizione`, `consiglioDiClasseComune`/`consiglioDiClasseSeparato` already used in `E2eTemplateProvisioner.ts`, `elencoMaterieConPermessi` in `MAT_NON_STANDARD.md`) to avoid duplication.
4. **ALL SPECIFICATIONS UPDATE:** Update ALL specification files in `SPECS_ALDO/` (including `01_SCHEMA_DATABASE.md`, `02_CDU_STRUTTURA.md`, `MAT_NON_STANDARD.md`) to align them with the new forms, making `02_CDU_STRUTTURA_NEW_OTTIMIZZATA.md` the source of truth for CDU paths.
5. **TESTS & MOCKS UPDATE:** Update all mock data, fake db, unit tests, context engine tests, and integration tests (offline and online) to the new CDU structure.
6. **SUPERPOWERS**: Use superpowers skills.

---

## SECTION 1: RESTRUCTURING PRINCIPLES (Binding Rules)

The CDU must be designed around the capabilities of `WorkspaceTemplateEngine`:

| Engine capability | Usage in CDU |
| :--- | :--- |
| Flat replacement `{{path.value}}` | Scalar data on short and stable paths |
| Sections `{{#array}}...{{/array}}`, `{{^array}}` | Iteration/condition on arrays or `hasXxx` booleans |
| Structural loops `{{#bullet_list:path}}`, `{{#number_list:path}}`, `{{#tablerow_loop:path}}`, `{{#tablecol_loop:path}}` | Any list to render as list or table |
| Loop Sheets `{{dynamic_rows[source=...,value=...]}}`, `{{dynamic_columns[...]}}` | Expansion of dynamic rows/columns |
| Pipe filters `{{value \| filter:args}}`, `{{#loop:path \| filter:args}}` | **Presentation only** (sortBy, uppercase, join, map, limit, ...) |
| `where`/`exclude` filters with arguments | **Restricted to boolean/shape properties** (`where:'isBes',true`); NEVER with domain values |

Binding rules (detailed in target §0):

- **P1. Array-first.** Every loop source is an array at a stable path. Dynamic key maps that can be iterated are transformed into array of records.
- **P2. 1:1 Denormalization inside items.** Every element of an array carries the context that the template might serve (class name, branch name, `appellativoCompleto`, ...) even if it is a 1:1 copy of data present elsewhere in the CDU. Inside a loop, placeholders must remain very short and never require parent navigation (`../`) or long absolute paths.
- **P3. Precalculated semantic partitions.** Groupings based on *domain values* (COMUNE/SEPARATO, PRIMA/SECONDA prova, ITP) are pre-split into dedicated arrays by the CDU.
- **P4. Precalculated strings and labels.** The CDU exposes ready-to-print text forms (`appellativoCompleto`, `materieDescrizione`, `tipoLabel`, `religioneLabel`, `docentiDescrizione`, ...).
- **P5. Companion booleans.** Every array on which a template might want to branch has a companion boolean `hasXxx`.
- **P6. Placeholder length budget.** Inside loops: ≤ 2-3 segments. Outside loops: ≤ 4 segments. Any longer path must be reduced by denormalization.

---

## SECTION 2: STRUCTURAL CHANGES TO THE CDU (delta original → target)

For each area: **CURRENT** (`SPECS_ALDO/02_CDU_STRUTTURA.md`) → **TARGET** (`02_CDU_STRUTTURA_NEW_OTTIMIZZATA.md`).

### 2.1 `meta` Section — minimal change

- **Current:** already structured with `date.oggi.*`, `configurazioneBox`, `parametriInput.opzioni` (includiStorico, profondita*, includiSupplenti, includiSpecificita, notificaSoloCoordinatori).
- **Target:** form unchanged. Add:
  - `parametriInput.opzioni.includiPartnerDettaglio: boolean` — enables disaggregated projection `focus.classe.partner` (§2.5).
  - Note: `meta.parametriInput.opzioni` is declared **not used by templates** (`# Technical`), templates must not read it.
- **Reason:** supports the new `partner` node; the rest was already oriented toward the template engine.

### 2.2 `istituto` Section — PersonVM in staff

- **Current:**
  ```
  istituto.staff:
    referenteBes        — e.g., ROSSI MARIO   (free text)
    animatoreDigitale   — e.g., BIANCHI LUIGI (free text)
  istituto.organizzazione.dirigente          (untyped form)
  ```
- **Target:**
  ```
  istituto.organizzazione:
    annoScolastico: string
    dirigente: { nomeCompleto: string }   # "Prof.ssa Maria Bianchi"
  istituto.staff:
    referenteBes: PersonVM | null       (§8.1)
    animatoreDigitale: PersonVM | null  (§8.1)
  ```
- **Reason (P4):** staff is currently an uppercase string unusable as a direct template placeholder. With `PersonVM`, templates print `{{istituto.staff.referenteBes.appellativoCompleto}}` etc.
- **✎ OPTIMIZED:** `istituto.organizzazione.annoScolastico` is **copied 1:1** into `focus.classe.anagrafica.annoScolastico` (Principle 2) — §2.3.

### 2.3 `focus.classe.anagrafica` — self-containment

- **Current:**
  ```
  anagrafica: { nome, anno, sezione, indirizzo: { nome, nomeSintetico, sigla, tipo } }
  ```
- **Target:** add:
  ```
  anagrafica.annoScolastico: string   # 1:1 copy of istituto.organizzazione.annoScolastico
  ```
- **Reason (P2):** templates operating on `focus.classe.*` do not need to navigate up to `istituto.*`; `{{focus.classe.anagrafica.annoScolastico}}` remains short and local.

### 2.4 `focus.classe.articolazione` — from abbreviations to SubjectVM, structured parent

- **Current:**
  ```
  articolazione:
    partner: ClasseId | null
    partners: ClasseId[] | null
    parent: ClasseId | null
    materieCondivise: string[]            # array of sigle
    materieSeparatePrimoGruppo: string[]  # array of sigle
    materieSeparateSecondoGruppo: string[]# array of sigle
  ```
- **Target:**
  ```
  articolazione:
    partner: string | null
    partners: string[] | null
    parent: { id, anno, indirizzi: [ { sigla, nome, nomeSintetico, tipo } ] } | null
    materieCondivise: SubjectVM[]            # with docenti[] + docentiDescrizione (§8.2)
    materieSeparatePrimoGruppo: SubjectVM[]  # same
    materieSeparateSecondoGruppo: SubjectVM[]# same
  ```
- **Reason (P1 + P4):** subjects are no longer string abbreviations but printable/iterable objects (`{{#materieCondivise}}{{nome}}: {{docentiDescrizione}}{{/materieCondivise}}`). `parent` becomes descriptive: partner branches are iterable (`{{#parent.indirizzi}}{{nomeSintetico}}{{/parent.indirizzi}}`) without looking up the catalog.
- **Note:** `partner`/`partners` remain string IDs (technical/identification usage), NEVER used to filter inside templates.

### 2.5 DISAGGREGATED PARTNER PROJECTION — new node

- **Current:** absent.
- **Target:** when `isArticolata = true` and `includiPartnerDettaglio = true`:
  ```
  focus.classe.partner:
    primo: SingleClassProjection    # anagrafica, CDC, studenti, coordinatori of 1st partner
    secondo: SingleClassProjection  # same for 2nd partner
  ```
  where `SingleClassProjection` reuses the same View Models (§8: `anagrafica`, `consiglioDiClasse: DocenteCdcVM[]`, `studenti.listaCompleta: StudentVM[]`, `coordinatori` — aggregate container §2.6, ...).
- **Reason (P3):** allows rendering sections per single partner without filtering by address/abbreviation inside the template.

### 2.6 `coordinatori` and `tutor` — PersonVM + aggregate declension strings

- **Current:**
  ```
  coordinatori: [ { nome, email, materia, appellativo } ]      # missing cognome/genere/nomeCompleto
  tutor:
    asl: [ { nome, email } ]
    orientamento: [ { nome, email } ]
  ```
- **Target:** the plural metadata wrappers (`coordinatoriMetadata`, `tutorMetadata`) are **removed**; their fields move **directly onto** the `coordinatori`/`tutor` nodes as aggregate declension strings computed from the people present (gender and count).
  ```
  coordinatori:
    appellativo: string          # "prof.sse" if all F and >=2; "prof.ssa" if all F and 1; otherwise "prof."
    articolo: string             # "le" if all F and >=2; "la" if all F and 1; otherwise "i" (>=2) / "il" (1)
    coordina: string             # "coordinano" if >=2 people, "coordina" if 1
    presiede: string             # "presiedono" if >=2 people, "presiede" if 1
    elenco: PersonVM[]           # individual coordinators (full PersonVM, §8.1)
  tutor:
    appellativo: string          # same rules as coordinatori, over asl ∪ orientamento
    articolo: string             # same rules as coordinatori
    tutor: string                # always "tutor" (for now)
    asl: PersonVM[]
    orientamento: PersonVM[]
  ```
- **Reason (P4):** standardized personal data structures for direct printing; the aggregate declension strings (gender-aware salutation/article and verb forms) are precomputed in the CDU directly on the `coordinatori`/`tutor` nodes, so the intermediate `*Metadata` wrappers are dropped. The individual `PersonVM` entries keep all their properties untouched (they live under `coordinatori.elenco` and `tutor.asl`/`tutor.orientamento`).
- **Aggregate rules (from target §8.1):** computed over the people present — for `coordinatori` over `elenco`; for `tutor` over the union `asl ∪ orientamento`. **Not exposed when the list is empty.**
  - `appellativo`: all `F` and ≥2 → `prof.sse`; all `F` and 1 → `prof.ssa`; otherwise → `prof.`
  - `articolo`: all `F` and ≥2 → `le`; all `F` and 1 → `la`; otherwise → `i` (≥2) / `il` (1)
  - `coordina`/`presiede` (only on `coordinatori`): 1 person → `coordina`/`presiede`; ≥2 → `coordinano`/`presiedono`
  - `tutor.tutor`: always `tutor` (for now)

### 2.7 `consiglioDiClasse` — standardized item `DocenteCdcVM` + partitions

- **Current** (item):
  ```
  anagrafica: { nome, cognome, email, genere, appellativo }
  materie:    [ { sigla, nome, colore, specificita } ]
  ruoli / stato: { isSupplente, sostituisce: { nome, email } | null }
  tipoArticolazione / isITP / flags.isNotLast
  ```
- **Target** (item `DocenteCdcVM`, §8.4):
  ```
  anagrafica: PersonVM          # with appellativoCompleto, appellativoCognome
  materie: SubjectVM[]          # with nomeSintetico, colore1/2, isMateriaPrimaProva/SecondaProva,
                                # principale, specificita, isITP, hasItp, evoluzione
  materieDescrizione: string    # "Italiano, Storia" (join of materie.nomeSintetico)
  materieSigle: string          # "ITA, STO" (join of materie.sigla)
  ruoli: { isCoordinatore, isTutorAsl, isTutorOrientamento, descrizione: string[] }
  stato: { isSupplente, sostituisce: PersonVM | null }
  tipoArticolazione: string | null
  gruppoNome: string | null     # "Gruppo comune" | "Gruppo 1" | "Gruppo 2" (for articulated classes)
  isITP: boolean
  flags: { isNotLast }
  ```
- **Target (NEW, P3)** — for articulated classes:
  ```
  focus.classe.consiglioDiClasseComune: DocenteCdcVM[]   # teachers with tipoArticolazione = COMUNE
  focus.classe.consiglioDiClasseSeparato: DocenteCdcVM[] # teachers with SEPARATO_PRIMO or SEPARATO_SECONDO
  ```
- **Reason (P3 + P4):** template iterates `{{#bullet_list:focus.classe.consiglioDiClasseComune}}` without `| where:'tipoArticolazione','COMUNE'`. `materieDescrizione`/`materieSigle` replace nested string concatenation loops.
- **Note:** `consiglioDiClasseComune`/`Separato` are **only for articulated classes**; for standard classes CDC remains single in `consiglioDiClasse[]`.

### 2.8 Class Subject Catalog — new node

- **Current:** absent (subjects exist only inside `consiglioDiClasse[].materie[]`).
- **Target:**
  ```
  focus.classe.materie: SubjectVM[]     # flat array of all active subjects, each with:
    - docenti: PersonVM[]
    - docentiDescrizione: string        # "Mario Rossi, Laura Gialli"
    - hasItp: boolean
    - continuita: ContinuitaVM          # if includiStorico = true
  focus.classe.materiePerPrincipale:
    - idFittizio, nome, materie: SubjectVM[]
  ```
- **Reason (P1):** `{{#tablerow_loop:focus.classe.materie}}{{sigla}},{{nome}},{{docentiDescrizione}}{{/tablerow_loop}}`; `materiePerPrincipale` groups specificities (e.g. Chitarra/Flauto) under the primary subject without template logic.

### 2.9 `esame` Section — new section with partitions per exam paper

- **Current:** absent.
- **Target:**
  ```
  focus.classe.esame:
    hasEsame: boolean                    # true iff esame.materie is non-empty (P5)
    materie: [ SubjectVM + prova + docenti: PersonVM[] + docentiDescrizione ]
    docenti: [ PersonVM + prova + materie: SubjectVM[] ]
    materiePrimaProva: SubjectVM[]       # only prova = "PRIMA_PROVA"
    materieSecondaProva: SubjectVM[]     # only prova = "SECONDA_PROVA"
    docentiPrimaProva: PersonVM[]        # only prova = "PRIMA_PROVA"
    docentiSecondaProva: PersonVM[]      # only prova = "SECONDA_PROVA"
  ```
- **Reason (P3 + P5):** `{{#bullet_list:focus.classe.esame.materiePrimaProva}}...{{/bullet_list}}` without `| where:'prova','PRIMA_PROVA'`; `{{#hasEsame}}/{{^hasEsame}}` for branching.

### 2.10 `progetti` — new with labels

- **Current:** absent.
- **Target:**
  ```
  focus.classe.hasProgetti: boolean
  focus.classe.progetti: ProgettoVM[]    # §8.5
    - tipo: string             # "ASL" | "ORIENTAMENTO" | "ALTRO"
      tipoLabel: string        # "PCTO/ASL" | "Orientamento" | "Altro"
      nome / referente: PersonVM / ore / oreAsl / isAsl
  ```
- **Reason (P4 + P5):** `{{tipoLabel}}: {{nome}}` instead of hardcoded text mapping in template.

### 2.11 History — new nodes `ClasseStoricoVM` and `StudentStoricoVM`

- **Current:** absent (`CLASSI.STORICO` not exposed; no student history).
- **Target:**
  ```
  focus.classe.storico: ClasseStoricoVM | null   # if includiStorico = true (§8.6)
    statistiche: [ { annoScolastico, classe, statistiche } ]
    progetti: [ { annoScolastico, classe, progetti: ProgettoVM[] } ]

  focus.alunno.storico: StudentStoricoVM | null  # if includiStorico = true (§8.6)
    anni: [ { annoScolastico, classe, esito } ]
    pianiPrimoAnnoPrecedente: [ { tipo, tipoLabel } ]    # records, not string[]
    pianiSecondoAnnoPrecedente: [ { tipo, tipoLabel } ]  # records, not string[]
    bocciature: [ { annoScolastico, classe } ]
    hasBocciature: boolean
  ```
- **Reason (P4 + P5):** `{{#focus.alunno.storico.hasBocciature}}`; historical plans as printable (`{{tipoLabel}}`) and iterable records.
- **✎ RESTRUCTURED:** relative to intermediate form, `pianiPrimoAnnoPrecedente`/`pianiSecondoAnnoPrecedente` change from `string[]` to `{ tipo, tipoLabel }[]`.

### 2.12 `studenti.listaCompleta` — self-contained item `StudentVM`

- **Current** (item):
  ```
  anagrafica: { nomeCompleto, email }
  status:     { isBes, isRipetente, isRappresentante, religione }
  curriculum: { "[MateriaId]": { specifiche: string[] } }
  didattica:  { carenze, piani: { hasPiani, hasBes, items: [{ tipo, isBes }] }, pcto }
  ```
- **Target** (item `StudentVM`, §8.7):
  ```
  anagrafica: { nomeCompleto, email }
  classe:     { nome }                    # ✎ 1:1 copy of focus.classe.anagrafica.nome
  indirizzo:  { nome, nomeSintetico }     # ✎ 1:1 copies of focus.classe.anagrafica.indirizzo.*
  status:
    isBes / isRipetente / isRappresentante
    religione: string                     # "IRC" | "ALT" | "NO"
    religioneLabel: string                # ✎ "Religione cattolica" | "Attività alternativa" | "Non si avvale"
  curriculum: CurriculumVM[]              # ✎ array (see §2.13)
  didattica:
    carenze: { hasCarenze, numero, dettaglio: [ { materia, materiaNome, voto } ] }  # ✎ materiaNome
    piani:   { hasPiani, hasBes, items: [ { tipo, tipoLabel, isBes } ] }            # ✎ tipoLabel
    pcto:    { oreCumulate }
  storico: StudentStoricoVM | null        # if includiStorico = true
  ```
- **Reason (P2):** inside a `tablerow_loop`, placeholders remain `{{anagrafica.nomeCompleto}}`, `{{status.religioneLabel}}`, `{{classe.nome}}` — pattern already used in `E2eTemplateProvisioner.ts`.
- **Remove:** nothing in original item (`curriculum` is restructured); `perIndirizzo`/`indirizziPresenti` are under `studenti` (§2.14).

### 2.13 `curriculum` (student and students) — from map to array `CurriculumVM`

- **Current:**
  ```
  focus.alunno.curriculum: { "[MateriaId]": { specifiche: string[] } }
  focus.classe.studenti.listaCompleta[].curriculum: { "[MateriaId]": { specifiche: string[] } }
  ```
- **Target** (`CurriculumVM`, §8.8 — identical structure in both locations):
  ```
  curriculum: [
    {
      materiaId: string        # e.g. "INTERPRETAZIONE" (technical/log use, does not discriminate in templates)
      materiaSigla: string     # e.g. "INT" (exposed as data, never as key)
      materiaNome: string      # e.g. "Esecuzione ed interpretazione"
      specifiche: [ { nome: string } ]   # e.g. { nome: "chitarra" }
    }
  ]
  ```
- **Reason (P1):** dynamic keys `"[MateriaId]"` are not addressable in placeholders without hardcoding IDs. With arrays, iteration is clean: `{{#focus.alunno.curriculum}}{{materiaNome}}: {{#specifiche}}{{nome | capitalize}}{{/specifiche}}{{/focus.alunno.curriculum}}`.
- **Data consistency:** `materiaSigla`/`materiaNome` resolved via `SubjectVM` mapper (§8.2) following `MATERIE.EVOLUZIONE` rules; `specifiche[].nome` shares value space with `MATERIE.SPECIFICA`.

### 2.14 `studenti.perSpecificita` — from double map to array; removals

- **Current:**
  ```
  perIndirizzo: { "[SIGLA_IND]": array of alunni }   # only articulated classes
  indirizziPresenti: string[]                        # only articulated classes
  perSpecificita: { "[MateriaId]": { "[specifica]": array of alunni } }   # if includiSpecificita
  ```
- **Target:**
  - `perIndirizzo` and `indirizziPresenti` → **REMOVED** (partner view covered by `focus.classe.partner` §2.5; branches are in `anagrafica.indirizzo` and `articolazione.parent.indirizzi`).
  - `perSpecificita` → 3-level iterable array (`SpecificitaAlunniVM`, §8.9):
    ```
    perSpecificita: [
      {
        materiaId: string
        materiaSigla: string
        materiaNome: string
        specifiche: [ { nome: string, alunni: PersonMinVM[] } ]
      }
    ]
    PersonMinVM: { nome, cognome, nomeCompleto, email }   # minimal person representation for compact lists
    ```
- **Reason (P1 + P6):** nested loops with concise placeholders: `{{#focus.classe.studenti.perSpecificita}}{{materiaNome}}: {{#specifiche}}{{nome}} ({{#alunni}}{{nomeCompleto}};{{/alunni}}){{/specifiche}}{{/focus.classe.studenti.perSpecificita}}`.
- **Validation rule:** any access to `perIndirizzo`/`indirizziPresenti` MUST fail (no legacy layer).

### 2.15 `focus.alunno` — rest of profile

- **`status.religione`:** enum changes from **`SI | NO | ALT`** to **`IRC | ALT | NO`**, with addition of `religioneLabel` (§2.12).
- **`consiglioDiClasseFiltrato`:** standardized items `DocenteCdcVM[]` (same structure as class CDC §2.7, incl. `materieDescrizione`, `gruppoNome`).
- **`didattica.carenze.dettaglio[].materiaNome`:** full subject name alongside abbreviation `materia`.
- **`didattica.piani.items[].tipoLabel`:** human-readable label alongside `tipo`.
- **`didattica.asl` / `didattica.documenti` / `focus.piano` / `focus.carenza`:** structure unchanged.

### 2.16 `destinatario` Section — PersonVM

- **Current:**
  ```
  anagrafica: { nome, cognome, nomeCompleto, email, appellativo, genere }
  contesto.sostituisce: { nome, email } | null
  ```
- **Target:**
  ```
  anagrafica: PersonVM              # §8.1 — includes articolo, coordinatore, materia,
                                    # appellativoCompleto, appellativoCognome
  contesto.sostituisce: PersonVM | null
  ```
- **Reason (P4):** `{{destinatario.anagrafica.appellativoCompleto}}` for greetings/formal documents; `sostituisce` is a complete person (declinable) rather than a couple of strings.
- Remaining fields (`ruoliAttivi`, `flags`, `contesto`, `comunicazione`) remain unchanged.

### 2.17 Sheets Projection — `focus.classe.sheet.materieColonne` (new)

- **Current:** only `elencoMaterieConPermessi` (array of columns, unchanged — `MAT_NON_STANDARD.md`).
- **Target (NEW):** when `SHEET_CON_MATERIE_E_PERMESSI` generator is active:
  ```
  focus.classe.sheet:
    materieColonne:
      group1: MateriaColumn[]        # grouping of IRC/ALT + primary subjects
      group2: MateriaColumn[]        # second group
      group3: MateriaColumn[]        # third group
      group2Label: string            # structural label before group2
      group3Label: string            # structural label before group3
  MateriaColumn: { sigla, header, isSpecial?, roles? }
  ```
  derived from `elencoMaterieConPermessi[]` (which remains unchanged as raw source).
- **Reason (P1):** directive `{{dynamic_columns[source=...,value=header,source2=...,value2=header,label2=...]}}` requires arrays at fixed paths; shape `group1/2/3 + label2/label3` is already validated in `E2eTemplateProvisioner.ts` (`sheetPermessiUpdates`).
- **Note (P3):** IRC/ALT aggregation logic stays in CDU (`isSpecial: true`), never rebuilt inside template.

### 2.18 Shared View Models — `✎ OPTIMIZED` enrichments

- **`PersonVM` (§8.1):** add `appellativoCompleto` and `appellativoCognome` to ALL persons (coordinators, tutors, contact persons, staff, CDC, continuity, exam, recipient, projects). For external experts (`genere: null`), these coincide with `nomeCompleto`.
- **`SubjectVM` (§8.2):** add `docentiDescrizione: string` (join of `docenti[].nomeCompleto`) where `docenti[]` is present (`materie[]`, `articolazione.*`, `esame.materie[]`).
- **`ProgettoVM` (§8.5):** add `tipoLabel` (§2.10).
- **`StudentStoricoVM` (§8.6):** historical plans as records `{ tipo, tipoLabel }` (§2.11).
- **`elencoMaterieConPermessi`:** unchanged (source for §2.17).

### 2.19 Unchanged Sections

- `render` (§6), `tech` (§7, with `enumerable: false`), `rappresentanti`, `statistiche`, `focus.piano` (§4.3), `focus.carenza` (§4.4), `meta.date.oggi.*` — form unchanged.

---

## SECTION 3: EXPECTED JSON STRUCTURE EXAMPLES

### 3.1 `coordinatori` container (aggregate declension strings + enriched `PersonVM` in `elenco`)
```json
{
  "focus": {
    "classe": {
      "coordinatori": {
        "appellativo": "prof.ssa",
        "articolo": "la",
        "coordina": "coordina",
        "presiede": "presiede",
        "elenco": [
          {
            "nome": "Maria", "cognome": "Bianchi", "email": "m.bianchi@scuola.edu.it",
            "genere": "F", "appellativo": "Prof.ssa", "articolo": "la",
            "coordinatore": "coordinatrice", "nomeCompleto": "Maria Bianchi",
            "materia": "Italiano",
            "appellativoCompleto": "Prof.ssa Maria Bianchi",
            "appellativoCognome": "Prof.ssa Bianchi"
          }
        ]
      }
    }
  }
}
```

### 3.2 `focus.classe.studenti.listaCompleta[0]` (self-contained item)
```json
{
  "focus": {
    "classe": {
      "anagrafica": {
        "nome": "5AB-LC-LS", "anno": 5, "sezione": "AB", "annoScolastico": "2025-2026",
        "indirizzo": { "sigla": "LC", "nome": "Liceo Classico", "nomeSintetico": "Classico", "tipo": "LICEO" }
      },
      "studenti": {
        "listaCompleta": [
          {
            "anagrafica": { "nomeCompleto": "Marco Neri", "email": "marco.neri@alunni.edu.it" },
            "classe": { "nome": "5AB-LC-LS" },
            "indirizzo": { "nome": "Liceo Classico", "nomeSintetico": "Classico" },
            "status": {
              "isBes": false, "isRipetente": false, "isRappresentante": true,
              "religione": "IRC", "religioneLabel": "Religione cattolica"
            },
            "curriculum": [
              {
                "materiaId": "INTERPRETAZIONE", "materiaSigla": "INT",
                "materiaNome": "Esecuzione ed interpretazione",
                "specifiche": [{ "nome": "chitarra" }]
              }
            ],
            "didattica": {
              "carenze": { "hasCarenze": false, "numero": 0, "dettaglio": [] },
              "piani": { "hasPiani": false, "hasBes": false, "items": [] },
              "pcto": { "oreCumulate": 60 }
            },
            "storico": {
              "anni": [{ "annoScolastico": "2024-2025", "classe": "4A-LC", "esito": "PROMOSSO" }],
              "pianiPrimoAnnoPrecedente": [{ "tipo": "PDP_DSA", "tipoLabel": "PDP DSA" }],
              "pianiSecondoAnnoPrecedente": [],
              "bocciature": [],
              "hasBocciature": false
            }
          }
        ]
      }
    }
  }
}
```

### 3.3 `focus.classe.studenti.perSpecificita` (3-level array)
```json
{
  "focus": {
    "classe": {
      "studenti": {
        "perSpecificita": [
          {
            "materiaId": "INTERPRETAZIONE", "materiaSigla": "INT",
            "materiaNome": "Esecuzione ed interpretazione",
            "specifiche": [
              {
                "nome": "chitarra",
                "alunni": [
                  { "nome": "Marco", "cognome": "Neri", "nomeCompleto": "Marco Neri", "email": "marco.neri@alunni.edu.it" },
                  { "nome": "Anna", "cognome": "Leone", "nomeCompleto": "Anna Leone", "email": "anna.leone@alunni.edu.it" }
                ]
              },
              { "nome": "flauto", "alunni": [] }
            ]
          }
        ]
      }
    }
  }
}
```

### 3.4 `focus.classe.esame` (partitions per exam paper)
```json
{
  "focus": {
    "classe": {
      "esame": {
        "hasEsame": true,
        "materie": [
          {
            "sigla": "ITA", "nome": "Lingua e letteratura italiana", "nomeSintetico": "Italiano",
            "colore1": "#005A9C", "colore2": "#E6F0FA",
            "isMateriaPrimaProva": true, "isMateriaSecondaProva": false,
            "principale": null, "specificita": null, "prova": "PRIMA_PROVA",
            "docenti": [
              {
                "nome": "Mario", "cognome": "Rossi", "email": "mario.rossi@scuola.edu.it",
                "genere": "M", "appellativo": "Prof.", "articolo": "il",
                "coordinatore": "coordinatore", "nomeCompleto": "Mario Rossi", "materia": null,
                "appellativoCompleto": "Prof. Mario Rossi", "appellativoCognome": "Prof. Rossi"
              }
            ],
            "docentiDescrizione": "Prof. Mario Rossi"
          }
        ],
        "materiePrimaProva": [],
        "materieSecondaProva": [],
        "docentiPrimaProva": [],
        "docentiSecondaProva": []
      }
    }
  }
}
```

### 3.5 `focus.classe.sheet.materieColonne` (`dynamic_columns` projection)
```json
{
  "focus": {
    "classe": {
      "sheet": {
        "materieColonne": {
          "group1": [
            { "sigla": "REL/ALT", "header": "REL/ALT", "isSpecial": true, "roles": ["IRC", "ALT"] },
            { "sigla": "ITA", "header": "ITA" }
          ],
          "group2": [{ "sigla": "MAT", "header": "MAT" }],
          "group3": [],
          "group2Label": "Materie",
          "group3Label": ""
        }
      }
    }
  }
}
```
Corresponding template directive:
```
{{dynamic_columns[source=focus.classe.sheet.materieColonne.group1,value=header,source2=focus.classe.sheet.materieColonne.group2,value2=header,label2=focus.classe.sheet.materieColonne.group2Label,source3=focus.classe.sheet.materieColonne.group3,value3=header,label3=focus.classe.sheet.materieColonne.group3Label]}}
```

---

## SECTION 4: REQUIRED ACTION ITEMS & DELIVERABLES

Perform the restructuring in the following sequence:

1. **View Model Builders (Person and Subject):**
   - Extend `PersonVM` builder with `appellativoCompleto` and `appellativoCognome` (§2.18), preserving gender/salutation/article/coordinator on each person. Compute the aggregate declension strings directly on `coordinatori` (`appellativo`, `articolo`, `coordina`, `presiede`) and `tutor` (`appellativo`, `articolo`, `tutor`) per §2.6, removing the `coordinatoriMetadata`/`tutorMetadata` wrappers.
   - Standardize all personal data structures currently in partial form onto `PersonVM`: `coordinatori`, `tutor.asl/orientamento`, `istituto.staff.referenteBes/animatoreDigitale`, `stato.sostituisce` in CDC and recipient, project `referente`, `continuita.*.titolare/itp`.
   - Verify and standardize `materieDescrizione`/`materieSigle`/`gruppoNome` in `DocenteCdcVM` (§2.7); check if `TeachingCouncilProjection`/`E2eTemplateProvisioner.ts` already supply them before reimplementing.
   - Add `docentiDescrizione` to `SubjectVM` in contexts containing `docenti[]` (§2.18).
   - Add `tipoLabel` to `ProgettoVM` and `piani.items[]`; add `religioneLabel` to student status (§2.10, §2.12, §2.15).

2. **Restructuring Mappers (map → array):**
   - Implement `CurriculumVM` (`curriculum` map → array) for `focus.alunno.curriculum` and `focus.classe.studenti.listaCompleta[].curriculum` (§2.13).
   - Implement `SpecificitaAlunniVM` (double map `perSpecificita` → 3-level array) (§2.14).
   - Update `StudentVM` with `classe.nome`, `indirizzo.*`, `religioneLabel`, `materiaNome` in carenze, `tipoLabel` in piani (§2.12).
   - Update `StudentStoricoVM`: `pianiPrimoAnnoPrecedente`/`pianiSecondoAnnoPrecedente` from `string[]` to `{tipo, tipoLabel}[]` (§2.11).

3. **Providers / Strategy:**
   - `SchoolProvider`: `staff.referenteBes`/`animatoreDigitale` → `PersonVM`; `dirigente` → `{ nomeCompleto }` (§2.2).
   - `ClasseProvider`: add `anagrafica.annoScolastico` (copied from `istituto.organizzazione.annoScolastico`) (§2.3).
   - `ArticolazioneProvider`: `parent` → descriptive object; `materieCondivise`/`materieSeparate*` → `SubjectVM[]` with `docenti[]`/`docentiDescrizione` (§2.4).
   - `ConsiglioClasseProvider`: items as `DocenteCdcVM` (incl. `materieDescrizione`, `materieSigle`, `gruppoNome`), `sostituisce` → `PersonVM|null`, partitions `consiglioDiClasseComune`/`consiglioDiClasseSeparato` for articulated classes (§2.7).
   - `PartnerProjection`: disaggregated projection `focus.classe.partner.{primo,secondo}` (enabled by `includiPartnerDettaglio`) (§2.5).
   - New `EsameProvider`: `hasEsame`, `materie[]`, `docenti[]`, `materiePrimaProva`/`materieSecondaProva`, `docentiPrimaProva`/`docentiSecondaProva` (§2.9).
   - `ProgettiProvider`: `hasProgetti`/`progetti[]` with `tipoLabel` (§2.10).
   - New `StoricoProvider`: `ClasseStoricoVM` on `focus.classe.storico`, `StudentStoricoVM` on `focus.alunno.storico` and `listaCompleta[].storico` (§2.11).
   - Removal of `perIndirizzo`/`indirizziPresenti` (§2.14).
   - Sheet Generators (`SheetMaterieConPermessiGeneratorStrategy`): expose `focus.classe.sheet.materieColonne` (group1/2/3 + label2/3) deriving it from `elencoMaterieConPermessi` (§2.17).

4. **Specifications (`SPECS_ALDO/`):**
   - Rewrite `02_CDU_STRUTTURA.md` according to `02_CDU_STRUTTURA_NEW_OTTIMIZZATA.md` (canonical target): new paths `curriculum[]`, `perSpecificita[]`, `esame.*`, `consiglioDiClasseComune/Separato`, `materie[]`, `materiePerPrincipale`, `progetti[]`, `storico.*`, `partner.*`, `sheet.materieColonne`; fields `appellativoCompleto`, `tipoLabel`, `religioneLabel`, `annoScolastico`, `docentiDescrizione`, `materiaNome`, `pianiPrimoAnnoPrecedente[{tipo,tipoLabel}]`. **Paths are the source of truth: every template/box expression MUST map to them.**
   - Update `MAT_NON_STANDARD.md` for the derivation of `sheet.materieColonne` from `elencoMaterieConPermessi`.
   - Update `01_SCHEMA_DATABASE.md` only if necessary for labels (no new DB tables/columns expected: labels derive from existing enums/codes).
   - Remove/deprecate `02_STRUTTURA_CDU_NEW.md` as intermediate form (superseded by target).

5. **Test Suite (offline + online):**
   - Update fixtures/mocks (`test/fixtures/tables.ts`, `test/fakes/FakeDatabase.ts`, `FAKEDB/*.csv`) to reflect new nodes.
   - Update context-engine test assertions: array shape for `curriculum` and `perSpecificita`, `esame` partitions, `consiglioDiClasseComune/Separato` partitions, label/description fields, `annoScolastico`, removal of `perIndirizzo`/`indirizziPresenti`.
   - Update Sheet generator tests for `sheet.materieColonne` and multi-group `dynamic_columns` directive.
   - Update e2e templates (`E2eTemplateProvisioner.ts`) and online checks (`src/onlinetests/checks/`) to new paths, including at least: looped `curriculum`, 3-level `perSpecificita`, `esame.materiePrimaProva`, `consiglioDiClasseComune/Separato`, `appellativoCompleto`, `tipoLabel`/`religioneLabel`.
   - Verify that NO template/box uses `where`/`exclude` with domain values or dynamic key paths (validation rule §9.5 of target).

6. **Acceptance Criteria (placeholders):**
   - No placeholder contains hardcoded IDs, addresses, names, emails, or abbreviations.
   - All loops use stable paths (`focus.classe.studenti.listaCompleta`, `focus.classe.consiglioDiClasse`, `focus.classe.materie`, `focus.classe.progetti`, `focus.classe.studenti.perSpecificita`, `focus.alunno.curriculum`, ...).
   - Inside loops placeholders have ≤ 3 segments; outside loops ≤ 4 segments.
   - No occurrences of `| where:`/`| exclude:`/`| filter:` with a domain string argument.
   - The sample templates in `02_CDU_STRUTTURA_NEW_OTTIMIZZATA.md` §9 render without errors using the new structure.
