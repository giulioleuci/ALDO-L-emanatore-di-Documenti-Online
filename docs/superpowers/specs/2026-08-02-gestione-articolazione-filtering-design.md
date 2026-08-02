# CONF_DOC/CONF_MAIL.GESTIONE_ARTICOLAZIONE filtering — design

Date: 2026-08-02

## Purpose

`CONF_DOC.GESTIONE_ARTICOLAZIONE` is currently a dead schema column
(`ARTICOLAZIONE.md` item 1): seeded in test fixtures but never read by any
application code. This design wires it up, and extends the same mechanism
to `CONF_MAIL`, per user decision during brainstorming.

Target behavior, per config row:

- `COMPLETA` (default, including empty/unset column): ignore partner
  classes — only the parent (or a standalone, non-articulated class) is
  targeted.
- `ARTICOLATA`: ignore the parent class — only partner classes (or a
  standalone class) are targeted.

Constraint from the requester: exactly one place in the app decides
inclusion/exclusion of a class by articulation type. No other call site
reimplements this branch.

## Background / what already exists

- `GestioneArticolazione` enum (`ARTICOLATA`/`COMPLETA`) already exists at
  `src/domain/value-objects/enums.ts:20`, unused until now.
- `ArticolazioneConfig` (`src/domain/value-objects/ArticolazioneConfig.ts`)
  is the parsed `CLASSI.ARTICOLAZIONE` cell: `isParent()` (has `partners`),
  `isPartner()` (has `parent`), null for a standard class.
- `DocumentBatchService.generateClassi`
  (`src/application/services/DocumentBatchService.ts:157-192`) is the only
  caller of `DocumentGenerationService.generateForClasse`. It currently
  iterates `this.classi.findAttive()` unfiltered — every active class,
  including every partner, gets its own document today. This is the sole
  place that decides *which* classes a CONF_DOC batch targets.
- `DocumentGenerationService.generateForClasse`
  (`src/application/services/DocumentGenerationService.ts:93-154`)
  separately expands `classiCompetenza` for the CDU (`articolazione?.isParent()
  === true ? [classe, ...partners] : [classe]`, lines 107-110). This decides
  what a single already-targeted document's CDU contains (e.g. companion
  classes listed inside the doc), not which classes get a document. Out of
  scope — see "Why content-expansion logic is untouched" below.
- `EmailNotificationService.classiEntryPoint()`
  (`src/application/services/EmailNotificationService.ts:286-291`) already
  hardcodes an equivalent decision for CONF_MAIL targeting: "every active
  class except articolazione partners" — i.e. today's code always behaves
  as if every CONF_MAIL pattern were `COMPLETA`. Callers:
  `targetsPerCoordinatore`, `targetsPerDocente`, `targetsPerCdc`
  (PER_COORDINATORE / PER_DOCENTE / PER_CDC processes). The other processes
  (PER_ALUNNO, PER_GENITORI_ALUNNO, PER_CARENZA_*) are alunno-centric and
  never call it — unaffected.
- `EmailNotificationService.classiCompetenza()` (private, lines 303-308) is
  the email-side twin of `generateForClasse`'s CDU expansion: given an
  already-selected entry-point classe, decide what companion class ids ride
  along for CDU/LOG_DOCS lookups. Same "content, not selection" role — out
  of scope for the same reason.
- Confirmed via the code graph: `generateForClasse` and
  `classiEntryPoint()`/`classiCompetenza()` have no other callers in
  `src/` — no direct/manual single-class generation path exists outside
  the batch loop, so there is no bypass case to design around.

## Why content-expansion logic is untouched

Both `classiCompetenza` methods only expand when the *target itself* is an
articulated parent (`isParent() === true`). Once the target *set* is
filtered by the new mechanism:

- Under `COMPLETA`, only parents/standalone classes are ever targeted —
  `classiCompetenza` keeps expanding parent → partners exactly as today.
- Under `ARTICOLATA`, only partners/standalone classes are ever targeted —
  a partner is never `isParent()`, so `classiCompetenza` naturally stays
  `[classe]`, i.e. one document/notification per partner, unaggregated.

So the desired per-target content behavior falls out of the existing code
once the target set changes. No changes needed there, and — per the
"exactly one filtering decision" constraint — none should be made; these
methods answer "what does this document/email contain", not "does this
class get one", and conflating them would reintroduce a second place that
branches on articulation type.

## Design

### 1. Schema

`COL_CONF_MAIL` (`src/config/schema.ts:34`) gains:
```ts
GESTIONE_ARTICOLAZIONE: 'GESTIONE_ARTICOLAZIONE'
```
(`COL_CONF_DOC` already has this key, unused until now — no change needed
there.)

`SPECS_ALDO/01_SCHEMA_DATABASE.md`: tighten the existing CONF_DOC row
(currently "Specifica come gestire la generazione per classi articolate")
to state the two values and their meaning explicitly; add the equivalent
row to the CONF_MAIL table.

### 2. Entities

`ConfigurazioneDocumento` (`src/domain/entities/ConfigurazioneDocumento.ts`)
and `ConfigurazioneEmail` (`src/domain/entities/ConfigurazioneEmail.ts`)
each gain a `gestioneArticolazione: GestioneArticolazione` readonly field,
constructed and serialized following the existing `formato`/`supplenti`
pattern, but explicit about the empty-string case (a blank Sheets cell
round-trips as `''`, not `null`/`undefined`; `ARTICOLAZIONE.md` item 1
notes fixtures already seed `''`):

```ts
this.gestioneArticolazione =
  data[COL_CONF_DOC.GESTIONE_ARTICOLAZIONE] === GestioneArticolazione.ARTICOLATA
    ? GestioneArticolazione.ARTICOLATA
    : GestioneArticolazione.COMPLETA;
```

(Same shape for `ConfigurazioneEmail` against `COL_CONF_MAIL`.) Both
entities add the field to `toData()`.

### 3. The one filter — `ClasseRepository`

New method on `IClasseRepository` (`src/domain/repositories/IClasseRepository.ts`)
and `ClasseRepository` (`src/infrastructure/repositories/ClasseRepository.ts`),
alongside `getGruppoArticolazione`/`orderedPartners`/`getAllDocentiCDCArticolata`
(same "thin wrapper over `getArticolazione`" family):

```ts
filterPerGestioneArticolazione(classi: Classe[], gestione: GestioneArticolazione): Classe[] {
  return classi.filter((c) => {
    const config = this.getArticolazione(c);
    if (config === null) return true; // standard classes always included
    return gestione === GestioneArticolazione.ARTICOLATA ? !config.isParent() : !config.isPartner();
  });
}
```

This is the only place in the app that branches on `GestioneArticolazione`
to decide inclusion/exclusion.

### 4. Call sites

- `DocumentBatchService.generateClassi`
  (`src/application/services/DocumentBatchService.ts:157-192`): currently
  only receives `confDocId`; `batchGenerateHandler` already fetches the full
  `ConfigurazioneDocumento` via `this.configs.findById(confDocId)` — thread
  that `config` down instead. Replace the unfiltered
  `const attive = this.classi.findAttive();` target list with
  `this.classi.filterPerGestioneArticolazione(this.classi.findAttive(), config.gestioneArticolazione)`.
- `EmailNotificationService.classiEntryPoint()`
  (`src/application/services/EmailNotificationService.ts:286-291`): gains a
  `gestione: GestioneArticolazione` parameter; body becomes
  `this.deps.classi.filterPerGestioneArticolazione(this.deps.classi.findAttive(), gestione)`.
  `targetsPerCoordinatore`/`targetsPerDocente`/`targetsPerCdc`
  (currently no-arg, called from `enumerateTargets(conf)` which already
  holds `conf`) pass `conf.gestioneArticolazione` through.
- `DocumentGenerationService.generateForClasse` and
  `EmailNotificationService.classiCompetenza` — unchanged (see above).

### 5. Docs

`ARTICOLAZIONE.md` item 1 flips `Status: Open` → `Status: Fixed`,
description rewritten in the same style as items 2/3 (what was wrong, what
changed, one-line impact).

## Testing

Unit tests (new or extended):

- `ClasseRepository.filterPerGestioneArticolazione`: parent/partner/standalone
  classe × both `gestione` values, plus the default-COMPLETA path.
- `ConfigurazioneDocumento`/`ConfigurazioneEmail`: `gestioneArticolazione`
  parses `''`, missing key, and both valid enum values correctly.
- `DocumentBatchService.generateClassi`: batch run against a fixture with
  one parent + two partners + one standalone class, asserting the correct
  target subset under `COMPLETA` (default) and `ARTICOLATA`.
- `EmailNotificationService`: `targetsPerCoordinatore`/`targetsPerDocente`/
  `targetsPerCdc` produce the right entry-point set under both settings.

No new e2e/online scenario is planned — this is exercised at the unit
level like the rest of `DocumentBatchService`/`EmailNotificationService`.

## Open questions

None — all scope questions were resolved during brainstorming (see
"Background" above for the email-scope decision).
