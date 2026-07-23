# Email Delivery and LOG_DOCS Users Design

## Scope

Fix online-test regressions around generated-document email links, suppress empty personalized-document emails, prove `RIEPILOGO_CLASSE` generation, complete configuration fixtures, and add `CONF_DOC.REGISTRA_UTENTI`.

## Email delivery gate

`CONF_MAIL.CONDIZIONE` remains the first gate. After `RenderBoxesStep`, the pipeline must also require at least one rendered, visible, non-empty box before composing, sending, logging, or applying post-processing. A pattern with no valid boxes is counted as skipped. This is global behavior: text alone does not authorize delivery.

The gate will preserve existing expression semantics and only add the post-render content check. Tests will cover document links for `VERBALE` and `CONDOTTA`, a coordinator whose personalized-plan boxes are both empty, and an email with one valid box.

## RIEPILOGO_CLASSE

The existing generator, registry entry, template provisioner, `CONF_DOC` row, and online scenario remain the implementation path. Add an end-to-end assertion that each configured class produces a persisted `LOG_DOCS` row with a non-empty link. A failure must report the document-generation stage/error rather than merely reporting a null file ID.

## REGISTRA_UTENTI

Add the optional `CONF_DOC.REGISTRA_UTENTI` column. It is a comma-separated list of canonical selectors:

- `COORDINATORI`: coordinator email(s) for CDU class scope.
- `DOCENTI`: active subject teachers in CDU class scope.
- `CDC`: all members of the class council.
- `ALUNNI`: student email(s) in CDU target/class scope.
- `GENITORI`: tutor/parent email(s) in CDU target/class scope.

Selectors are trim-insensitive and case-insensitive; unknown selectors fail generation with a configuration error. Resolve values from the constructed CDU, normalize/unique emails while retaining first-seen order, and save the comma-joined result in `LOG_DOCS.UTENTI`.

If `REGISTRA_UTENTI` is blank, preserve current generator fallback (`focus.alunno.anagrafica.email`, otherwise empty). If populated, its resolved result overrides that fallback, including an intentionally valid empty resolved set. This feature is SGSA CDU interpretation, so it belongs in ALDO, not GasLibraryFactory.

## Mock data and schema

Add the column to canonical schema, runtime schema map, entities/config parsing, table headers, fixtures, and both mock database builders. Every mock `CONF_DOC` and `CONF_MAIL` row must explicitly provide every known column, using `''` or `null` where semantically absent. E2E rows will use selectors that exercise class-wide and student-scoped resolution.

## Error handling and verification

Malformed `REGISTRA_UTENTI` is a typed configuration failure before `LOG_DOCS` insertion. Regression tests cover selector resolution, fallback, override, de-duplication, blank behavior, empty-box suppression, valid-box delivery, document links, and RIEPILOGO persistence. Run focused Jest files, full unit suite, typecheck, lint, build, and online build gate before completion.
