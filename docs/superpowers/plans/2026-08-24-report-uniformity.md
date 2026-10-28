# Report Uniformity v2 Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the 10 confirmed uniformity fixes from `REPORT_UNIFORMITY.md` across the CDU, JSON-config, and ENUM/VO domains of SGSA/ALDO, without regressing existing behavior.

**Architecture:** Each task is a self-contained rename/alignment touching a domain type (`Cdu.ts`), the provider(s)/entity(ies) that populate it, the spec doc(s) that describe it, and any test fixtures that hard-code the old name. No new abstractions, no new library dependencies — every finding is ALDO-domain-specific (CDU shape, `CONF_MAIL`/`MATERIE` JSON interpretation), so none of it belongs in `GasLibraryFactory`.

**Tech Stack:** TypeScript (GAS V8 target), Jest (`ts-jest`), the existing `SheetDBLib`-backed entities/repositories.

**Spec:** `REPORT_UNIFORMITY.md` (source report); `SPECS_ALDO/01_SCHEMA_DATABASE.md`, `SPECS_ALDO/02_CDU_STRUTTURA.md`, `SPECS_ALDO/03_VALUE_OBJECTS_ED_ENUM.md` (specs to update in lockstep with code).

## Global Constraints

- GAS V8 target: synchronous code only, no Node-only APIs (project-wide, `CLAUDE.md`).
- Never touch `dist/*`; edit `src/` only.
- Native GAS globals stay inside `GoogleApiWrapper`; none of this plan's tasks touch that layer.
- Run `npm run typecheck` and the relevant `npx jest --config jest.config.cjs <file>` after every task; run the full `npm test` before the final commit of the plan.
- **Correction to the report, already agreed with the user:** §1.3's "drop `id` from `documenti.items[]`" is **not** implemented literally — `id` is load-bearing for email-attachment resolution in `boxes.ts` (`dynamicAttachmentItems`/`documentIds`/`folderIds`, lines ~806-838, sourced straight from `cdu.focus.*.didattica.documenti.items`). Task 5 instead **aligns** the three CDU interfaces to all declare `id?: string`, rather than removing it anywhere.
- **Scope correction, already agreed with the user:** findings §2.1-§2.4 require renaming data already living in production Google Sheets (`CONF_MAIL.BOX_CFG`, `MATERIE.ESAME_CFG`, `CLASSI.ARTICOLAZIONE`, `CONF_MAIL.ALLEGATI`). This repo has no live-Sheet access. Tasks 3, 6, 8, 9 implement the code/spec/fixture side only and end with an explicit manual-follow-up note — do not write or run a Sheet-migration script.

---

### Task 1: Spec-only text corrections (§1.4, §3.1)

**Files:**

- Modify: `SPECS_ALDO/02_CDU_STRUTTURA.md:36` (Principio 6)
- Modify: `SPECS_ALDO/03_VALUE_OBJECTS_ED_ENUM.md:426-437` (`ClassiScope`/`MaterieScope` section)

No code changes, no tests. Two independent doc fixes.

- [ ] **Step 1: Add a Principio 6 exception for state/partition paths**

In `SPECS_ALDO/02_CDU_STRUTTURA.md`, Principio 6 currently reads (line 36):

Read the actual line 36 first to get its exact current wording (this plan doesn't reproduce it verbatim — don't paste blind), then append a parenthetical exception, e.g.:

```
6. **Fuori dai loop: ≤ 4 segmenti** (eccezione: path di stato/partizione con nesting intrinsecamente profondo, del tipo `didattica.<sottoinsieme>.<partizione>.hasXxx` — es. `focus.classe.didattica.pianiPersonalizzati.nonVerbalizzati.hasElenco`, che supera il budget perché denormalizzare `nonVerbalizzati` più in alto nell'albero duplicherebbe dati a cascata).
```

- [ ] **Step 2: Update the `ClassiScope`/`MaterieScope` section to describe `CsvScope`**

In `SPECS_ALDO/03_VALUE_OBJECTS_ED_ENUM.md`, replace the heading and body at lines 426-437 (currently `### \`ClassiScope\` e \`MaterieScope\``with a shared method table) with a single`CsvScope`description that states it backs both`SUPPLENZE.CLASSI`/`MATERIE`and`VARIAZIONI_CATTEDRA.CLASSI`/`MATERIE` scope checks. Model it on the existing table shape but retitle:

```markdown
### `CsvScope`

- **Proprietà:** `value: string` — CSV di ID oppure `"*"` (tutte)
- Unico VO generico che copre sia lo scope-classi sia lo scope-materie (usato in `SUPPLENZE.CLASSI`/`SUPPLENZE.MATERIE` e in `VARIAZIONI_CATTEDRA.CLASSI`/`VARIAZIONI_CATTEDRA.MATERIE`); in precedenza descritto come due VO gemelli (`ClassiScope`, `MaterieScope`), unificati in `src/domain/value-objects/CsvScope.ts`.

| Metodo                               | Comportamento                                                 |
| ------------------------------------ | ------------------------------------------------------------- |
| `overlaps(other: CsvScope): boolean` | `true` se i due scope si intersecano (o uno dei due è totale) |
```

Verify the real method table against `src/domain/value-objects/CsvScope.ts` before finalizing — read the file, don't guess the method list from this plan.

- [ ] **Step 3: Commit**

```bash
git add SPECS_ALDO/02_CDU_STRUTTURA.md SPECS_ALDO/03_VALUE_OBJECTS_ED_ENUM.md
git commit -m "docs(specs): fix Principio 6 self-contradiction and CsvScope drift (report §1.4, §3.1)"
```

---

### Task 2: Rename `isPresenteLista` → `hasElenco`

**Files:**

- Modify: `src/application/context-engine/Cdu.ts:272`
- Modify: `src/application/context-engine/providers/PianiPersClasseProvider.ts:57`
- Modify: `SPECS_ALDO/02_CDU_STRUTTURA.md:342,1000,1520`
- Test: `test/unit/application/context-engine/piani-pers-classe-provider.test.ts`

**Interfaces:**

- Produces: `CduClasse.didattica.pianiPersonalizzati.nonVerbalizzati.hasElenco: boolean` (was `isPresenteLista`), sibling of `elenco: Array<...>`.

- [ ] **Step 1: Update the failing test first**

Open `test/unit/application/context-engine/piani-pers-classe-provider.test.ts`, find every assertion reading `.isPresenteLista` on the provider's output, and rewrite to `.hasElenco`.

- [ ] **Step 2: Run it to confirm it now fails against current code**

```bash
npx jest --config jest.config.cjs test/unit/application/context-engine/piani-pers-classe-provider.test.ts
```

Expected: FAIL (`hasElenco` is `undefined`, `isPresenteLista` no longer read).

- [ ] **Step 3: Rename in `Cdu.ts`**

At `src/application/context-engine/Cdu.ts:272`, change:

```ts
isPresenteLista: boolean;
```

to:

```ts
hasElenco: boolean;
```

- [ ] **Step 4: Rename in the provider**

At `src/application/context-engine/providers/PianiPersClasseProvider.ts:57`, change:

```ts
isPresenteLista: items.some((item) => item.stato !== StatoDocumento.VERBALIZZATO),
```

to:

```ts
hasElenco: items.some((item) => item.stato !== StatoDocumento.VERBALIZZATO),
```

- [ ] **Step 5: Run the test to confirm it passes**

```bash
npx jest --config jest.config.cjs test/unit/application/context-engine/piani-pers-classe-provider.test.ts
```

Expected: PASS

- [ ] **Step 6: Update the spec**

In `SPECS_ALDO/02_CDU_STRUTTURA.md`:

- Line 342: `isPresenteLista: boolean         # true sse elenco non vuoto (per {{#isPresenteLista}}/{{^}})` → `hasElenco: boolean               # true sse elenco non vuoto (per {{#hasElenco}}/{{^}})`
- Line 1000: replace both `{{#focus.classe.didattica.pianiPersonalizzati.nonVerbalizzati.isPresenteLista}}` and the closing `{{/...isPresenteLista}}` with `...hasElenco}}` / `{{/...hasElenco}}`.
- Line 1520: `"nonVerbalizzati": { "isPresenteLista": false, "elenco": [] }` → `"nonVerbalizzati": { "hasElenco": false, "elenco": [] }`

- [ ] **Step 7: Typecheck and full unit run**

```bash
npm run typecheck
npx jest --config jest.config.cjs test/unit
```

- [ ] **Step 8: Commit**

```bash
git add src/application/context-engine/Cdu.ts src/application/context-engine/providers/PianiPersClasseProvider.ts test/unit/application/context-engine/piani-pers-classe-provider.test.ts SPECS_ALDO/02_CDU_STRUTTURA.md
git commit -m "refactor(cdu): rename isPresenteLista to hasElenco for hasXxx companion-boolean convention (report §1.1)"
```

**Manual follow-up (not part of this task):** any live `CONF_MAIL`/`CONF_DOC` template in Google Sheets referencing `{{#...isPresenteLista}}` must be updated by hand — this repo cannot enumerate or edit those rows.

---

### Task 3: `EsameConfig` — `prima_prova`/`seconda_prova` → camelCase

**Files:**

- Modify: `src/domain/value-objects/EsameConfig.ts`
- Modify: `SPECS_ALDO/03_VALUE_OBJECTS_ED_ENUM.md:408-417`
- Modify fixtures: `test/fixtures/tables.ts:94`, `src/onlinetests/data/SharedTestDatabaseBuilder.ts:97-98`
- Test: `test/unit/domain/esame-config.test.ts`

**Interfaces:**

- Produces: `EsameConfig.fromJson` now reads `{ primaProva?: string[]; secondaProva?: string[] }` from the `MATERIE.ESAME_CFG` JSON cell. `isPrimaProvaPerIndirizzo`/`isSecondaProvaPerIndirizzo` signatures unchanged.

- [ ] **Step 1: Update `test/unit/domain/esame-config.test.ts` fixtures/assertions first**

Read the file; every JSON literal built as `{"prima_prova": [...]}` / `{"seconda_prova": [...]}` (as a string passed to `EsameConfig.fromJson`) becomes `{"primaProva": [...]}` / `{"secondaProva": [...]}`.

- [ ] **Step 2: Run it, confirm it fails**

```bash
npx jest --config jest.config.cjs test/unit/domain/esame-config.test.ts
```

Expected: FAIL

- [ ] **Step 3: Update `EsameConfig.ts`**

```ts
interface EsameConfigJson {
  primaProva?: string[];
  secondaProva?: string[];
}
```

and in `fromJson`:

```ts
return new EsameConfig(parsed.primaProva ?? [], parsed.secondaProva ?? []);
```

(the internal field names `primaProva`/`secondaProva` on the class itself are already camelCase and unchanged — only the parsed JSON key names move.)

- [ ] **Step 4: Run it, confirm it passes**

```bash
npx jest --config jest.config.cjs test/unit/domain/esame-config.test.ts
```

Expected: PASS

- [ ] **Step 5: Update remaining fixtures**

- `test/fixtures/tables.ts:94`: `ESAME_CFG: '{"prima_prova":["SCIENTIFICO"],"seconda_prova":["LSSA"]}'` → `ESAME_CFG: '{"primaProva":["SCIENTIFICO"],"secondaProva":["LSSA"]}'`
- `src/onlinetests/data/SharedTestDatabaseBuilder.ts:97-98`:

```ts
ITA: JSON.stringify({ primaProva: [INDIRIZZO_E2E, INDIRIZZO_E2E_CLASSICO] }),
MAT: JSON.stringify({ secondaProva: [INDIRIZZO_E2E, INDIRIZZO_E2E_CLASSICO] })
```

- [ ] **Step 6: Run the full suites that touch `EsameConfig` consumers**

```bash
npx jest --config jest.config.cjs test/unit/application/risolutore-ruoli-service.test.ts
npx jest --config jest.config.cjs test/unit/application/context-engine/mappers/subject-vm-mapper.test.ts
npx jest --config jest.config.cjs test/unit/infrastructure/materia-repository.test.ts
```

These consume `EsameConfig` behaviorally, not the raw JSON keys directly — expect them to pass unchanged, but run to be sure none embeds a raw `prima_prova`/`seconda_prova` literal too (grep first: `grep -rn "prima_prova\|seconda_prova" test/ src/` should return nothing after this task).

- [ ] **Step 7: Update the spec**

`SPECS_ALDO/03_VALUE_OBJECTS_ED_ENUM.md:408-417`, change the JSON block:

```json
{
  "primaProva": ["IndirizzoId", ...],
  "secondaProva": ["IndirizzoId", ...]
}
```

and the method table's prose (`prima_prova` → `primaProva`, `seconda_prova` → `secondaProva`).

- [ ] **Step 8: Typecheck**

```bash
npm run typecheck
```

- [ ] **Step 9: Commit**

```bash
git add src/domain/value-objects/EsameConfig.ts test/unit/domain/esame-config.test.ts test/fixtures/tables.ts src/onlinetests/data/SharedTestDatabaseBuilder.ts SPECS_ALDO/03_VALUE_OBJECTS_ED_ENUM.md
git commit -m "refactor(esame-config): camelCase prima_prova/seconda_prova JSON keys for domain-wide JSON casing consistency (report §2.2)"
```

**Manual follow-up (not part of this task):** existing `MATERIE.ESAME_CFG` rows in the live Google Sheet still use `prima_prova`/`seconda_prova` and must be renamed by hand (or via a future one-off migration script written with real Sheet access) — until then, those rows silently parse to empty arrays (`fromJson` returns `[]` for absent keys, not an error), so exam-paper flags will read as false for unmigrated rows.

---

### Task 4: `articolazione.parent.id` → `articolazione.parent.nome`

**Files:**

- Modify: `src/application/context-engine/providers/ClasseProvider.ts:132-141`
- Modify: `src/application/context-engine/Cdu.ts:180-184`
- Modify: `SPECS_ALDO/02_CDU_STRUTTURA.md:183`

No test consumers found for `articolazione.parent.id` in `test/` (verified via `grep -rn "articolazione\.parent\|parent\.id" src/ SPECS_ALDO/` — only the type declaration and the provider itself matched). No fixture updates needed.

- [ ] **Step 1: Read `ClasseProvider.ts` around lines 129-141 to confirm current shape**

```bash
sed -n '125,145p' "src/application/context-engine/providers/ClasseProvider.ts"
```

- [ ] **Step 2: Rename the field in `buildParent`**

Change:

```ts
return { id: parentId, anno: parentClasse.anno.value, indirizzi };
```

to:

```ts
return { nome: parentId, anno: parentClasse.anno.value, indirizzi };
```

(`parentId` is `ClasseId`-as-string, which is the class's `nome` — same value, renamed key, matching `focus.classe.anagrafica.nome`'s convention.)

- [ ] **Step 3: Update the `Cdu.ts` type**

At `src/application/context-engine/Cdu.ts:180-184`:

```ts
parent: {
  nome: string;
  anno: number;
  indirizzi: Array<{ sigla: string; nome: string; nomeSintetico: string; tipo: string }>;
} | null;
```

- [ ] **Step 4: Typecheck (this is the test — a type-only rename with no dedicated unit test)**

```bash
npm run typecheck
```

Expected: no errors (confirms no other `.id` read on this specific `parent` object slipped through).

- [ ] **Step 5: Run the classe-provider and articolazione-related unit tests**

```bash
npx jest --config jest.config.cjs test/unit/application/context-engine
```

- [ ] **Step 6: Update the spec**

`SPECS_ALDO/02_CDU_STRUTTURA.md:183`: change the `parent` field's `id` line to `nome`, keep the "ID classe parent" comment but reword to "nome/ID classe parent (coincidono, `CLASSI` non ha una colonna NOME separata)".

- [ ] **Step 7: Commit**

```bash
git add src/application/context-engine/providers/ClasseProvider.ts src/application/context-engine/Cdu.ts SPECS_ALDO/02_CDU_STRUTTURA.md
git commit -m "refactor(cdu): rename articolazione.parent.id to .nome, matching anagrafica.nome convention (report §1.2)"
```

---

### Task 5: Canonical `documenti.items[]` shape — align `id`, add `sottotipo`/`notificato`

**Deviates from the report as agreed:** `id` stays on all three shapes (it feeds `boxes.ts` attachment resolution); this task documents it as internal/attachment-only rather than removing it, and closes the actual gap (missing `sottotipo`/`notificato`, and the false "stessa forma" claim).

**Files:**

- Modify: `src/application/context-engine/Cdu.ts:280-290` (`CduClasse.didattica.documenti`), `:327-341` (`CduAlunno.didattica.documenti`), `:364-382` (`CduDipartimentoFocus`)
- Modify: `src/application/context-engine/providers/DocumentiClasseProvider.ts`
- Modify: `src/application/context-engine/providers/DocumentiProvider.ts`
- Modify: `src/application/context-engine/providers/DipartimentoProvider.ts`
- Modify: `src/application/email/boxes.ts:32-40` (`DocumentoItem` interface)
- Modify: `SPECS_ALDO/02_CDU_STRUTTURA.md` §4.1, §4.2, §4.6 (around lines 349-354, 414-419, 493-501)
- Test: whichever unit tests cover these three providers (locate with `grep -rl "DocumentiClasseProvider\|DocumentiProvider\|DipartimentoProvider" test/unit`)

**Interfaces:**

- Produces (new canonical shape, all three focuses): `{ id?: string; idGen: string; tipo: string; sottotipo: string; nome: string; stato: string; notificato: boolean; link: string; dataCreazione: string }`. `id` is present at runtime everywhere (Drive file ID) but is documented as **not for template use** — it exists for `boxes.ts`'s internal attachment-ID plumbing, which reads the exact same array via `aggregaDati()`.

- [ ] **Step 1: Locate and open the provider tests**

```bash
grep -rl "DocumentiClasseProvider\|DipartimentoProvider" test/unit
```

Read each matched file's assertions on `.items` shape before editing — they'll need `sottotipo`/`notificato` expectations added.

- [ ] **Step 2: Update `LogDocumento`-to-item mapping in all three providers to add `sottotipo`/`notificato`**

In `src/application/context-engine/providers/DocumentiClasseProvider.ts` (inside the `.map` at lines ~30-38):

```ts
return this.logDocs.findByClasse(classe).map((l) => ({
  id: l.id ?? undefined,
  nome: l.nome,
  link: l.getLink(),
  tipo: l.tipo,
  idGen: l.idGen,
  sottotipo: l.getSottotipo(),
  stato: l.getStato(),
  notificato: l.isNotificato(),
  dataCreazione: l.getDataCreazione()
}));
```

Apply the identical two added lines (`sottotipo: l.getSottotipo(), notificato: l.isNotificato(),`) to:

- `src/application/context-engine/providers/DocumentiProvider.ts` (its `.map`, currently at lines 17-25)
- `src/application/context-engine/providers/DipartimentoProvider.ts` (its `.map`, currently at lines 39-47 — variable is `l` there too)

`LogDocumento.getSottotipo()` and `LogDocumento.isNotificato()` already exist (`src/domain/entities/LogDocumento.ts:62-74`) — no entity change needed.

- [ ] **Step 3: Update the three `Cdu.ts` interfaces**

`CduClasse.didattica.documenti.items` (currently lines 281-288):

```ts
items: Array<{
  id?: string | undefined;
  nome: string;
  link: string;
  tipo: string;
  idGen: string;
  sottotipo: string;
  stato: string;
  notificato: boolean;
  dataCreazione: string;
}>;
```

Apply the identical shape to `CduAlunno.didattica.documenti.items` (currently lines 328-335) and to `CduDipartimentoFocus.didattica.documenti.items` (currently lines 371-379 — already has `id?`, just add `sottotipo`/`notificato`).

- [ ] **Step 4: Update `boxes.ts`'s `DocumentoItem` interface to match**

At `src/application/email/boxes.ts:32-40`:

```ts
export interface DocumentoItem {
  id?: string | undefined;
  nome: string;
  link: string;
  tipo: string;
  idGen: string;
  sottotipo: string;
  stato: string;
  notificato: boolean;
  dataCreazione: string;
}
```

Check `documentoItem()` (line ~563) and `cartellaItem()` (line ~577, if it maps a different entity — read it) build objects matching this shape; add `sottotipo`/`notificato` there too if those functions independently construct the item (they map from `LogDocumento`/`LogCartella` directly, not from the CDU array, so verify field availability on `LogCartella` too before assuming parity — read `src/domain/entities/LogCartella.ts` if `cartellaItem` needs it. If `LogCartella` has no sottotipo/notificato equivalent, keep `DocumentoItem` a union-compatible superset and default those two fields to `''`/`false` in `cartellaItem`).

- [ ] **Step 5: Run typecheck to find every place the widened interface breaks a literal object without the new required fields**

```bash
npm run typecheck
```

Fix every reported call site by adding `sottotipo`/`notificato` (test fixtures, `SharedTestDatabaseBuilder.ts`, `SampleDatabaseBuilder.ts`, `Seeders.ts` wherever they construct a `DocumentoItem`-shaped literal directly rather than through `LogDocumento`).

- [ ] **Step 6: Update/extend the provider unit tests found in Step 1** to assert `sottotipo`/`notificato` on returned items.

- [ ] **Step 7: Run the affected unit tests**

```bash
npx jest --config jest.config.cjs test/unit/application/context-engine
npx jest --config jest.config.cjs test/unit/application/email-boxes.test.ts
```

Expected: PASS

- [ ] **Step 8: Fix the stale "stessa forma" claim and update the spec tables**

In `SPECS_ALDO/02_CDU_STRUTTURA.md`:

- §4.1 (~349-354) and §4.2 (~414-419): add `sottotipo`, `notificato` rows to the `items[]` field table; note `id` is present but internal-only (attachment resolution), not documented for template authors.
- §4.6 (~493-501): same table update; the comment at line 493 currently claims "Stessa forma di `DocumentiClasseProvider`" — after this task it becomes literally true (modulo the internal `id` field, present in all three now, not just dipartimento) — reword the comment to state the canonical 9-field shape explicitly (8 template-facing fields + internal `id`).

- [ ] **Step 9: Full typecheck + unit run**

```bash
npm run typecheck
npm test
```

- [ ] **Step 10: Commit**

```bash
git add src/application/context-engine/Cdu.ts src/application/context-engine/providers/DocumentiClasseProvider.ts src/application/context-engine/providers/DocumentiProvider.ts src/application/context-engine/providers/DipartimentoProvider.ts src/application/email/boxes.ts SPECS_ALDO/02_CDU_STRUTTURA.md
git commit -m "refactor(cdu): align documenti.items[] shape across classe/alunno/dipartimento with sottotipo+notificato (report §1.3, id kept for attachment resolution)"
```

---

### Task 6: `ArticolazioneConfig.partners` — CSV string → JSON array

**Files:**

- Modify: `src/domain/value-objects/ArticolazioneConfig.ts`
- Modify: `SPECS_ALDO/03_VALUE_OBJECTS_ED_ENUM.md:373-390`
- Modify fixtures: `test/fixtures/tables.ts:36`, `src/onlinetests/data/SharedTestDatabaseBuilder.ts:619,622,626`
- Test: wherever `ArticolazioneConfig` is unit-tested (`grep -rl "ArticolazioneConfig" test/unit`)

**Interfaces:**

- Consumes: nothing new. `ArticolazioneConfig.partners: ClasseId[]` (public field) is unchanged in shape/type — only the raw-JSON parsing source format changes.
- Produces: `ArticolazioneConfig.fromJson` now expects `{ partners?: string[] | null }` instead of `{ partners?: string | null }`.

- [ ] **Step 1: Locate and read the existing `ArticolazioneConfig` unit test**

```bash
grep -rl "ArticolazioneConfig" test/unit
```

Update every `fromJson('{"partners":"A,B",...}')`-style literal to `fromJson('{"partners":["A","B"],...}')`.

- [ ] **Step 2: Run it, confirm it fails**

```bash
npx jest --config jest.config.cjs <path-found-in-step-1>
```

- [ ] **Step 3: Update `ArticolazioneConfig.ts`**

```ts
interface ArticolazioneJson {
  parent?: string | null;
  partner?: string | null;
  partners?: string[] | null;
}
```

and the parsing block (replace the CSV split):

```ts
const partners = Array.isArray(obj.partners)
  ? obj.partners
      .filter((s): s is string => typeof s === 'string' && s.trim() !== '')
      .map((s) => ClasseId.of(s.trim()))
  : [];
```

Update the doc comment at the top of the file (lines 10-14) to show the new example:

```
* - parent class:   parent=null, partner=null, partners=["1F-LSO","1F-LSS"]
* - partner class:  parent="1F", partner="1F-LSS", partners=null
```

- [ ] **Step 4: Run it, confirm it passes**

```bash
npx jest --config jest.config.cjs <path-found-in-step-1>
```

- [ ] **Step 5: Update remaining fixtures**

- `test/fixtures/tables.ts:36`: `ARTICOLAZIONE: '{"parent":null,"partner":null,"partners":"1F-LSO,1F-LSS"}'` → `'{"parent":null,"partner":null,"partners":["1F-LSO","1F-LSS"]}'`
- `src/onlinetests/data/SharedTestDatabaseBuilder.ts:619,622`: `JSON.stringify({ parent: null, partner: null, partners: '3C-S,3C-C' })` → `JSON.stringify({ parent: null, partner: null, partners: ['3C-S', '3C-C'] })` (and the `5B-S,5B-C` sibling at line 622 likewise).
- Line 626 (`return JSON.stringify({ ...parsed, partners: null });`) is unaffected — `null` stays `null`.
- Grep for any other CSV-shaped `partners` string literal you may have missed: `grep -rn '"partners":"' src/ test/` should return nothing after this step.

- [ ] **Step 6: Run the articolazione-related test suites**

```bash
npx jest --config jest.config.cjs test/unit/domain
npx jest --config jest.config.cjs test/unit/infrastructure/classe-repository.test.ts
```

(confirm the exact classe-repository test filename first with `ls test/unit/infrastructure | grep -i classe`)

- [ ] **Step 7: Update the spec**

`SPECS_ALDO/03_VALUE_OBJECTS_ED_ENUM.md:373-390`: change the JSON block's `partners` line to:

```json
"partners": ["ClasseId", "ClasseId"] | null  // esattamente due elementi quando presente, mai più o meno; l'ordine determina PRIMO/SECONDO gruppo
```

Update the surrounding prose ("L'ordine del CSV in `partners`..." → "L'ordine dell'array in `partners`...").

- [ ] **Step 8: Typecheck**

```bash
npm run typecheck
```

- [ ] **Step 9: Commit**

```bash
git add src/domain/value-objects/ArticolazioneConfig.ts test/fixtures/tables.ts src/onlinetests/data/SharedTestDatabaseBuilder.ts SPECS_ALDO/03_VALUE_OBJECTS_ED_ENUM.md
git commit -m "refactor(articolazione-config): partners CSV string to native JSON array (report §2.4)"
```

**Manual follow-up (not part of this task):** existing `CLASSI.ARTICOLAZIONE` rows for articulated parent classes in the live Sheet still carry `"partners":"A,B"` and must be converted by hand — until migrated, `fromJson` will treat the CSV string as a non-array `partners` and silently produce `[]`, making the class look non-articulated (`isParent()` returns false). This is a behavior change from today's parsing — call it out to whoever runs the migration as a hard cutover, not a gradual one.

---

### Task 7: `CattedraVM` — drop `classeId`, keep only `classeNome`

**Files:**

- Modify: `src/application/context-engine/Cdu.ts:402-409`
- Modify: `src/application/pipelines/emailSteps.ts:336-341`
- Test: `test/unit/application/pipelines/email-steps.test.ts:617,618,643,823` (and any other `.classeId` reads on `cattedre`)

**Interfaces:**

- Produces: `CattedraVM { classeNome: string; anno: number; sezione: string; materie: SubjectVM[] }` — `classeId` field removed entirely.

- [ ] **Step 1: Update the test first**

In `test/unit/application/pipelines/email-steps.test.ts`, every:

```ts
expect(contesto.cattedre.map((c) => c.classeId)).toEqual([...]);
```

becomes:

```ts
expect(contesto.cattedre.map((c) => c.classeNome)).toEqual([...]);
```

(lines 617, 643, 823 per the current file — re-check with `grep -n "c.classeId" test/unit/application/pipelines/email-steps.test.ts` since line numbers shift as you edit). Do **not** touch lines 1895/1947 (`classeId: ClasseId.of('5A')`) — those are a different, unrelated fixture object (a `BuildParams`-shaped input, not `CattedraVM`); confirm by reading their surrounding context before deciding.

- [ ] **Step 2: Run it, confirm it fails**

```bash
npx jest --config jest.config.cjs test/unit/application/pipelines/email-steps.test.ts
```

- [ ] **Step 3: Remove `classeId` from the `CattedraVM` interface**

At `src/application/context-engine/Cdu.ts:402-409`:

```ts
export interface CattedraVM {
  classeNome: string;
  anno: number;
  sezione: string;
  materie: SubjectVM[];
}
```

(drop the `classeId: string;` line and its doc comment about "always identical to classeId" — no longer applicable once there's only one field.)

- [ ] **Step 4: Remove the field from `buildCattedre`'s construction**

At `src/application/pipelines/emailSteps.ts:336-341`:

```ts
const cattedre: CattedraVM[] = [...gruppi.values()].map(({ classe, materie }) => ({
  classeNome: classe.nome,
  anno: classe.anno.value,
  sezione: classe.sezione,
  materie: dedupeSubjectsMainOverItp(materie)
}));
```

- [ ] **Step 5: Typecheck — this also catches any other reader of `CattedraVM.classeId` missed by grep**

```bash
npm run typecheck
```

- [ ] **Step 6: Run the tests**

```bash
npx jest --config jest.config.cjs test/unit/application/pipelines/email-steps.test.ts
npx jest --config jest.config.cjs test/unit/application/email-boxes.test.ts
```

(`boxes.ts`'s `renderCattedreBox` already only reads `c.classeNome`/`c.materie` — confirmed by reading the source; this run is a regression check, not expected to need edits.)

- [ ] **Step 7: Commit**

```bash
git add src/application/context-engine/Cdu.ts src/application/pipelines/emailSteps.ts test/unit/application/pipelines/email-steps.test.ts
git commit -m "refactor(cdu): drop redundant CattedraVM.classeId, keep classeNome only (report §1.2)"
```

**Manual follow-up (not part of this task):** any live `CONF_MAIL` template referencing `{{classeId}}` inside a `destinatario.contesto.cattedre[]` loop (feature shipped 2026-08-22, per project memory) must be updated by hand to `{{classeNome}}` — this repo cannot enumerate those rows.

---

### Task 8: `CONF_MAIL.ALLEGATI` → `CONF_MAIL.ALLEGATI_STATICI`

**Files:**

- Modify: `src/config/schema.ts:46`
- Modify: `src/domain/entities/ConfigurazioneEmail.ts:70,149`
- Modify: `SPECS_ALDO/01_SCHEMA_DATABASE.md:393`
- Modify every test/fixture referencing `COL_CONF_MAIL.ALLEGATI` (mechanical rename, see Step 3 for the full file list)

**Interfaces:**

- Produces: `COL_CONF_MAIL.ALLEGATI_STATICI: 'ALLEGATI_STATICI'` (was `COL_CONF_MAIL.ALLEGATI: 'ALLEGATI'`). `ConfigurazioneEmail.getAllegati()`'s public method name and behavior are unchanged — only the underlying column constant/property it reads moves.

- [ ] **Step 1: Rename the schema constant**

At `src/config/schema.ts:46`, inside `COL_CONF_MAIL`:

```ts
ALLEGATI_STATICI: 'ALLEGATI_STATICI',
```

(replacing `ALLEGATI: 'ALLEGATI',`)

- [ ] **Step 2: Update `ConfigurazioneEmail.ts`**

At line 70:

```ts
this.allegatiRaw = data[COL_CONF_MAIL.ALLEGATI_STATICI] ?? null;
```

At line 149 (inside `toData()`):

```ts
[COL_CONF_MAIL.ALLEGATI_STATICI]: this.allegatiRaw
```

- [ ] **Step 3: Run typecheck to enumerate every remaining `COL_CONF_MAIL.ALLEGATI` reference (it will now be a compile error, which is the exhaustive list you need)**

```bash
npm run typecheck
```

Fix each reported file by changing `COL_CONF_MAIL.ALLEGATI` → `COL_CONF_MAIL.ALLEGATI_STATICI`. Based on current grep, expect to touch:

- `test/fixtures/tables.ts`
- `test/unit/onlinetests/sample-database-builder.test.ts`
- `test/unit/onlinetests/reset-e2e-history-tables.test.ts`
- `test/unit/onlinetests/pipeline-checks.test.ts`
- `test/unit/onlinetests/e2e-sample-database-builder.test.ts`
- `test/unit/domain/configurazione-email.test.ts`
- `test/unit/application/email-notification-service.test.ts`
- `test/unit/application/pipelines/email-steps.test.ts`
- `test/unit/infrastructure/config-repositories.test.ts`
- `test/integration/cattedra-chain-verification.test.ts`
- `src/onlinetests/SampleDatabaseBuilder.ts:386`
- `src/onlinetests/E2eTemplateProvisioner.ts:428` (this one is a comment string, `'... allegato tramite CONF_MAIL.ALLEGATI ...'` — update the prose too, not just code)
- `src/onlinetests/index.ts:499`
- `src/onlinetests/data/Seeders.ts:698`
- `src/onlinetests/data/SharedTestDatabaseBuilder.ts:1305,1330,1354,1404,1431,1448`

This is a pure find/replace of the identifier `COL_CONF_MAIL.ALLEGATI` → `COL_CONF_MAIL.ALLEGATI_STATICI` in every file above (verify with `grep -rn "COL_CONF_MAIL.ALLEGATI\b" src/ test/` before and after — it must return zero matches for the bare `.ALLEGATI` afterward, only `.ALLEGATI_STATICI`).

- [ ] **Step 4: Run the full unit suite**

```bash
npm test
```

Expected: PASS, zero remaining references.

- [ ] **Step 5: Update the spec**

`SPECS_ALDO/01_SCHEMA_DATABASE.md:393`: rename the column entry from `ALLEGATI` to `ALLEGATI_STATICI`, keep the description ("Array di ID Drive da allegare staticamente; usare `[]` quando non sono configurati allegati").

- [ ] **Step 6: Typecheck one more time to be sure**

```bash
npm run typecheck
```

- [ ] **Step 7: Commit**

```bash
git add src/config/schema.ts src/domain/entities/ConfigurazioneEmail.ts SPECS_ALDO/01_SCHEMA_DATABASE.md test/ src/onlinetests/
git commit -m "refactor(schema): rename CONF_MAIL.ALLEGATI to ALLEGATI_STATICI, disambiguating from LOG_MAIL.ALLEGATI's object shape (report §2.3)"
```

**Manual follow-up (not part of this task, per user decision):** the live `CONF_MAIL` sheet's `ALLEGATI` column header must be renamed to `ALLEGATI_STATICI` by hand (a straight header-cell rename, values untouched — the array-of-Drive-IDs shape is unchanged, only the column name moves).

---

### Task 9: `BoxConfig` — camelCase outlier keys → `UPPER_SNAKE_CASE`

**Files:**

- Modify: `src/application/email/boxes.ts:192-199,238-244`
- Modify: `SPECS_ALDO/03_VALUE_OBJECTS_ED_ENUM.md:568-589`
- Modify fixtures: `test/unit/application/email-boxes.test.ts`, `test/unit/application/pipelines/email-steps.test.ts`, `test/unit/onlinetests/e2e-sample-database-builder.test.ts` (every literal `BOX_CFG`/`confMail([...])` object using `displayMode`/`arricchisciConStorico`/`configArricchimento`/`templateRiga` as object keys)

**Interfaces:**

- Consumes: `BoxConfig` (the per-block object inside `CONF_MAIL.BOX_CFG`'s JSON array) now uses `DISPLAY_MODE`, `ARRICCHISCI_CON_STORICO`, `CONFIG_ARRICCHIMENTO` (with nested `TEMPLATE_RIGA`) instead of the camelCase originals — joining the other 10 already-`UPPER_SNAKE_CASE` keys (`TIPO_BOX`, `ORDINE`, `ALLEGA`, `PREREQUISITI`, `MOSTRA_SE_VUOTO`, `TESTO_VUOTO`, `COLORE`, `CONTENUTO`, `DATI_SORGENTE`, `TITOLO`).

- [ ] **Step 1: Update `test/unit/application/email-boxes.test.ts` fixtures/assertions first**

Every object literal built with `arricchisciConStorico:`, `configArricchimento:`, `displayMode:`, or a nested `templateRiga:` key (confirmed at lines 542-544, 566, 583-584, 608-609, 621, 628, 635, 740-741, 773, and any others — re-grep before editing since line numbers will have shifted from earlier tasks) becomes `ARRICCHISCI_CON_STORICO:`, `CONFIG_ARRICCHIMENTO:`, `DISPLAY_MODE:`, `TEMPLATE_RIGA:` respectively. The `configArricchimento: { templateRiga: '...' }` pattern becomes `CONFIG_ARRICCHIMENTO: { TEMPLATE_RIGA: '...' }`.

- [ ] **Step 2: Run it, confirm it fails**

```bash
npx jest --config jest.config.cjs test/unit/application/email-boxes.test.ts
```

- [ ] **Step 3: Update `boxes.ts`'s two reader functions**

`renderDocumentiBox` (currently lines 192-199):

```ts
const arricchisci = options.config['ARRICCHISCI_CON_STORICO'] === true;
const configArricchimento = options.config['CONFIG_ARRICCHIMENTO'] as
  Record<string, unknown> | undefined;
const templateRiga = arricchisci ? str(configArricchimento?.['TEMPLATE_RIGA']) : '';

if (templateRiga === '' || storicoRef === undefined)
  return renderRigaStandard(items, str(options.config['DISPLAY_MODE']));
```

`renderPianiPersBox` (currently lines 238-244):

```ts
const arricchisci = options.config['ARRICCHISCI_CON_STORICO'];
const configArricchimento = options.config['CONFIG_ARRICCHIMENTO'] as
  Record<string, unknown> | undefined;
const explicitTemplate = str(configArricchimento?.['TEMPLATE_RIGA']);
```

- [ ] **Step 4: Run it, confirm it passes**

```bash
npx jest --config jest.config.cjs test/unit/application/email-boxes.test.ts
```

- [ ] **Step 5: Fix the remaining fixture files found by grep**

```bash
grep -rln "arricchisciConStorico\|configArricchimento\|displayMode" test/ src/onlinetests
```

Apply the same key renames to every match (`test/unit/application/pipelines/email-steps.test.ts`, `test/unit/onlinetests/e2e-sample-database-builder.test.ts`, and any `src/onlinetests/**` seed data using these keys — re-run the grep after editing to confirm zero remaining matches).

- [ ] **Step 6: Run the affected suites**

```bash
npx jest --config jest.config.cjs test/unit/application/pipelines/email-steps.test.ts
npx jest --config jest.config.cjs test/unit/onlinetests/e2e-sample-database-builder.test.ts
```

- [ ] **Step 7: Update the spec**

`SPECS_ALDO/03_VALUE_OBJECTS_ED_ENUM.md:568-589`, in the `BoxConfig` JSON block, change:

```json
  "DISPLAY_MODE": "nome | link | nome+link | sololink",
  "ARRICCHISCI_CON_STORICO": true,
  "CONFIG_ARRICCHIMENTO": { "TEMPLATE_RIGA": "string Mustache, contesto { corrente, storico }" },
```

(replacing the three camelCase lines, keeping their position in the block and every other key untouched).

- [ ] **Step 8: Full unit run + typecheck**

```bash
npm run typecheck
npm test
```

- [ ] **Step 9: Commit**

```bash
git add src/application/email/boxes.ts SPECS_ALDO/03_VALUE_OBJECTS_ED_ENUM.md test/unit/application/email-boxes.test.ts test/unit/application/pipelines/email-steps.test.ts test/unit/onlinetests/e2e-sample-database-builder.test.ts
git commit -m "refactor(boxes): unify BoxConfig casing to UPPER_SNAKE_CASE, matching CONF_MAIL column-mirroring convention (report §2.1)"
```

**Manual follow-up (not part of this task, per user decision):** existing `CONF_MAIL.BOX_CFG` rows in the live Sheet using `displayMode`/`arricchisciConStorico`/`configArricchimento`/`templateRiga` must be renamed by hand. Per the report, `arricchisciConStorico` defaults to "on" for `piani_pers_da_inviare` in several rows — until migrated, those rows will silently stop reading the historical-enrichment config (the code no longer recognizes the old camelCase keys) and fall back to plain rendering, not error. Flag this explicitly to whoever runs the migration — it's a silent behavior regression, not a loud failure, until the Sheet catches up.

---

## Self-Review Notes (already applied above, recorded for the executor)

- **Spec coverage:** all 10 report findings (§1.1-§1.4, §2.1-§2.4, §3.1) map onto Tasks 1-9 (Task 1 bundles §1.4+§3.1 as pure spec-text; every other task is 1:1 with a report finding).
- **Deviations from the literal report, both agreed with the user before this plan was written:** Task 5 keeps `id` in `documenti.items[]` instead of removing it (§1.3) — removing it breaks live email-attachment resolution in `boxes.ts`. Tasks 3, 6, 8, 9 stop at code/spec/fixtures — no Sheet-migration script is written or run, since this repo has no production Sheet access; each ends with a **Manual follow-up** note instead.
- **Type consistency check:** `CattedraVM` (Task 7) and `documenti.items[]` (Task 5) are the two shared types touched by more than one task — verified no task downstream of Task 5 or Task 7 references the old field names (`classeId`, missing `sottotipo`/`notificato`).
- **Ordering:** tasks are sequenced cheap-to-expensive per the report's own priority table, and are independent of each other (no task's Files overlap another's, except Task 5 and Task 9 both touch `boxes.ts` — Task 5 edits the `DocumentoItem` interface near the top of the file, Task 9 edits two functions later in the file; run them in the written order — 5 before 9 — to avoid a merge conflict if executed by different subagents in parallel).
