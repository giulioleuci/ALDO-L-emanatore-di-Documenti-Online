# Online E2E failure repairs

## Purpose

Repair every reported online E2E failure without weakening production behaviour or
the data-driven `CONF_DOC` contract.

## Behaviour

- The E2E `CLASSI` header has exactly one `IRC` and one `ALT` column.
- The CONDOTTA, RIEPILOGO_CLASSE, and REPORT_COMPLESSO fixtures register their focus
  class in `LOG_DOCS.CLASSI`; `RegisterDocumentStep` continues to persist only
  explicitly configured registration metadata.
- A multi-class coordinator email renders and logs every folder belonging to all
  `classiCompetenza`, not only the focus/first class.
- Generating a parent-class verbale marks plans belonging to both articulated partner
  classes as `VERBALIZZATO`, while ordinary classes retain their exact class match.
- Personalized-plan history remains matched by both student and `SOTTOTIPO`. Since
  source already implements that predicate, online verification must use a freshly
  built and pushed bundle rather than an older `OnlineTests.gs` artifact.
- When `sample.testMode` is `true`, scenario 11 accepts only the protected-range
  invalid-user API response. It rethrows every other failure and also rethrows the
  same response outside mock mode.

## Design

1. Remove `IRC` and `ALT` from the dynamic `CLASSI` assignment-header list; they are
   already fixed schema columns.
2. Set the three class-document `REGISTRA_DOC` configurations to render
   `focus.classe.anagrafica.nome` into `CLASSI`.
3. Pass the full email target `classiCompetenza` set into folder-box lookup. Aggregate
   `cartellePerClasse` for each class and deduplicate by folder ID before rendering and
   writing `LOG_MAIL.ALLEGATI.folders`.
4. Add a second verbale post-process action scoped to the parent CDU's articulated
   partner list. Its empty normal-class expansion matches no plan rows; the existing
   focus-class action remains unchanged.
5. Keep the existing subtype-plus-student plan-history predicate and make the online
   build/deployment step part of verification.
6. Add a small, testable scenario-level permission-error classifier. It checks the
   rendered error text for `addProtectedRange` and `Utente non valido`; scenario 11
   catches only `generateForClasse`, then skips read-back solely for that mock error.

## Tests

- Fixture test: `CLASSI` headers contain no duplicates.
- Fixture test: the three affected `CONF_DOC.REGISTRA_DOC` cells register the focus
  class.
- Email-box/pipeline test: a target responsible for two classes receives two distinct
  folders and logs both IDs.
- Post-process test: an articulated parent verbale updates plans for both partners;
  a standard class updates only its own plans.
- Existing unit test: plan history matches the same student's same subtype only.
- Permission classifier accepts the known pipeline/API text, rejects a similar error
  without `addProtectedRange`, and rejects the expected error outside mock mode.
