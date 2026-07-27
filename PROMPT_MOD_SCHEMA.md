# Prompt: Simplify `CONF_DOC.SCHEMA_SOTTOCARTELLE` into a duplication policy

You are working in the ALDO / SGSA codebase.

Your task is to simplify the current document-duplication behavior by replacing the existing `CONF_DOC.SCHEMA_SOTTOCARTELLE` semantics with a much smaller duplication policy.

The change must be applied consistently across application code, offline tests, online tests, seed data, and the authoritative `SPECS_ALDO` documents.

## Objective

Replace the current schema-based subfolder behavior with a binary duplication policy.

The column currently known as `CONF_DOC.SCHEMA_SOTTOCARTELLE` must become `CONF_DOC.DUPLICAZIONE`.

At the same time, eliminate `CONF_DOC.PATH_OUT_SOTTOCARTELLE` entirely. The final model should use only `PATH_OUT` for path composition.

The only allowed values must be:

- `PERMESSA`
- `NEGATA`

The default value must be `NEGATA`.

## Current behavior to replace

Today, `SCHEMA_SOTTOCARTELLE` is used as a multi-valued schema-like configuration, and the duplicate-check step only has a special case for `MULTIPLO_PER_CLASSE`, where deduplication is skipped.

That behavior is too broad and too domain-specific for the current needs.

## New behavior

Treat duplication as a strict allow/deny policy:

- `PERMESSA` means the document may be generated even if a previous document with the same identity already exists.
- `NEGATA` means duplicate generation is forbidden.

When the policy is `NEGATA`, `CheckDuplicatesStep` must search existing generated documents and deny generation if a document already exists with identical:

- `TIPO`
- `SOTTOTIPO`
- `ID_GEN`
- `PATH`
- `NOME`

If such a row exists, the step must block generation in the same way the pipeline currently blocks duplicates:

- set `shouldGenerate` to `false`
- set a meaningful skip reason explaining the duplicate match

## Required implementation rules

1. Rename the meaning of the field from `SCHEMA_SOTTOCARTELLE` to `DUPLICAZIONE` everywhere in the codebase.
2. Replace any enum or vocabulary related to the old schema values with a new binary vocabulary:
   - `PERMESSA`
   - `NEGATA`
3. Set the default to `NEGATA` wherever the configuration is created, read, normalized, seeded, or documented.
4. Update `CheckDuplicatesStep` so that the duplicate check is driven by the `DUPLICAZIONE` policy.
5. When the policy is `NEGATA`, duplicate detection must compare the full identity tuple:
   - `TIPO`
   - `SOTTOTIPO`
   - `ID_GEN`
   - `PATH`
   - `NOME`
6. When the policy is `PERMESSA`, the duplicate check must be bypassed.
7. Remove `PATH_OUT_SOTTOCARTELLE` from the schema, seed data, fixtures, tests, and documentation, and consolidate all path logic onto `PATH_OUT`.

## Required updates

You must update all of the following in a consistent way:

- offline unit tests
- offline integration tests, if any are affected
- online tests
- offline seed data
- online seed data
- `PATH_OUT_SOTTOCARTELLE` references in seed data, fixtures, tests, and documentation
- every relevant `SPECS_ALDO` document
- any factories, fixtures, and helpers that create `CONF_DOC` rows
- any code comments or docs that still describe the old schema semantics

## Acceptance criteria

The change is complete only if all of the following are true:

1. `CONF_DOC.DUPLICAZIONE` exists as the new conceptual field.
2. Its only valid values are `PERMESSA` and `NEGATA`.
3. The default is `NEGATA`.
4. `CheckDuplicatesStep` bypasses duplicate detection only when the policy is `PERMESSA`.
5. `CheckDuplicatesStep` denies generation when the policy is `NEGATA` and a previously generated document exists with matching:
   - `TIPO`
   - `SOTTOTIPO`
   - `ID_GEN`
   - `PATH`
   - `NOME`
6. All offline and online tests reflect the new behavior and pass.
7. Seed data used in offline and online environments reflects the new field and default.
8. `PATH_OUT_SOTTOCARTELLE` has been removed everywhere it was only acting as dead configuration.
9. `SPECS_ALDO` has been updated to describe the new policy accurately and no longer mentions `PATH_OUT_SOTTOCARTELLE`.

## Constraints

- Do not keep backward-compatible support for the old schema vocabulary unless it is explicitly required by a spec or migration rule.
- Do not preserve the old `MULTIPLO_PER_CLASSE` behavior as a special semantic branch.
- Prefer a single, explicit policy model over inferred or implicit behavior.
- Do not preserve `PATH_OUT_SOTTOCARTELLE` as a separate configuration field.
- Keep the change aligned with the existing ALDO architecture and with the reusable libraries in `GasLibraryFactory` wherever applicable.

## Expected outcome

After the change, duplication control should be easier to understand:

- `PERMESSA` = generation may proceed
- `NEGATA` = generation is blocked when an identical generated document already exists

The system should no longer expose the old subfolder schema semantics through this configuration field.
