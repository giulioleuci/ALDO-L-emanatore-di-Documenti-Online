# Design: `piani_pers_*` email boxes + extended `PER_CARENZA*` recipient groups

Date: 2026-07-18
Status: approved (brainstorming), pending implementation plan

## 1. Summary

Two independent extensions to the email-notification subsystem (ref `SPECS_ALDO/03_VALUE_OBJECTS_ED_ENUM.md`, `BOX_CONF_GUIDE.md`):

1. Two new `CONF_MAIL.BOX_CFG` box types, `piani_pers_da_inviare` and `piani_pers_inviati`, listing students' personalized-plan documents (PDP/PEI/PFP), split by `LOG_DOCS.NOTIFICATO`, primarily for teacher-facing patterns, optionally usable for student/parent patterns, with default historical ("sent last year too") enrichment on the not-yet-sent box.
2. `ProcessoInvio.PER_CARENZA` renamed to `PER_CARENZA_GENITORI` (parents only, behavior unchanged) plus two new values: `PER_CARENZA_GENITORI_E_ALUNNO` (parents + student, one shared email) and `PER_CARENZA_GENITORI_E_COORD` (parents To + class coordinator Cc, one shared email). All three keep using only `carenze`/`note`/`assenze` boxes.

Both extensions surface and fix two pre-existing gaps discovered while designing this (see §5), because the new boxes would otherwise never show real data.

## 2. Part A — Recipient groups

### 2.1 Enum (`src/domain/value-objects/enums.ts`)

```ts
export enum ProcessoInvio {
  PER_COORDINATORE = 'PER_COORDINATORE',
  PER_DOCENTE = 'PER_DOCENTE',
  PER_CDC = 'PER_CDC',
  PER_ALUNNO = 'PER_ALUNNO',
  PER_GENITORI_ALUNNO = 'PER_GENITORI_ALUNNO',
  PER_CARENZA_GENITORI = 'PER_CARENZA_GENITORI',                 // renamed from PER_CARENZA
  PER_CARENZA_GENITORI_E_ALUNNO = 'PER_CARENZA_GENITORI_E_ALUNNO', // new
  PER_CARENZA_GENITORI_E_COORD = 'PER_CARENZA_GENITORI_E_COORD'    // new
}
```

All three `PER_CARENZA*` values map to `CARENZA_COMPLETO` in `RECIPE_PER_PROCESSO` (`src/application/pipelines/emailSteps.ts:49-56`) — same recipe as today, only recipient enumeration/greeting/cc differ.

### 2.2 `EmailNotificationService` (`src/application/services/EmailNotificationService.ts`)

`enumerateTargets` gains two new switch cases. `targetsPerCarenza` (private, line 359) splits into three private methods sharing the same `findNonNotificate()` iteration:

- `targetsPerCarenzaGenitori()` — unchanged logic (parents only, alunno-email fallback if no tutors)
- `targetsPerCarenzaGenitoriEAlunno()` — same base, `emails = [...tutors, alunno.id]`, `tipo: 'genitori_alunno'`
- `targetsPerCarenzaGenitoriECoord()` — same base, `emails = tutors`, plus `cc = [coordinatore emails for alunno's classe]` resolved via `this.deps.classi.getCoordinatori(classe)` (same call `targetsPerCoordinatore` already uses)

### 2.3 CC plumbing (new capability, backed by an existing library feature)

`GasLibraryFactory`'s `MailService.send()` already accepts `cc` (`types/gaslibs/index.d.ts:742`) — this is a full match per `GasLibraryFactory`-first policy, just not yet exposed through ALDO's own facade interface. Thread it through:

- `EmailTarget` (`src/application/email/saluto.ts`): add `cc?: string[]`
- `Destinazione` (`src/application/pipelines/emailSteps.ts:44-46`): add `cc?: string[]`; `ResolveRecipientsStep`'s non-docente branch (line 315-318) passes `t.cc` through
- `EmailSendOptions`/`GmailServiceFacade.sendEmail` (`src/infrastructure/facades/GmailServiceFacade.ts`): add `cc?: string[]` → `mailOpts.cc`
- `SendEmailStep` passes `dest.cc` into `opts.cc` when present (alongside the existing hardcoded supervisore `bcc`)

### 2.4 Greeting

`salutoPerTarget` (`saluto.ts:29-47`) gains a `tipo: 'genitori_alunno'` case (e.g. `'Gentili Genitori e {{placeholder:NOME_ALUNNO}}'`). `EmailTarget.tipo` union extends to include it. The `PER_CARENZA_GENITORI_E_COORD` target keeps `tipo: 'genitori'` (only the To list; the coordinator is Cc-only, not part of the greeting).

### 2.5 Rename fallout

`PER_CARENZA` appears in: `RECIPE_PER_PROCESSO`, `BOX_CONF_GUIDE.md`, `SPECS_ALDO/01_SCHEMA_DATABASE.md:336`, `SPECS_ALDO/02_CDU_STRUTTURA.md:261`, and test fixtures/specs. Every occurrence found via `codebase-memory-mcp` `search_graph`/`search_code` (not just grep) must be updated, including fixture CONF_MAIL rows using the literal string `PER_CARENZA` as a `PROCESSO` value (`FAKEDB/CONF_MAIL.csv` if present).

## 3. Part B — `piani_pers_da_inviare` / `piani_pers_inviati` boxes

### 3.1 Scope

- **Primary**: `PER_COORDINATORE`, `PER_DOCENTE`, `PER_CDC` (all on `DOCENTE_COMPLETO`) — class-wide listing across every class the target covers (`EmailTarget.classiCompetenza`), each row tagged with the owning student.
- **Optional**: `PER_ALUNNO`, `PER_GENITORI_ALUNNO` — same `BOX_CFG` mechanism, single student's own plans, no `studente` tag needed.
- **Excluded**: `PER_CARENZA*` (confirmed out of scope — those patterns only use `carenze`/`note`/`assenze`).

### 3.2 Identifying personalized-plan documents

`LOG_DOCS.TIPO === 'PIANO_PERS'` — the categorical convention `CONF_DOC.TIPO`, mirroring how the existing `documenti`/`cartelle` boxes already split on `TIPO === 'CARTELLA'` (`boxes.ts:332-333`).

### 3.3 New CDU fields (`src/application/context-engine/Cdu.ts`)

Deliberately independent of the existing `documenti`/`documentiStorico` tokens (reusing them would silently change `documenti`/`cartelle` box behavior in `ALUNNO_COMPLETO`/`DOCENTE_COMPLETO`, which `BOX_CONF_GUIDE.md` §2 documents as intentionally always-empty there today — out of scope to change).

```ts
interface PianoPersonalizzatoItem {
  nome: string;
  link: string;
  tipo: string;       // LOG_DOCS.TIPO, always 'PIANO_PERS' here
  sottotipo: string;   // LOG_DOCS.SOTTOTIPO, e.g. PDP_DSA / PEI
  idGen: string;
  stato: string;
  dataCreazione: string;
  notificato: boolean; // LOG_DOCS.NOTIFICATO != ''
  studente?: { nomeCompleto: string; email: string }; // only set by the classe-scoped provider
}
```

- `CduAlunno.didattica.pianiPersonalizzati: { items: PianoPersonalizzatoItem[], storico?: LazyRef<DocumentoStoricoConTipo[]> }`
- `CduClasse` gains a new `didattica?: { pianiPersonalizzati: { items: PianoPersonalizzatoItem[], storico?: LazyRef<...> } }` (first `didattica` node on `CduClasse` — today only `CduAlunno` has one)

### 3.4 New providers (`src/application/context-engine/providers/`)

- `PianiPersAlunnoProvider` — `findByUtente(email)` filtered to `TIPO==='PIANO_PERS'`, writes `focus.alunno.didattica.pianiPersonalizzati.items`. Added to `ALUNNO_COMPLETO` and `FAMIGLIA_COMPLETO` recipes (after `student`).
- `PianiPersAlunnoStoricoProvider` — mirrors `DocumentiStoricoProvider` (gated by `options.includiStorico`), `StoricoDocumentiService.perAlunnoConTipo(email, profondita)`.
- `PianiPersClasseProvider` — for each `ClasseId` in `params.classiCompetenza ?? [params.target]`, `IClasseRepository.findById` + `ILogDocumentoRepository.findByClasse()` filtered to `TIPO==='PIANO_PERS'`, tags each item with the owning student (resolved via `IAlunnoRepository`, matched against `LOG_DOCS.UTENTI`). Added to `DOCENTE_COMPLETO`.
- `PianiPersClasseStoricoProvider` — for each distinct student email found in the current-year items, `StoricoDocumentiService.perAlunnoConTipo(email, profondita)`; results merged into one `LazyRef`. Simple per-student loop (not batched across years) — the number of BES/PDP students per class is small, so this is a deliberate simplicity-over-micro-optimization call.

`BuildParams` (`src/application/context-engine/Recipe.ts`) gains `classiCompetenza?: string[]`. `BuildCDUStep` (`emailSteps.ts`) populates it from `EmailTarget.classiCompetenza`.

### 3.5 Box rendering (`src/application/email/boxes.ts`)

- Two new `TIPO_BOX` entries registered in `createBoxComposer`, sharing one renderer function (`renderPianiPersBox`), same pattern as `documenti`/`cartelle` sharing `renderDocumentiBox`.
- `aggregaDati` reads `focus.classe.didattica.pianiPersonalizzati.items ?? focus.alunno.didattica.pianiPersonalizzati.items ?? []` (classe-scoped takes precedence when both are somehow present, which shouldn't happen given recipe wiring) and the matching `storico` ref, then the two block data-extractors filter by `!item.notificato` / `item.notificato`.
- `DEFAULT_TITLES` gains `piani_pers_da_inviare: 'Piani personalizzati da notificare'`, `piani_pers_inviati: 'Piani personalizzati notificati'`.
- **Default historical row template**: unlike `documenti`, where `arricchisciConStorico` requires an explicit `configArricchimento.templateRiga` to activate (falling back to `renderRigaStandard` otherwise, `boxes.ts:164-165`), `piani_pers_da_inviare` ships a **built-in default row template** baked into `renderPianiPersBox` so it works with zero `BOX_CFG` configuration:
  > `<li>{{corrente.sottotipo}} — {{corrente.studente.nomeCompleto}}{{#studente}} ({{studente.nomeCompleto}}){{/studente}}: <a href="{{corrente.link}}">{{corrente.nome}}</a>{{#storico}} — Si invia anche il link al piano dell'anno precedente: <a href="{{link}}">{{nome}}</a> ({{anno}}){{/storico}}</li>`
  (exact wording configurable via the existing `configArricchimento.templateRiga` override key — same escaping rules as `renderDocumentiBox`'s `escapeNomeLink`). `piani_pers_inviati` defaults to plain `renderRigaStandard`-style rows (no historical block) unless a `BOX_CFG` entry explicitly sets `arricchisciConStorico: true`.

### 3.6 Fixing the `includiStorico` wiring gap (blocks §3.5 from ever firing)

`BuildCDUStep._executeLogic` (`emailSteps.ts:90-108`) calls:
```ts
recipe(RECIPE_PER_PROCESSO[conf.processo], { gestioneSupplenti: conf.supplenti })
```
`gestioneSupplenti` is not a `RecipeOptions` key — it's silently absorbed by `RecipeOptions`'s index signature and never read. `includiStorico` therefore stays at its `DEFAULT_OPTIONS` value of `false` for **every** email sent through the real pipeline today, meaning `DocumentiStoricoProvider` always skips and the already-shipped `documenti` box's `arricchisciConStorico` mode has never actually activated outside direct-`ContextBuilder` unit tests.

Fix: `BuildCDUStep` inspects `conf.getBoxes()` before building the recipe and turns `includiStorico` on (with a default `profonditaAnniDocumenti`, e.g. `1`) whenever any box entry is a `documenti`/`cartelle`/`piani_pers_da_inviare` type with historical enrichment wanted (explicit `arricchisciConStorico: true`, or — for `piani_pers_da_inviare` specifically — enrichment wanted by default unless the entry explicitly sets `arricchisciConStorico: false`). This is a targeted fix of existing broken behavior, not a new feature, and benefits the pre-existing `documenti` box for free.

## 4. Part C — `LOG_DOCS.UTENTI` gap fix

`RegisterDocumentStep._executeLogic` (`src/application/pipelines/documentSteps.ts:277-302`) currently writes `ID`, `ID_GEN`, `TIPO`, `NOME`, `STATO`, `PATH`, `LINK`, `CLASSI`, `DATA_CREAZ` — never `UTENTI`. This means `LogDocumentoRepository.findByUtente()` — which the existing `documenti`/`cartelle` boxes and the new `PianiPersAlunnoProvider` depend on — finds nothing for documents generated by the real pipeline (only hand-authored test/fixture rows currently set `UTENTI`).

Fix: add `[COL_LOG_DOCS.UTENTI]: cdu(ctx).focus.alunno?.anagrafica.email ?? ''` to the `RegisterDocumentStep` row. `cdu(ctx).focus.alunno` is populated whenever document generation is alunno-scoped (e.g. `SCHEMA_SOTTOCARTELLE: UNO_PER_PIANO_PERSONALIZZATO`, which `PDP_BES`/`PEI_DOC` already use) — verified via `DocPersonalizzatoGeneratorStrategy` reading `cdu.focus.alunno?.didattica.piani.items`.

## 5. Part D — Documentation updates

- **`BOX_CONF_GUIDE.md`**: new §3 entries for `piani_pers_da_inviare`/`piani_pers_inviati` (CDU paths read, emptiness rule, default historical behavior, class-wide vs per-student duality); update the `PROCESSO`/recipe table (§2) and the `ProcessoInvio` value list (§1) for the `PER_CARENZA*` split; note the `includiStorico` wiring fix in the existing `documenti`/`cartelle` §5 section since it changes previously-documented (broken) behavior.
- **`SPECS_ALDO/03_VALUE_OBJECTS_ED_ENUM.md`**:
  - `ProcessoInvio` section (currently a stub at line 91-95 pointing at the now-deleted `11_PIPELINE_EMAIL.md`) gets a real value table: the 5 unchanged values + `PER_CARENZA_GENITORI`/`PER_CARENZA_GENITORI_E_ALUNNO`/`PER_CARENZA_GENITORI_E_COORD`, with a one-line note on recipient/cc semantics for the three carenza variants.
  - `BoxConfig` JSON block (line 534-550) is corrected to match the actual implementation — verified against `boxes.ts` during this design, it currently documents a `DATI_SORGENTE`/array-`PREREQUISITI`/object-`arricchisciConStorico` shape that doesn't exist in code (real shape: `PREREQUISITI` is a visibility-expression *string*, `arricchisciConStorico` is a *boolean*, row template lives in `configArricchimento.templateRiga`, plus the undocumented `COLORE`/`displayMode` keys) — and gains the two new `TIPO_BOX` values.
- **`SPECS_ALDO/01_SCHEMA_DATABASE.md:336`**: `PROCESSO` value list updated for consistency (same drift risk as `03_...md` if left alone).

## 6. Out of scope (explicitly deferred)

- Batched/optimized multi-student historical lookup (per-student loop is acceptable given typical BES/PDP class sizes)
- Any change to `documenti`/`cartelle` box behavior beyond the `includiStorico` wiring fix (their empty-outside-FAMIGLIA_COMPLETO behavior stays as documented)
- The pre-existing cartelle-di-classe gap (`BOX_CONF_GUIDE.md` §7) — unrelated, not touched here
