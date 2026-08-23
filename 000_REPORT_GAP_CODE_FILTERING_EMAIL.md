# GAP Report — Email Engine Filtering for LOG_DOCS / LOG_FOLD Distribution

**Scope:** SGSA/ALDO email notification engine (`CONF_MAIL.BOX_CFG` → `renderBoxes` → attachments).
**Reference database:** `DATABASES_TO_CONVERT/CONVERTED/AS 2526 per ALDO.xlsx`.
**Status:** analysis only — no code changed.
**Date:** 2026-08-23

---

## 1. Purpose and Intended Behaviour (target)

The school office must be able to compose **one email pattern** (`CONF_MAIL` record) that contains
**multiple dynamic boxes at the same time**, where **several boxes may be of the same type**
(multiple `documenti` boxes, multiple `cartelle` boxes) and **each box instance selects its own,
independent subset of Drive items** by filtering on the audit tables:

| Table | Filterable fields required |
| --- | --- |
| `LOG_DOCS` | `ID_GEN` (which CONF_DOC generated it), `TIPO`, `SOTTOTIPO`, `STATO`, plus scope fields `CLASSI` / `UTENTI` / `MATERIE` |
| `LOG_FOLD` | `TIPO` (folder family, cf. §5-DP5), plus scope fields `CLASSI` / `UTENTI` / `MATERIE`; (`LOG_FOLD` has **no** `SOTTOTIPO`/`STATO`/`ID_GEN` columns) |

Concrete example (today impossible): `INVIO_DOCS_FINE_ANNO` declares four boxes —
"Cartelle programmi svolti", "Cartelle relazioni finali", "Griglie condotta", "Griglie competenze".
Each must show a *different* subset:

* box 1 → `LOG_FOLD` where `TIPO='PROGRAMMI_SVOLTI'`;
* box 2 → `LOG_FOLD` where `TIPO='RELAZIONI_FINALI'`;
* box 3 → `LOG_DOCS` where `TIPO='CONDOTTA'`;
* box 4 → `LOG_DOCS` where `TIPO='COMPETENZE'`.

Additionally, each box must be able to opt into Gmail attachment of the documents it shows
(`ALLEGA=true`), with the same per-box filter semantics, while folder boxes contribute links only.

Filter semantics expected inside one box: **AND** of the specified keys; absent keys = no
constraint on that field. Boxes are mutually independent: a filter declared on one box must never
affect another box.

---

## 2. Current Architecture (factual recap)

Rendering pipeline per email target:

```
RenderBoxesStep (emailSteps.ts:400)
  └─ renderBoxes()                       boxes.ts:560
       ├─ cfgs = confMail.getBoxes()     (JSON array from CONF_MAIL.BOX_CFG)
       ├─ known = cfgs with valid TIPO_BOX          boxes.ts:575-579
       ├─ documentiFiltro = FILTRO_TIPO/FILTRO_STATO from FIRST 'documenti' box   boxes.ts:581-586
       ├─ realCartelle (only if a 'cartelle' box has DATI_SORGENTE.metodo='cartellePerClasse')  boxes.ts:588-607
       ├─ context.boxdata = aggregaDati(cdu, materie, documentiFiltro, realCartelle)  boxes.ts:434-552
       ├─ blocks built per box config, ordered by ORDINE                            boxes.ts:612-689
       └─ returns { ordered html, boxes map, documentIds, folderIds }
ComposeEmailStep (emailSteps.ts:470)
  ├─ body assembly (saluto + TESTO_START + boxes + TESTO_END + footer)
  └─ resolveAllegati()                  emailSteps.ts:488-536
       ├─ static CONF_MAIL.ALLEGATI (always)
       └─ + class documents ONLY IF some box has ALLEGA=true AND DATI_SORGENTE.metodo='documentiPerClasse'
          (filtri: {tipo, stato} only)
CDU side: DocumentiClasseProvider fills focus.classe.didattica.documenti
          = ALL LOG_DOCS of the competence classes, unfiltered    DocumentiClasseProvider.ts:23-45
```

Supported `TIPO_BOX` (10): `carenze, documenti, documenti_dipartimento, cartelle, note, assenze,
cattedre, testo_dinamico, piani_pers_da_inviare, piani_pers_inviati`
(`createBoxComposer`, boxes.ts:301-410; default titles at boxes.ts:436-447).

---

## 3. Engine Gap Catalogue

### GAP-01 — CRITICAL: `documenti` boxes cannot be scoped per box
**Where:** `src/application/email/boxes.ts:581-586` and `:509-519`.
`FILTRO_TIPO` / `FILTRO_STATO` are read **only from the first `documenti` box found** and applied
**globally** to the single shared `boxdata.documenti` projection. Consequences:

* two `documenti` boxes in the same pattern necessarily render the **same list**;
* a filter on one box silently modifies every other `documenti` box;
* the §1 target ("Griglie condotta" vs "Griglie competenze" side by side) is unreachable.

### GAP-02 — CRITICAL: `cartelle` boxes have no filter mechanism at all
**Where:** `src/application/email/boxes.ts:588-607` (only source toggle), `:527-540` (projection).
No BOX_CFG key for folders is read anywhere. All `cartelle` boxes always show the full folder set
of the competence classes. "Cartelle Verbali CdC" vs "Cartelle 15 Maggio" vs "programmi svolti"
vs "relazioni finali" are four boxes with identical content.

### GAP-03 — HIGH: `LOG_FOLD.TIPO` is discarded during projection
**Where:** `src/application/email/boxes.ts:530-537`.
When real folders are loaded, each `LogCartella` is projected hard-coding
`{tipo:'CARTELLA', idGen:'', stato:'', dataCreazione:''}` — the actual `LogCartella.tipo`
(`LOG_FOLD.TIPO`, entity field exists: `src/domain/entities/LogCartella.ts:22`) is thrown away
*before* any renderer could see it. Even if GAP-02 were fixed tomorrow, the data needed to filter
would still be missing at this layer.

### GAP-04 — HIGH: `FILTRO_SOTTOTIPO` not supported in the render path
**Where:** `AggregatoreDati.matchesDoc` supports `{tipo, stato, sottotipo}`
(`src/application/services/AggregatoreDati.ts:119-125`) but `renderBoxes`/`aggregaDati` never read
a `FILTRO_SOTTOTIPO` key. Sub-type selection (e.g. `PDP_BES` vs `PEI` plans) is impossible in
BOX_CFG today. Needed for `LOG_DOCS.SOTTOTIPO`.

### GAP-05 — HIGH: no filter on `ID_GEN` anywhere
**Where:** whole codebase. `DocumentoItem.idGen` is present in CDU items
(boxes.ts:493 area / DocumentiClasseProvider.ts:35) but neither render nor attachments expose a
filter on it. `ID_GEN` is the most precise selector available ("documents produced by THIS
generation config"), e.g. the five distinct `VERBALE_CDC_OTTOBRE..MAGGIO` configs share the same
`TIPO='VERBALE_CDC'` and can only be told apart by `ID_GEN`.

### GAP-06 — MEDIUM: dead fallback branch for `cartelle` boxes
**Where:** `src/application/email/boxes.ts:538`.
Without `DATI_SORGENTE.metodo='cartellePerClasse'`, the fallback filters `LOG_DOCS` items by
`tipo === 'CARTELLA'`. In the real DB no row ever carries that value (13 distinct `LOG_DOCS.TIPO`,
none is `CARTELLA`), so this branch always yields an empty box on production-shaped data.

### GAP-07 — MEDIUM: CDU provider loads an unfiltered superset
**Where:** `src/application/context-engine/providers/DocumentiClasseProvider.ts:27-39`.
All `LOG_DOCS.findByClasse()` rows enter the CDU regardless of the pattern's needs; filtering
happens downstream and partially (see GAP-01/04/05). Besides efficiency, this couples the CDU
shape to whatever the providers decide, making per-pattern scoping implicit and fragile.

### GAP-08 — MEDIUM: attachment filter contract is divergent and weaker
**Where:** `src/application/pipelines/emailSteps.ts:488-536`.
`resolveAllegati` re-implements its own selection: it looks for a single box with
`ALLEGA===true && DATI_SORGENTE.metodo==='documentiPerClasse'` and honours only
`DATI_SORGENTE.filtri.{tipo,stato}`. Divergences vs the render path:

* different key names/shape for the same concept (`FILTRO_TIPO` vs `DATI_SORGENTE.filtri.tipo`);
* no `sottotipo`, no `ID_GEN`;
* only ONE box can opt in per pattern;
* folder boxes cannot opt in at all (links only — acceptable, but undocumented);
* the comment in boxes.ts:512-513 states scoping must stay independent of attachment resolution,
  yet both halves need the *same* per-box filters once per-box scoping lands.

### GAP-09 — MEDIUM: silent configuration failures
**Where:** `src/application/email/boxes.ts:575-579` (unknown/empty `TIPO_BOX` silently dropped),
`:581-586` (typo'd filter keys simply ignored), `AggregatoreDati.perMetodo` warns but callers may
skip quietly. A malformed BOX_CFG produces empty or over-broad emails without any WARN in the job
logs — exactly how the AS 2526 defects went unnoticed. Validation/diagnostics needed at parse time
(domain entity `ConfigurazioneEmail.getBoxes`) or render time.

### GAP-10 — MEDIUM: send-gate interaction with empty boxes
**Where:** `src/application/pipelines/emailSteps.ts:440-445`.
`shouldSend` requires at least one rendered box **or** a static attachment. A pattern whose boxes
are legitimately empty for a given target (e.g. `RIEPILOGO_PCTO_ALUNNO` with `BOX_CFG=[]` and
`ALLEGATI='[]'`) is skipped entirely and silently. With per-box filters arriving, "all boxes
filtered empty" becomes a normal state needing an explicit policy (send with TESTO_VUOTO notes?
skip with log?). Today the policy is implicit.

### GAP-11 — MEDIUM: specification drift for BOX_CFG
**Where:** `SPECS_ALDO/03_VALUE_OBJECTS_ED_ENUM.md:567-589` documents `BoxConfig` without the
keys actually implemented (`FILTRO_TIPO`, `FILTRO_STATO`, `DATI_SORGENTE.metodo` toggles,
`ALLEGA`), while the richer legacy `DATI_SORGENTE` schema survives in `FAKEDB/CONF_MAIL.csv` /
`AGGIORNAMENTI_DA_FARE.md` (discrepancy acknowledged at 03:586-589). Any per-box filter work must
first pin down ONE authoritative BOX_CFG contract in the spec, otherwise implementation and docs
diverge further. Note also `01_SCHEMA_DATABASE.md:374-394` describes `BOX_CFG` generically.

### GAP-12 — LOW: ambiguous `ORDINE` handling
**Where:** `src/application/email/boxes.ts:623,669-673`. Duplicate `ORDINE` values fall back to
array-index tie-breaking implicitly (stable sort). With many same-type boxes per pattern (the
§1 target) ordering becomes user-visible; either enforce uniqueness or document the tie-break.

---

## 4. Affected Components Map (for the future fix)

| # | Component | File | Change class |
| --- | --- | --- | --- |
| 1 | Per-config filter extraction | `src/application/email/boxes.ts` (`renderBoxes`) | rewrite GAP-01 block: read filters per box config |
| 2 | Per-instance data projection | `src/application/email/boxes.ts` (`aggregaDati`) | produce filtered views per box instance (or pass filter to block) |
| 3 | Folder filter support + preserve metadata | `src/application/email/boxes.ts` (`aggregaDati` realCartelle branch) | GAP-02/03: project real `tipo` (and consider `idGen`-like key from `LOG_FOLD.TIPO`) |
| 4 | New filter keys | BOX_CFG contract + `ConfigurazioneEmail.getBoxes` | `FILTRO_SOTTOTIPO`, `FILTRO_ID_GEN`, folder `FILTRO_TIPO`; validation (GAP-09) |
| 5 | Repository/aggregator signatures | `src/application/services/AggregatoreDati.ts` | optional filters param for `getCartellePerClasse` |
| 6 | CDU provider | `src/application/context-engine/providers/DocumentiClasseProvider.ts` | optional push-down filters (GAP-07) |
| 7 | Attachment resolution | `src/application/pipelines/emailSteps.ts` (`resolveAllegati`) | align to per-box contract, extend keys (GAP-08) |
| 8 | Send-gate policy | `src/application/pipelines/emailSteps.ts` (`RenderBoxesStep`) | explicit empty-state policy (GAP-10) |
| 9 | Spec | `SPECS_ALDO/03_VALUE_OBJECTS_ED_ENUM.md`, `01_SCHEMA_DATABASE.md` | authoritative BOX_CFG schema (GAP-11) |

Layering note: all of the above is SGSA-domain logic (interpretation of `BOX_CFG`/`CONF_MAIL`),
so per workspace rules it belongs in `src/application/email` — no `GasLibraryFactory` extension
required.

---

## 5. Data-Layer Prerequisites (evidence from `AS 2526 per ALDO.xlsx`)

Even a correct engine will misbehave until the converted data satisfies these points.

* **DP-01 — Vocabulary split between the two tables (HIGH).**
  Same real-world family, different tokens:
  `DOC_15_MAGGIO` (docs) ↔ `DOCUMENTO_15_MAGGIO` (folds); `PROGRAMMA_SVOLTO` ↔
  `PROGRAMMI_SVOLTI`; `RELAZIONE_FINALE` ↔ `RELAZIONI_FINALI`; `VERBALE_ASSEMBLEA_CLASSE` exists
  only in folds. A single `FILTRO_TIPO` value cannot address both tables without either a
  normalization pass or an explicit mapping table.

* **DP-02 — Plans carry wrong `TIPO` (HIGH).**
  In `LOG_DOCS` the personalized plans are logged as `TIPO='DOCUMENTO_PERSONALIZZATO'`
  (130 rows), whereas schema rule "TIPO derives from CONF_DOC.TIPO"
  (`SPECS_ALDO/01_SCHEMA_DATABASE.md:433`) demands `PIANO_PERS` (the `CONF_DOC` record
  `PIANI_PERSONALIZZATI` has `TIPO=PIANO_PERS`). Any `FILTRO_TIPO='PIANO_PERS'` matches zero rows
  today. The dedicated box types `piani_pers_*` bypass this because they read
  `focus.*.didattica.pianiPersonalizzati` (separate provider) — generic document boxes do not.

* **DP-03 — `SOTTOTIPO` uses legacy labels (HIGH).**
  Values present: `PDP BES`, `PDP DSA`, `PDP STRANIERI`, `PFP` (with **spaces**) on 130 rows;
  everything else NULL. Schema enum expects `PDP_BES`, `PEI`, … (01:434). Filtering on sub-type
  requires either data cleanup or alias-aware matching.

* **DP-04 — Sparse `STATO` / `ID_GEN` holes (MEDIUM).**
  `STATO`: only `VERBALIZZATO` ×130; rest NULL → `FILTRO_STATO` nearly useless until states are
  backfilled. `ID_GEN`: blank on 144/1952 rows → `FILTRO_ID_GEN` misses those rows.

* **DP-05 — `LOG_FOLD.TIPO` convention not honoured (MEDIUM).**
  Spec (`01_SCHEMA_DATABASE.md:457`) says `LOG_FOLD.TIPO` references `CONF_DOC.ID`
  (e.g. `VERBALE_CDC_OTTOBRE`). Actual data uses family-level tokens (`VERBALE_CDC`, `PCTO`,
  `PROGRAMMI_SVOLTI`, …). Family-level is arguably *better* for filtering (one value per box),
  but spec and data must agree on which convention is canonical.

* **DP-06 — Noise rows (LOW).**
  `CONF_DOC` contains test records `TEST_DOC_TABELLE_*` with `TIPO=NULL`; their outputs land in
  `LOG_DOCS` and would pollute unfiltered boxes. Also `LOG_FOLD.UTENTI`/`MATERIE` are empty on
  all 257 rows (scope filters on those columns are moot for folders today).

---

## 6. Evidence Snapshot (AS 2526)

* `CONF_MAIL`: 14 patterns; `BOX_CFG` syntactically valid JSON everywhere, but **zero** occurrences
  of `FILTRO_TIPO`, `FILTRO_STATO`, `DATI_SORGENTE`, `ALLEGA`; `ALLEGATI='[]'` on all rows;
  duplicate `ORDINE=20` in three coordinator patterns; `RIEPILOGO_PCTO_ALUNNO` has `BOX_CFG='[]'`
  → never sent (GAP-10).
* `DOC_PERSONALIZZATI_COORDINATORI` uses two generic `documenti` boxes for what are semantically
  the dedicated `piani_pers_da_inviare` / `piani_pers_inviati` types — under GAP-01 both boxes
  would show identical content even after fixing the type choice, unless per-box scoping exists.
* Previous-year DB (`AS 24 25 per ALDO.xlsx`) has an empty `CONF_MAIL` sheet → no historical
  reference exists.

---

## 7. Recommended Direction (non-normative)

1. **Pin the contract first** (GAP-11): extend `BoxConfig` in the spec with per-box
   `FILTRO_TIPO` / `FILTRO_STATO` / `FILTRO_SOTTOTIPO` / `FILTRO_ID_GEN` (AND semantics, optional
   CSV multi-value), identical key set for `documenti` and `cartelle` boxes (folders honour
   `TIPO`/scope only, per §1 table).
2. **Make rendering per-instance**: extract filters from every box config; project one filtered
   view per box instance instead of mutating shared `boxdata.*`.
3. **Preserve folder metadata**: stop hard-coding `tipo:'CARTELLA'`; carry real `LOG_FOLD.TIPO`
   (and `nome/path` if needed) through the projection.
4. **Unify attachments**: let `resolveAllegati` consume the same per-box filters of the
   `ALLEGA=true` box(es) instead of a parallel `DATI_SORGENTE.filtri` dialect.
5. **Fail loudly**: validate BOX_CFG at entity load; WARN+skip on unknown types/keys; make the
   empty-all-boxes state an explicit, logged decision (GAP-10).
6. **Clean the data** (DP-01…06) or introduce an explicit normalization/mapping layer in
   `CONF_DOC`-derived metadata before shipping filters to end users.
