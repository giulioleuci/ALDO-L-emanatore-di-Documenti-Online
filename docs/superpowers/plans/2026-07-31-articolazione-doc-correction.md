# ARTICOLAZIONE.md Correction Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring `ARTICOLAZIONE.md` (repo root) into accurate, complete alignment with the current codebase — correct one overstated claim (Item 4) and add three code-verified gaps the document currently omits.

**Architecture:** This is a documentation-only correction pass, not a code fix. `ARTICOLAZIONE.md` catalogs open architectural gaps around articulated-class handling (all items `Status: Open`, pending product decisions) — the plan edits the catalog to match ground truth in `src/`, it does not resolve the underlying gaps. Every claim added or changed must cite exact `file:line` verified against current source (via `codebase-memory-mcp` `get_code_snippet`/`search_graph`, not memory or assumption) before being written.

**Tech Stack:** Markdown edit; verification via `codebase-memory-mcp` (`home-giulio-Desktop-ALDO-implementing` graph) and `git log -- ARTICOLAZIONE.md` for prior-edit context.

## Global Constraints

- Preserve existing item numbering for unchanged items (1, 3, 5). Items 2 and 4 are edited in place. New items are appended as 6 and 7, keeping the existing `## N. Title` / `- **Status**:` / `- **Description**:` / `- **Impact**:` / `---` structure exactly.
- Every `file:line` citation must be re-verified against current source immediately before being written into the doc — line numbers drift across commits (Item 4's original text has already drifted once per `git log`, see commit `4ca55ae docs: fix CattedraResolver reference in ARTICOLAZIONE.md`).
- Keep `Status: Open` on every item — this plan documents gaps, it does not close them. Do not editorialize a fix recommendation beyond what the "Impact" line format already does.
- Do not touch code under `src/` in this plan — any actual fix is a separate, future plan requiring its own product decision (per Item 1's own precedent: "Resolving it requires a product design decision").

---

### Task 1: Correct Item 4 — DocumentGenerationService target-concept claim is overstated

**Files:**
- Modify: `ARTICOLAZIONE.md:31-36` (Item 4 section)

**Context (verified):** Item 4 currently claims generation "relies on targeting the parent class ID and depending on context data providers (CDU) to expand and aggregate partner class data internally" — phrased as if CDU expansion is uniform. It is not. Two different expansion mechanisms coexist:
- `ClasseProvider`, `StudentiProvider`, `RappresentantiProvider`, `ConsiglioClasseProvider` self-expand internally via `classi.getArticolazione(classe)?.isParent()` + `getClassiPartner(classe)`, independent of `BuildParams`.
- `DocumentiClasseProvider` (`src/application/context-engine/providers/DocumentiClasseProvider.ts:17-47`) and `PianiPersClasseProvider` (`src/application/context-engine/providers/PianiPersClasseProvider.ts:20-59`) do **not** self-expand — they read `params.classiCompetenza ?? [params.target]`. `classiCompetenza` is only ever populated by `EmailNotificationService.classiCompetenza` (`src/application/services/EmailNotificationService.ts:292-297`, via `getGruppoArticolazione`). `DocumentGenerationService.generateForClasse` (`src/application/services/DocumentGenerationService.ts:88-141`) builds `BuildParams` without setting `classiCompetenza` at all — so for that entry point the fallback `[params.target]` (the parent's own id alone) is what's actually used.

- [ ] **Step 1: Verify the four self-expanding providers still use `isParent()`/`getClassiPartner` unconditionally**

Run:
```
mcp__codebase-memory-mcp__get_code_snippet(project="home-giulio-Desktop-ALDO-implementing", qualified_name="home-giulio-Desktop-ALDO-implementing.src.application.context-engine.providers.ClasseProvider.ClasseProvider")
```
Expected: `buildCoordinatori` still branches on `config?.isParent() === true`. Repeat spot-check for `StudentiProvider.provide`, `RappresentantiProvider.provide`, `ConsiglioClasseProvider.provide`.

- [ ] **Step 2: Verify the two `classiCompetenza`-dependent providers and the two call sites**

Confirm current line ranges for `DocumentiClasseProvider.ts`, `PianiPersClasseProvider.ts`, `EmailNotificationService.classiCompetenza`, and `DocumentGenerationService.generateForClasse` via `get_code_snippet`. Update the citations below if line numbers moved.

- [ ] **Step 3: Replace Item 4's Description and Impact**

Replace lines 31-36 with:

```markdown
## 4. Inconsistent Partner-Class Expansion Across Context Providers

- **Status**: Open
- **Description**: CDU partner-class expansion for a parent-class target is not uniform. `ClasseProvider`, `StudentiProvider`, `RappresentantiProvider`, and `ConsiglioClasseProvider` self-expand internally (`classi.getArticolazione(classe)?.isParent()` + `getClassiPartner(classe)`), independent of any caller-supplied parameter. `DocumentiClasseProvider` and `PianiPersClasseProvider`, by contrast, expand only if the caller populates `BuildParams.classiCompetenza`; otherwise they default to `[params.target]` (the parent id alone). `EmailNotificationService.classiCompetenza` populates it correctly via `getGruppoArticolazione`, but `DocumentGenerationService.generateForClasse` never sets it — see Item 7.
- **Impact**: `DocumentGenerationService` has no explicit "articulated group" generation target; document generation triggered through this path silently falls back to per-provider defaults that are not consistent with each other. A reader of the CDU output cannot assume partner data is present in `focusClasse.didattica.documenti` / `pianiPersonalizzati` just because it is present in `focusClasse.studenti` or `focusClasse.coordinatori`.
```

- [ ] **Step 4: Commit**

```bash
git add ARTICOLAZIONE.md
git commit -m "docs: correct ARTICOLAZIONE.md Item 4 (CDU expansion is not uniform across providers)"
```

---

### Task 2: Extend Item 2 to cover TUTOR_ASL / TUTOR_ORIENT role strategies

**Files:**
- Modify: `ARTICOLAZIONE.md:15-20` (Item 2 section)

**Context (verified):** Item 2 currently names only `genitoriClasse` and `rappresentantiStudenti`. `RisolutoreRuoliService.buildRegistro` (`src/application/services/RisolutoreRuoliService.ts:138-157`) registers `TUTOR_ASL` and `TUTOR_ORIENT` as `(c) => this.emailsOf(this.classi.getDocentiRuolo(c.classe, 'TUTOR_ASL'/'TUTOR_ORIENT'))` — same pattern, same silent-failure mode: `getDocentiRuolo` reads `c.classe`'s own `RUOLI` column directly, with no `isParent()`/partner-expansion check, exactly like `genitoriClasse`/`rappresentantiStudenti` at lines 267-275 of the same file. `SEGRETARIO_CDC` uses the identical unguarded pattern but is a single-holder role (`getRuolo` shortcut) that may be intentionally set per-class rather than per-group — flag as an open question, not folded into the same claim.

- [ ] **Step 1: Verify `buildRegistro` and the four role-strategy method bodies**

Run `get_code_snippet` on `RisolutoreRuoliService.RisolutoreRuoliService` (already covers `buildRegistro`, `genitoriClasse`, `rappresentantiStudenti`). Confirm `TUTOR_ASL`/`TUTOR_ORIENT`/`SEGRETARIO_CDC` registrations still call `getDocentiRuolo`/`getRuolo` on `c.classe` directly with no articolazione branch.

- [ ] **Step 2: Replace Item 2's Description and Impact**

Replace lines 15-20 with:

```markdown
## 2. Role Resolution Does Not Expand to Partner Classes

- **Status**: Open
- **Description**: `RisolutoreRuoliService.genitoriClasse` and `.rappresentantiStudenti` (`RisolutoreRuoliService.ts:267-275`) resolve recipients via `this.classi.getStudenti(ctx.classe, true)`, an exact match on the focus class — students belong exclusively to partner classes, never to the parent class id. The `TUTOR_ASL` and `TUTOR_ORIENT` role strategies (`RisolutoreRuoliService.ts:145-146`, via `getDocentiRuolo(c.classe, ...)`) share the identical unguarded pattern: no `isParent()`/partner-expansion check. `SEGRETARIO_CDC` (`RisolutoreRuoliService.ts:144`) uses the same unguarded `getDocentiRuolo`/`getRuolo` call, but as a single-holder role it may be intentionally assigned per physical class rather than per articulated group — needs a product decision, not assumed to be the same bug.
- **Impact**: Email notifications targeting `GENITORI_CLASSE`, `RAPPRESENTANTI_STUDENTI`, `TUTOR_ASL`, or `TUTOR_ORIENT` via a parent class id silently yield zero recipients. Addressable by applying the same partner-expansion pattern already used by `RappresentantiProvider` and `StudentiProvider` (`classi.getArticolazione(classe)?.isParent()` → iterate `getClassiPartner(classe)`).
```

- [ ] **Step 3: Commit**

```bash
git add ARTICOLAZIONE.md
git commit -m "docs: extend ARTICOLAZIONE.md Item 2 to cover TUTOR_ASL/TUTOR_ORIENT role strategies"
```

---

### Task 3: Add Item 6 — TutorProvider CDU field not expanded for parent classes

**Files:**
- Modify: `ARTICOLAZIONE.md` (append after current Item 5, i.e. after line 44)

**Context (verified):** `TutorProvider.provide` (`src/application/context-engine/providers/TutorProvider.ts:14-30`) sets `focusClasse.tutor.asl`/`.orientamento` via `this.classi.getDocentiRuolo(classe, RUOLO_TUTOR_ASL/RUOLO_TUTOR_ORIENT)` called on the CDU's own `classe` entity, with no `isParent()` branch — unlike its sibling providers `RappresentantiProvider`, `StudentiProvider`, `ClasseProvider.buildCoordinatori`, all of which explicitly check `config?.isParent() === true` and iterate `getClassiPartner(classe)` before falling back to the single-class path. This is a distinct manifestation (CDU field, not email routing) of the same root cause as Item 2 (Task 2 above): a `RUOLI`-column lookup that is never routed through partner expansion.

- [ ] **Step 1: Verify `TutorProvider.provide` and contrast against `RappresentantiProvider.provide`**

Run `get_code_snippet` on both `TutorProvider.TutorProvider` and `RappresentantiProvider.RappresentantiProvider`. Confirm `TutorProvider` has no `getArticolazione`/`isParent` call anywhere in the class, while `RappresentantiProvider.provide` does (`config?.isParent() === true` branch).

- [ ] **Step 2: Append new Item 6**

Append at end of file:

```markdown

## 6. `TutorProvider` Does Not Expand to Partner Classes on the Parent Focus

- **Status**: Open
- **Description**: `TutorProvider.provide` (`TutorProvider.ts:14-30`) populates `focusClasse.tutor.asl`/`.orientamento` from `this.classi.getDocentiRuolo(classe, ...)` called on the CDU's focus `classe` directly — no `isParent()`/partner-expansion branch, unlike `RappresentantiProvider`, `StudentiProvider`, and `ClasseProvider.buildCoordinatori`, which all merge data from `getClassiPartner(classe)` when the focus class is an articulated parent.
- **Impact**: When a document/email CDU is built with an articulated parent as target and PCTO/orientamento tutors are assigned on the `RUOLI` column of the partner classes (as students physically are), `focusClasse.tutor.asl`/`.orientamento` renders empty for the parent-targeted output, even though the equivalent `focusClasse.coordinatori`/`rappresentanti`/`studenti` fields correctly show merged partner data in the same CDU. Same root cause as Item 2; addressable with the identical `isParent()` → `getClassiPartner(classe)` pattern.
```

- [ ] **Step 3: Commit**

```bash
git add ARTICOLAZIONE.md
git commit -m "docs: add ARTICOLAZIONE.md Item 6 (TutorProvider parent-class expansion gap)"
```

---

### Task 4: Add Item 7 — DocumentGenerationService never sets classiCompetenza

**Files:**
- Modify: `ARTICOLAZIONE.md` (append after new Item 6)

**Context (verified):** `DocumentGenerationService.generateForClasse` (`src/application/services/DocumentGenerationService.ts:88-141`) calls `this.contextBuilder.build({ target: target.value, tipoTarget: 'classe', now: this.now, idConfigurazione: confDocId, tipoOperazione: 'GENERAZIONE_DOCUMENTO' }, recipe('CLASSE_COMPLETA'))` — the `BuildParams` object has no `classiCompetenza` key. Contrast with `EmailNotificationService.classiCompetenza` (`EmailNotificationService.ts:292-297`), whose docstring states explicitly: *"An articulated parent is the email entry point, but the CDU must include documents owned by every partner class in its group."* That fix was applied only on the email path.

- [ ] **Step 1: Verify `generateForClasse`'s `BuildParams` literal has no `classiCompetenza` key**

Run `get_code_snippet` on `DocumentGenerationService.DocumentGenerationService.generateForClasse`. Confirm the object literal passed to `this.contextBuilder.build(...)`.

- [ ] **Step 2: Verify no other call site sets `classiCompetenza` for the `CLASSE_COMPLETA` recipe**

Run `mcp__codebase-memory-mcp__search_graph(project="home-giulio-Desktop-ALDO-implementing", query="classiCompetenza")` and confirm `EmailNotificationService.classiCompetenza` remains the sole producer.

- [ ] **Step 3: Append new Item 7**

Append at end of file:

```markdown

## 7. `DocumentGenerationService.generateForClasse` Omits `classiCompetenza` for Articulated Parents

- **Status**: Open
- **Description**: `generateForClasse` (`DocumentGenerationService.ts:88-141`) builds `BuildParams` for the `CLASSE_COMPLETA` recipe without setting `classiCompetenza`. `DocumentiClasseProvider` and `PianiPersClasseProvider` (see Item 4) therefore fall back to `[params.target]` — the parent class id alone. `EmailNotificationService.classiCompetenza` populates the field correctly (`getGruppoArticolazione`, with an explicit docstring noting the CDU must include partner-owned documents), but that fix was never applied to the document-generation entry point.
- **Impact**: Generating a `CLASSE_COMPLETA` document (or any recipe reading `focusClasse.didattica.documenti`/`pianiPersonalizzati.items`) targeting an articulated parent class omits `LOG_DOCS` entries and personalized plans filed under the partner classes — the same silent-data-loss shape as Item 2, but in the document-generation path rather than email routing. Fix candidate: mirror `EmailNotificationService.classiCompetenza`'s `getGruppoArticolazione` call inside `generateForClasse` (or move the computation into a shared helper both services call).
```

- [ ] **Step 4: Commit**

```bash
git add ARTICOLAZIONE.md
git commit -m "docs: add ARTICOLAZIONE.md Item 7 (DocumentGenerationService missing classiCompetenza)"
```

---

### Task 5: Full-document citation re-verification pass

**Files:**
- Modify: `ARTICOLAZIONE.md` (whole file, citation fixes only)

**Interfaces:**
- Consumes: the final 7-item document produced by Tasks 1-4.

- [ ] **Step 1: Re-read the full file top to bottom**

- [ ] **Step 2: For every `file:line` citation in the document, re-verify against current source**

For each citation, run `get_code_snippet` (or `search_graph` if the symbol name is uncertain) on the named class/function and confirm the line range still matches. This includes citations untouched by Tasks 1-4 (Items 1, 3, 5) — they may have drifted since `5d51922`/`4ca55ae`.

- [ ] **Step 3: Fix any drifted line numbers found**

- [ ] **Step 4: Confirm every item still has `Status: Open` and the `---` separator structure is intact between all 7 items**

- [ ] **Step 5: Commit (only if Step 3 found drift)**

```bash
git add ARTICOLAZIONE.md
git commit -m "docs: fix drifted line-number citations in ARTICOLAZIONE.md"
```
