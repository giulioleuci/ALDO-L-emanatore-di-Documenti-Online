# E2E email boxes and class-summary table design

## Scope

Correct the three failures observed in the live `runE2eScenarios()` report:

- class-summary generation fails in `RIEPILOGO_CLASSE` while inserting a table at a text marker;
- report/minutes emails enumerate three targets but send zero messages;
- conduct-sheet emails enumerate four targets but send zero messages.

The correction remains ALDO-local. It reuses `GoogleApiWrapper` and
`WorkspaceTemplateEngine`; it does not add native Google Apps Script calls or
extend GasLibraryFactory.

## Class-summary document

The E2E summary template will contain a real Google Docs table authored during
test-template provisioning. `GasArtifactFactory` will create that table through
the injected `GoogleApiWrapper.DocumentService`, never through a direct
`DocumentApp` call.

The table will have one header row and one template row. The first template-row
cell starts with:

```text
{{#tablerow_loop:focus.classe.studenti.listaCompleta}}{{anagrafica.nomeCompleto}}
```

Other cells use paths relative to each student item, such as
`{{status.religione}}`, `{{anagrafica.email}}`, and a canonical plan-status
field already present in the CDU. `WorkspaceTemplateEngine` expands the
template row for every student and deletes the original template row.

The `E2E_RIEPILOGO` configuration will use `DOCUMENTO_GENERICO`. The dedicated
`RiepilogoClasseGeneratorStrategy`, its registry entry, its table-marker
facade dependency, and tests that exist only for that strategy will be removed.
The remaining summary content will use canonical CDU paths and standard
document placeholders/list loops.

Provisioning must not silently reuse the old marker-based summary template.
The template identity will be versioned so the next online run creates the new
table-based artifact.

## Email delivery invariant

Email delivery keeps the existing global invariant:

```text
at least one rendered, visible box with non-empty semantic content => send
all boxes empty or invisible => skip
```

The invariant is content-based, not link-based. A deficiency box containing
deficiency data is valid even when it has no link. No static or artificial
`testo_dinamico` box will be added merely to force delivery, and
`RenderBoxesStep` will not be weakened.

For the report/minutes and conduct patterns, the `documenti` box must receive
the freshly generated `LOG_DOCS` items through this path:

```text
LOG_DOCS
  -> DocumentiClasseProvider
  -> focus.classe.didattica.documenti.items
  -> FILTRO_TIPO
  -> rendered documenti box
  -> delivery gate
```

The integration regression test will inspect each boundary in this sequence.
Implementation will change only the first boundary whose output no longer
contains the generated records. It must not bypass the box-content gate.

## Diagnostics and errors

The E2E scenarios will report whether a pattern was skipped, sent, or failed.
Both report/minutes and conduct scenarios will fail when:

- no message was sent;
- one or more send errors were collected;
- every target was skipped because every rendered box was empty.

Failure messages will include `targets`, `sent`, `skipped`, and collected
errors. They will not claim a missing link unless the tested requirement is
specifically persistence of a generated document link.

## Testing

Tests proceed red-green:

1. A provisioning test proves the summary template contains a real
   `tablerow_loop` table and no `{{TABELLA_ALUNNI}}` marker.
2. A configuration test proves `E2E_RIEPILOGO` uses
   `DOCUMENTO_GENERICO`.
3. An integration-style test runs the real E2E seed through the real context
   and email-box pipeline with fake Google I/O. It proves generated
   report/minutes and conduct records reach `documenti` boxes and produce
   non-empty rendered content.
4. A delivery test proves one non-empty data box sends, while all-empty boxes
   skip. Link presence is not a general delivery requirement.
5. Scenario-check tests prove both email scenarios expose skips and errors.
6. Existing deficiency and personalized-plan box tests remain green.

Verification includes focused Jest tests, full unit and integration suites,
typecheck, lint, testing build, and the online build gate.
