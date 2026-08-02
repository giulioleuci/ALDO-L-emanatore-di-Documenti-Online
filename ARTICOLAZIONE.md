# Open Gaps in Articulated Classes Management

This document summarizes the open issues and architectural gaps in SGSA/ALDO regarding articulated classes management, as identified during the implementation of `DOCUMENTO_COMPLESSO_CLASSE_ARTICOLATA`.

---

## 1. `GESTIONE_ARTICOLAZIONE` Now Filters Which Classes Are Targeted

- **Status**: Fixed
- **Description**: `CONF_DOC.GESTIONE_ARTICOLAZIONE` was a dead schema column (never read by application code). Fixed: `ClasseRepository.filterPerGestioneArticolazione` is now the single place in the app that decides class inclusion by articulation type — `COMPLETA` (default) excludes partner classes, `ARTICOLATA` excludes the parent class, standard classes always pass. `DocumentBatchService.generateClassi` applies it against the relevant `CONF_DOC` row before generating documents. The same column and mechanism were added to `CONF_MAIL` and wired into `EmailNotificationService.classiEntryPoint` for `PER_COORDINATORE`/`PER_DOCENTE`/`PER_CDC`, which previously hardcoded the `COMPLETA`-equivalent behavior unconditionally.
- **Impact**: Batch document generation and CONF_MAIL notification targeting now both honor an explicit ARTICOLATA/COMPLETA choice per config row, instead of generating a document per physical class unconditionally (previous document-generation behavior) or always assuming COMPLETA (previous email-notification behavior).

---

## 2. Email Recipient Resolution Does Not Expand to Partner Classes

- **Status**: Fixed
- **Description**: `RisolutoreRuoliService.genitoriClasse` and `RisolutoreRuoliService.rappresentantiStudenti` resolve recipients by querying `ALUNNI.CLASSE` using an exact match on the focus class ID. Because students belong exclusively to partner classes and never to the parent class ID directly, configuring a `CONF_MAIL` targeting a parent class with `GENITORI_CLASSE` or `RAPPRESENTANTI_STUDENTI` silently yields zero recipients. Fixed: RisolutoreRuoliService.genitoriClasse/rappresentantiStudenti now use studentiDellaClasse (partner-aware); TUTOR_ASL/TUTOR_ORIENT now resolve via `IClasseRepository.getDocentiRuoloArticolato`, a single shared repository method (merging `getDocentiRuolo` across `getClassiPartner`) also used by `TutorProvider` and `TeachingCouncilProjection.councilVmStrategy`, so the CDU's tutor flags stay consistent with `focus.classe.tutor`. (SEGRETARIO_CDC is a single-holder role intentionally left unexpanded, pending a product decision on whether it should be assignable per-partner-class or shared across the group.)
- **Impact**: Previously failed silently; now resolved via partner expansion, see Description.

---

## 3. Duplicated Subject Names in `DocenteCdcVM.materieDescrizione` for Shared (`COMUNE`) Teachers

- **Status**: Fixed
- **Description**: `materie[]` is built per-assignment. Since a shared teacher (`COMUNE`) has separate assignments for each partner class, stringifying their subjects results in repeated values (e.g., `"Matematica, Matematica"`). Fixed: TeachingCouncilProjection.councilVmStrategy now deduplicates materie (by sigla+specificita) via a new dedupeMaterie helper before building materieVm/materieDescrizione.
- **Impact**: Rendering artifact in document templates. Does not compromise data accuracy, but affects display output formatting.

---

## 4. Lack of First-Class "Articulated Group" Generation Target

- **Status**: Open
- **Description**: `DocumentGenerationService` does not have an explicit target concept for an "articulated group". Generating a single document for a combined group relies on targeting the parent class ID and depending on context data providers (CDU) to expand and aggregate partner class data internally. Note: the specific classiCompetenza-population gap (DocumentGenerationService.generateForClasse building BuildParams without setting classiCompetenza, causing PianiPersClasseProvider/DocumentiClasseProvider to silently fall back to [target] alone for a parent target) is now fixed — generateForClasse computes classiCompetenza as `[classe, ...getClassiPartner(classe)]` when the target is an articulated parent, and `[classe]` otherwise (parent-only expansion, so a document targeted directly at a partner class sees only its own data, never the sibling partner's). The broader architectural absence of a first-class "articulated group" generation target concept remains.
- **Impact**: Architectural limitation where articulated document handling is fully decoupled from the generation service layer.

---

## 5. Shared `INDIRIZZI` ID Across Partner Classes in E2E Fixtures

- **Status**: Open
- **Description**: All seeded classes in E2E fixtures (including the partner classes `3C-S` and `3C-C`) share the same study path/address ID (`IND_E2E`).
- **Impact**: Data correctness is preserved (entities are correctly tagged with their origin partner class), but generated document demos display identical study path names in parentheses for both sub-groups, reducing readability.
