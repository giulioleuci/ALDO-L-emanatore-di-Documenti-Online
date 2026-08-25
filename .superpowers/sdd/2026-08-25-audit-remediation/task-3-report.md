# Task 3 report — Entity `*Data` typing and the `_` column convention

Status: DONE
Commit: `c6c752e` (single commit; parent `ba24894`)

## Scope check against the brief

`src/domain/entities/` has 23 files, not 21: `AldoEntity.ts` (base class, no
`*Data` type, excluded per brief) and `ConsiglioDiClasse.ts` (an in-memory
aggregate over `Docente`/`MateriaId`, never hydrated from a sheet row, has no
`*Data` type at all — out of scope, left untouched). The 21 files the brief
means are exactly the 21 entities that *do* declare a `*Data` type: 3 stay
open, 18 close. I did not touch `AldoEntity.ts` or `ConsiglioDiClasse.ts`.

Before writing any type I grepped every `*Data` type name across `src/` and
`test/` and confirmed none of them is referenced anywhere outside its own
entity file — safe to narrow without a ripple effect elsewhere.

## Regression-guard test — `test/unit/domain/entities-row-typing.test.ts`

Written verbatim from the brief's Step 1 (new file, 2 tests). Ran it against
the **original** (pre-change) code first, confirming today's index-signature
types let it pass:

```
Test Suites: 1 passed, 1 total
Tests:       2 passed, 2 total
```

Then applied the whole typing change and re-ran — still 2/2 pass. Its job per
the brief is exactly this: prove the hydration boundary still compiles and
works after the signature is removed, not act as a red-first test.

## The 3 entities that stayed open, and why

- **`ClasseData`** (`src/domain/entities/Classe.ts`) — CLASSI carries a
  dynamic column per subject/ITP/specificità plus `_`-prefixed user columns.
  Doc comment:
  > CLASSI row. Matrice di assegnazione cattedre: oltre alle colonne fisse
  > sotto, la tabella porta una colonna dinamica per ogni materia (`ITA`), per
  > ogni ITP (`INF.itp`) e per ogni specifica (`INTERPRET.CHITARRA`), più le
  > colonne riservate all'utente con prefisso `_`. Tipo volutamente aperto.
  > Colonne fisse (01 §CLASSI): ID, ANNO, TERMINALE, SEZ, INDIRIZZO, COORD,
  > RUOLI, ATTIVA, ARTICOLAZIONE, STORICO.

- **`CarenzaData`** (`src/domain/entities/Carenza.ts`) — CARENZE is a
  student×date shortfall matrix with one dynamic column per subject; the
  entity keeps its raw row (`getCella`) precisely so `CarenzaRepository` can
  read those cells. Doc comment:
  > CARENZE row. Matrice studente × data: oltre alle colonne fisse sotto, la
  > tabella porta una colonna dinamica per ogni materia (siglata, es. `MAT`),
  > più le colonne riservate all'utente con prefisso `_`. Tipo volutamente
  > aperto; il valore di ogni cella-materia è letto da CarenzaRepository via
  > `Carenza.getCella`, che possiede la mappa delle colonne dinamiche. Colonne
  > fisse (01 §CARENZE): STUDENTE, PROGRESSIVO, CLASSE, DATA, NOTIFICATO,
  > ASSENZE, NOTE, DATA_MODIFICA.

- **`MateriaData`** (`src/domain/entities/Materia.ts`) — schema is fixed
  *today*, but stays open ahead of the MATERIE × INDIRIZZI feature (spec §8).
  Doc comment:
  > MATERIE row. Tipo volutamente aperto in vista della futura funzionalità
  > MATERIE × INDIRIZZI (spec §8), che porterà colonne aggiuntive per
  > indirizzo; lo schema odierno (01 §MATERIE) è comunque fisso — vedi elenco
  > sotto — e le colonne riservate all'utente con prefisso `_` sono preservate
  > come sempre. Colonne fisse (01 §MATERIE): ID, NOME, SINTESI, COLORE_1,
  > COLORE_2, SIMBOLO, ESAME_CFG, EVOLUZIONE, IS_RELIGIONE_ALT, PRINCIPALE,
  > SPECIFICITA.

All 3 collapsed to bare `export type XData = Record<string, unknown>;` per
the brief's Step 3 pattern (dropping the previous fixed-key + index-signature
hybrid). This flipped 3 direct `data[COL_X.Y] ?? default` assignments from
`string|undefined ?? default` to `unknown ?? default` (no longer assignable
to the `string`/`string|null` field), so I added explicit `typeof` narrowing
at those 3 sites: `Classe.id`, `Materia.id`, `Materia.rawNome`/`Materia.sintesi`
(all other field reads in these 3 entities already used `typeof` narrowing
and needed no change).

## The 18 closed entities

Each: `interface X extends { ...; [key: string]: unknown }` → `type X = { ...
}` (index signature dropped), with the type's key set expanded to the table's
**full** fixed-column schema from `src/config/schema.ts` (not just the subset
the constructor happened to destructure), so the type is a faithful contract
even for columns only read through a `raw: Record<string, unknown>` pass-
through field (e.g. `LogCartella.getPath()`/`getLink()` reading `this.raw`,
not `data`, directly).

| Entity | `fromData` (public signature unchanged) |
|---|---|
| Docente | `static fromData(data: Record<string, unknown>): Docente { return new Docente(data); }` |
| Alunno | same pattern |
| ConfigurazioneDocumento | same pattern |
| ConfigurazioneEmail | same pattern |
| ConfigurazioneImport | same pattern |
| Dipartimento | same pattern |
| Indirizzo | same pattern |
| LogCartella | same pattern |
| LogDocumento | same pattern |
| LogEmail | same pattern |
| MasterConfig | same pattern |
| MovimentoAlunno | same pattern |
| OreASL | same pattern |
| Piano | same pattern |
| Progetto | same pattern |
| RuoloSpeciale | same pattern |
| Supplenza | same pattern |
| VariazioneCattedra | same pattern |

### One deviation from the brief's illustrative code, and why

The brief's Step 5 snippet shows `return new Docente(data as DocenteData);` —
an explicit `as XData` cast at the hydration boundary — and its own "facts
established" note insists this cast is required and shouldn't be avoided.
I implemented it exactly as written first, then ran `npm run lint`: ESLint's
`@typescript-eslint/no-unnecessary-type-assertion` flagged **all 18** casts
as errors ("This assertion is unnecessary since the receiver accepts the
original type of the expression").

I verified this is correct, not a lint false positive, with three isolated
`tsc` repros (this project's exact flags: `strict`, `noUncheckedIndexedAccess`,
`exactOptionalPropertyTypes`):

1. `type` alias → `Record<string, unknown>` parameter: **compiles without a
   cast**; the equivalent `interface` → `Record<string, unknown>` **fails**
   ("Index signature for type 'string' is missing in type 'IFace'"). This is
   the real reason `interface → type` is required — it's what makes
   `constructor(data: XData) { super(data); ... }` typecheck, not the
   `fromData` cast.
2. `Record<string, unknown>` → a `type` alias whose properties are **all
   optional** (every one here is, matching the brief's own `EMAIL?: string`
   style): **also compiles without a cast**. TypeScript's object-type
   assignability only enforces *required* properties; an index-signature
   source satisfies an all-optional target trivially, regardless of the
   value types declared.
3. Confirmed the same holds with the identical field shapes copied from
   `Docente.ts`/`ConfigurazioneEmail.ts` in isolation, not just a synthetic
   two-field example.

So with `type` aliases whose fields are all optional (the only shape used
here), neither direction needs a cast — the `as XData` in `fromData` was
dead code once `interface → type` was done, and lint correctly refuses to
let it stand. I removed the 18 casts (`return new Docente(data as
DocenteData)` → `return new Docente(data)`), keeping `fromData`'s public
signature at `(data: Record<string, unknown>) => Entity` as the brief
requires. The typo-protection goal is unaffected and I verified it directly:
temporarily added `new Docente({ WRONG_COL: 1 })` in a scratch file and
`npm run typecheck` failed with `TS2353: Object literal may only specify
known properties, and 'WRONG_COL' does not exist in type 'DocenteData'` —
excess-property checking on object literals (used throughout, e.g.
`Docente.create()`, `OreASL.create()`) is what actually delivers the
guarantee, and it's untouched by removing the redundant cast. Scratch file
deleted before committing; `git status` confirms it never landed.

## `isGhostRecord` — `_` exclusion

`src/application/import/ImportRecipeMapper.ts`, updated per Step 6 exactly:

```ts
export function isGhostRecord(
  row: Record<string, unknown>,
  keyColumns: string[],
  metaColumns: string[]
): boolean {
  const excluded = new Set([...keyColumns, ...metaColumns]);
  return Object.entries(row)
    .filter(([col]) => !excluded.has(col) && !col.startsWith('_'))
    .every(([, value]) => value === null || value === undefined || value === '');
}
```

Doc comment above it extended to mention the `_`-prefix exclusion and point
at the new spec section.

Test added to `test/unit/application/import-recipe-mapper.test.ts`:

```ts
test('una colonna utente _ non salva una riga fantasma', () => {
  const row = { EMAIL: '', NOME: '', _NOTE_MIE: 'appunto' };
  expect(isGhostRecord(row, ['EMAIL'], [])).toBe(true);
});
```

Verified the brief's expected FAIL→PASS transition explicitly: `git stash
push` on just `ImportRecipeMapper.ts` to isolate the pre-fix source, ran the
new test alone — failed (`Expected: true, Received: false`, i.e. the row was
*not* recognized as a ghost because `_NOTE_MIE` was seen as a populated
"real" column) — then `git stash pop` to restore the fix and re-ran the full
file: 23/23 pass.

## SPECS_ALDO/01_SCHEMA_DATABASE.md

**Already dirty before I touched it** (someone else's unrelated, unstaged,
in-flight work — confirmed via `git diff` before my edit): one single-line
change to the `CONF_MAIL.BOX_CFG` table-row description, adding a pointer to
`03_VALUE_OBJECTS_ED_ENUM.md` § `BoxConfig` for the authoritative shape:

```diff
-| `BOX_CFG`       | JSON    | —   | Array di BoxConfig per i contenuti dinamici dell'email                                                                                                                                            |
+| `BOX_CFG`       | JSON    | —   | Array di BoxConfig per i contenuti dinamici dell'email (schema autorevole in `03_VALUE_OBJECTS_ED_ENUM.md` § `BoxConfig`, incl. `DATI_SORGENTE.filtri`)                                             |
```

That line is untouched by my edit and is unrelated to this task; I did not
author it and it long predates this session. `SPECS_ALDO/03_VALUE_OBJECTS_ED_ENUM.md`
also has unrelated pending changes and I left it completely alone (not
staged, not committed).

My addition, verified via `git diff` to be a clean, separable hunk before
committing — inserted right after `## 2. Schema dettagliato per tabella` and
before the first per-table entry (`### ALUNNI`), i.e. exactly "the
general-rules section before the per-table listings" the brief asked for:

```markdown
### Colonne riservate all'utente

Le colonne il cui nome inizia con `_` sono riservate agli appunti e ai calcoli
dell'utente. ALDO le legge insieme al resto della riga, **le preserva a ogni
scrittura** (l'update è un merge sulla riga originale, non una sostituzione) e
non le interpreta mai: non compaiono in nessun tipo di entità, non sono mai
scambiate per colonne dinamiche, e la futura analisi di consistenza le ignora
invece di segnalarle come anomalie.
```

Since git can't stage part of one file's changes as "not yours" — both
hunks necessarily land in the same commit when the file is committed — the
commit's diff for this file legitimately contains both my new section and
the pre-existing BOX_CFG line. I did not author, review, or take credit for
the BOX_CFG change; it is called out here and visible as a separate hunk in
`git show c6c752e -- SPECS_ALDO/01_SCHEMA_DATABASE.md`.

## Commit

```
c6c752e refactor(ally): entity *Data type-safe salvo tabelle dinamiche + convenzione colonne _
25 files changed, 244 insertions(+), 102 deletions(-)
```

Files: `SPECS_ALDO/01_SCHEMA_DATABASE.md`,
`src/application/import/ImportRecipeMapper.ts`, all 21 entity files under
`src/domain/entities/`, `test/unit/application/import-recipe-mapper.test.ts`
(modified), `test/unit/domain/entities-row-typing.test.ts` (new).

Nothing else in the working tree was staged — verified with `git status`
before commit that unrelated pre-existing changes (`03_VALUE_OBJECTS_ED_ENUM.md`,
the deleted/untracked `DATABASES_TO_CONVERT/*` xlsx churn, `AUDIT_*.md`,
`docs/superpowers/plans/2026-08-24-report-uniformity.md`) were left
untouched.

## Full ALDO gate — final run, all green

```
> npm run typecheck
> tsc --noEmit
(clean, no output)

> npm run lint
> eslint .
(clean, no output)

> npm test
> jest --config jest.config.cjs
Test Suites: 170 passed, 170 total
Tests:       1644 passed, 1644 total
Snapshots:   0 total
Time:        9.258 s

> npm run test:integration
> jest --config jest.integration.config.cjs
Test Suites: 5 passed, 5 total
Tests:       14 passed, 14 total
Snapshots:   0 total
Time:        1.774 s

> npm run test:build
> jest --config jest.build.config.cjs
Test Suites: 5 passed, 5 total
Tests:       12 passed, 12 total
Snapshots:   0 total
Time:        85.738 s
```

## Fix round 1

- Ripristinate le firme pubbliche di `Classe.fromData`, `Carenza.fromData` e
  `Materia.fromData` a `Record<string, unknown>`; i tipi `*Data` restano aperti
  soltanto nei costruttori.
- Ripristinata dal parent `ba24894` la sola descrizione estranea di
  `CONF_MAIL.BOX_CFG`; conservata la sezione sulle colonne `_`.
- Verifiche: `npx jest --config jest.config.cjs test/unit/domain/entities-row-typing.test.ts test/unit/application/import-recipe-mapper.test.ts` (2 suite, 25 test passati); `npm run typecheck` (passato); `npm run lint` (passato).
