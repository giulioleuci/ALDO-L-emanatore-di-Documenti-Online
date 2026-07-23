# CDU class parent emails design

## Purpose

Allow CDU-driven document logging to resolve `GENITORI` recipients without
reading repositories from the document pipeline.

## Design

Extend every item in `focus.classe.studenti.listaCompleta` with:

```ts
genitori: Array<{ email: string }>;
```

`listaCompleta` contains only students for which `Alunno.isAttivo()` is true.
The class-context provider derives this field from each active student's
existing tutor records (`Alunno.getTutors()`). It preserves the provider's
student order and the tutor order for each student.

`resolveLogDocUsers()` consumes only CDU data. `ALUNNI` and `GENITORI` are
therefore active-only selectors: the latter walks
`listaCompleta[].genitori[].email`, retaining first-seen emails with a `Set`.
It does not query repositories or use class representatives.

`CDC` continues to mean the complete `focus.classe.consiglioDiClasse` list in
its CDU order. Tests must reflect the canonical fixture rather than assume a
single subject teacher.

## Error handling and tests

- A missing optional class/students/parent collection resolves to no emails.
- Unknown `REGISTRA_UTENTI` selectors still fail with `PipelineError` before
  the `LOG_DOCS` insert.
- Context-engine tests prove parent emails are present in the class CDU.
- Document-pipeline tests prove ordered, deduplicated selector resolution and
  blank-configuration fallback behavior.

## Scope

This is ALDO CDU/domain mapping work. It adds no new persistence mechanism,
no native GAS calls, and no GasLibraryFactory extension.
