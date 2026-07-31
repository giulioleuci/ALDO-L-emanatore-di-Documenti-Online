# Open Gaps in Articulated Classes Management

This document summarizes the open issues and architectural gaps in SGSA/ALDO regarding articulated classes management, as identified during the implementation of `DOCUMENTO_COMPLESSO_CLASSE_ARTICOLATA`.

---

## 1. Unused Database Column: `COL_CONF_DOC.GESTIONE_ARTICOLAZIONE`

- **Status**: Open
- **Description**: The column `GESTIONE_ARTICOLAZIONE` exists in the `CONF_DOC` schema and is seeded in test fixtures (typically set to `''` or occasionally `'COMPLETA'`), but it is never read anywhere within `src/application`.
- **Impact**: It is currently a dead schema column with no effect on document generation logic. Resolving it requires a product design decision on whether to implement specific behaviors or deprecate the field.

---

## 2. Email Recipient Resolution Does Not Expand to Partner Classes

- **Status**: Fixed
- **Description**: `RisolutoreRuoliService.genitoriClasse` and `RisolutoreRuoliService.rappresentantiStudenti` resolve recipients by querying `ALUNNI.CLASSE` using an exact match on the focus class ID. Because students belong exclusively to partner classes and never to the parent class ID directly, configuring a `CONF_MAIL` targeting a parent class with `GENITORI_CLASSE` or `RAPPRESENTANTI_STUDENTI` silently yields zero recipients. Fixed: RisolutoreRuoliService.genitoriClasse/rappresentantiStudenti now use studentiDellaClasse (partner-aware); TUTOR_ASL/TUTOR_ORIENT now resolve via a new docentiRuoloArticolato helper that merges getDocentiRuolo across getClassiPartner. (SEGRETARIO_CDC intentionally left untouched, pending a product decision — see item's original scope.)
- **Impact**: Email notifications targeting parents or student representatives via a parent class fail silently. Addressable by applying partner expansion logic similar to `RappresentantiProvider`.

---

## 3. Duplicated Subject Names in `DocenteCdcVM.materieDescrizione` for Shared (`COMUNE`) Teachers

- **Status**: Fixed
- **Description**: `materie[]` is built per-assignment. Since a shared teacher (`COMUNE`) has separate assignments for each partner class, stringifying their subjects results in repeated values (e.g., `"Matematica, Matematica"`). Fixed: TeachingCouncilProjection.councilVmStrategy now deduplicates materie (by sigla+specificita) via a new dedupeMaterie helper before building materieVm/materieDescrizione.
- **Impact**: Rendering artifact in document templates. Does not compromise data accuracy, but affects display output formatting.

---

## 4. Lack of First-Class "Articulated Group" Generation Target

- **Status**: Open
- **Description**: `DocumentGenerationService` does not have an explicit target concept for an "articulated group". Generating a single document for a combined group relies on targeting the parent class ID and depending on context data providers (CDU) to expand and aggregate partner class data internally. Note: the specific classiCompetenza-population gap (DocumentGenerationService.generateForClasse building BuildParams without setting classiCompetenza, causing PianiPersClasseProvider/DocumentiClasseProvider to silently fall back to [target] alone for a parent target) is now fixed — generateForClasse computes classiCompetenza via classi.getGruppoArticolazione(classe) before building the CDU. The broader architectural absence of a first-class "articulated group" generation target concept remains.
- **Impact**: Architectural limitation where articulated document handling is fully decoupled from the generation service layer.

---

## 5. Shared `INDIRIZZI` ID Across Partner Classes in E2E Fixtures

- **Status**: Open
- **Description**: All seeded classes in E2E fixtures (including the partner classes `3C-S` and `3C-C`) share the same study path/address ID (`IND_E2E`).
- **Impact**: Data correctness is preserved (entities are correctly tagged with their origin partner class), but generated document demos display identical study path names in parentheses for both sub-groups, reducing readability.
