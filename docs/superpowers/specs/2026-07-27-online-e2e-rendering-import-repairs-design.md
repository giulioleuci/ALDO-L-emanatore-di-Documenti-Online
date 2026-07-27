# Online E2E Rendering and Import Repairs

**Date:** 2026-07-27

## Objective

Correct the online Google Apps Script behavior exercised by `runE2eScenarios`:

1. filtered `bullet_list` and `number_list` directives render without unresolved placeholders;
2. representative and complex-document lists use native Google Docs bullet/number glyphs;
3. the ASL/PCTO import inserts or updates the four expected third-year rows;
4. subject-column protection completes for both ordinary and articulated classes without losing the CDU technical context or rolling back the generated sheet.

The implementation must remain GAS V8 compatible and must route all native Google API access through `GasLibraryFactory`.

## Root Causes

### Filtered document list loops

`WorkspaceTemplateEngine` parses and applies pipe filters for `tablerow_loop` and `tablecol_loop`, but `_analyzeListLoops` sends the complete source expression directly to `mustache.getValue`. A directive such as:

```text
{{#bullet_list:focus.classe.coordinatori | sortBy:'nome'}}...{{/bullet_list}}
```

is therefore treated as a literal property path. Resolution returns no array, the list operation is not created, and the original directive remains in the document.

### Missing list glyphs

The E2E template provisioner supplies every document line as an ordinary paragraph. `GasArtifactFactory` consequently calls only `DocumentBuilder.appendParagraph`. During rendering, `WorkspaceTemplateEngine` correctly preserves native list membership when the marker is already a Google Docs list item, but an ordinary paragraph has no list membership or glyph to preserve.

### Empty ASL import

The ASL source sheet has a header row containing `STUDENTE`, `ANNO`, and `ORE`. `GasDataImporter` converts the grid into objects keyed by those header values before applying a transform mapping. The seeded configuration incorrectly maps source columns `A`, `B`, and `C`; those keys do not exist in the extracted records, so the mapped canonical fields become `null` and are discarded as ghost records.

### Subject-protection rollback

`Cdu.tech` is deliberately non-enumerable. `SheetMaterieConPermessiGeneratorStrategy.resolveDocentiMateria` creates a CDU variant with object spread to set `meta.parametriInput.materiaCorrente`. Object spread drops the non-enumerable `tech` property. Role resolution then calls `getClasseEntity`, which dereferences the missing `cdu.tech.entita` and throws.

The warnings for absent `materieColonne.group2` and `group3` on non-articulated classes are expected library behavior and are not the source of the fatal exception.

## Selected Design

### 1. Add list-loop filter parity to WorkspaceTemplateEngine

Change `DocumentProcessorTagScanner._analyzeListLoops` to follow the established table-loop path:

1. parse the full list source expression with the existing `_parseExpression`;
2. resolve only the parsed path through Mustache context lookup;
3. require the resolved value to be an array;
4. apply the parsed filters through the existing `_applyFilters`;
5. enforce `MAX_ITERATIONS` after filtering;
6. store the filtered array on the list-loop operation.

No ALDO-side filtering or duplicate filter implementation will be introduced. Invalid paths continue to leave the marker untouched and emit a warning, matching current list-loop behavior.

### 2. Add native list-item authoring to GoogleApiWrapper

Extend `GoogleApiWrapper.DocumentBuilder` with an operation equivalent to:

```js
appendListItem(text, { listType: 'bullet' | 'number' })
```

The builder will translate this operation into Google Docs API requests that insert the paragraph text and apply a native bullet glyph preset:

- bullet lists use the library-selected standard bullet preset;
- numbered lists use the library-selected standard decimal/alpha/roman preset.

The operation belongs in `GoogleApiWrapper` because it is generally reusable document-authoring behavior and is the only permitted layer for direct Google API interaction.

Existing `appendParagraph` behavior and request generation remain unchanged.

### 3. Author E2E templates with explicit paragraph kinds

Introduce an E2E paragraph descriptor with:

```ts
interface E2eDocumentParagraph {
  text: string;
  listType?: 'bullet' | 'number';
}
```

`IArtifactFactory.createDocument` will accept strings for backward compatibility and descriptors for native list items. `GasArtifactFactory` will delegate ordinary entries to `appendParagraph` and list entries to the new `appendListItem`.

The representative list markers in the riepilogo template and the filtered list markers in the complex template will be descriptors with their correct list types.

Both affected template names will receive a version increment. `E2eTemplateProvisioner` intentionally reuses artifacts by name, so a version change is required to prevent an old plain-paragraph template from masking the fix in the next online run.

### 4. Use canonical ASL source headers

Remove the `A -> STUDENTE`, `B -> ANNO`, `C -> ORE` mapping from the E2E `CONF_IMP` row. With no transform mapping, `GasDataImporter` copies the already canonical extracted fields unchanged.

This is a fixture/configuration correction, not a new importer feature.

### 5. Preserve technical CDU state in per-subject variants

Keep the current immutable per-subject metadata variant, but explicitly reattach `cdu.tech` as a non-enumerable property with the same descriptor semantics used by `ContextBuilder.initCdu`.

The variant will therefore:

- contain the new `materiaCorrente`;
- share the original technical entity references required by role resolution;
- continue excluding `tech` from serialization and template contexts;
- avoid mutating the original CDU while iterating over subject columns.

This logic remains ALDO-local because `Cdu.tech` and `materiaCorrente` are SGSA-specific domain/context concerns.

## Data Flow After the Repair

### Filtered lists

```text
template directive
  -> parse source path and filters
  -> resolve CDU array
  -> apply registered filters
  -> copy native template list item per result
  -> render item placeholders and text styles
```

### ASL import

```text
Sheet grid
  -> header-based records {STUDENTE, ANNO, ORE}
  -> no rename mapping
  -> ghost filtering
  -> UPSERT into ASL
```

### Protected subject columns

```text
CDU
  -> render dynamic subject columns
  -> read layout item.sigla
  -> create CDU metadata variant with non-enumerable tech preserved
  -> resolve DOCENTE_MATERIA and COORDINATORI
  -> apply range protections
```

## Error Handling

- Filter failures continue to use the existing WorkspaceTemplateEngine error/logging behavior.
- List expansion still rejects iteration counts above `MAX_ITERATIONS`.
- `appendListItem` rejects unsupported list types before issuing API requests.
- ASL import retains the existing ghost-row filtering and result validation.
- A missing `tech` property will be caught by focused ALDO tests before role resolution reaches the online pipeline.
- Document-generation critical-step rollback semantics remain unchanged.

## Testing Strategy

All implementation changes follow red-green-refactor.

### GasLibraryFactory

- Add scanner tests proving filtered bullet and numbered lists resolve the correct path, apply `sortBy`/`where`, and preserve the unfiltered behavior.
- Add a list iteration-limit test.
- Add `DocumentBuilder` tests proving bullet and numbered operations emit native paragraph-bullet requests with correct ranges and do not alter ordinary paragraph requests.
- Run the focused library tests followed by the library's full relevant test/build checks.

### ALDO

- Add E2E provisioner tests asserting the representative and complex markers are authored as native list descriptors and that template names are versioned.
- Add `GasArtifactFactory` tests asserting delegation to `appendListItem`.
- Update the sample-database test to assert that the ASL configuration has no incorrect positional mapping.
- Add a strategy regression test using a CDU whose `tech` property is non-enumerable; assert every per-subject role-resolution variant retains the same technical context and correct `materiaCorrente`.
- Run unit, integration, typecheck, lint, vendor verification, and all build tests.

### Knowledge-graph checks

After reindexing the changed repositories:

- verify ALDO calls match the exact exported `GasLibraryFactory` signatures;
- query for prohibited native GAS globals outside `GoogleApiWrapper`;
- inspect new or changed functions with zero incoming calls;
- inspect architecture boundaries and circular dependencies.

## Vendor and Online Handoff

After the library changes pass their own tests:

1. build the updated `GasLibraryFactory` bundle;
2. refresh ALDO's `vendor/gaslibs.Code.js` and checksum through the existing vendor script;
3. verify the vendor checksum;
4. build ALDO in online mode;
5. rerun `runE2eScenarios` in Google Apps Script.

The local environment cannot prove Google Docs' rendered glyph appearance by itself. The native request tests plus versioned online templates provide deterministic coverage locally; the final live-GAS run remains the acceptance check for actual glyph rendering and protected-range read-back.

## Non-Goals

- No ALDO-local parser, filter engine, or literal Unicode bullet workaround.
- No change to the CDU's non-enumerable serialization contract.
- No redesign of import recipes beyond correcting the invalid E2E mapping.
- No changes to document-generation transaction or rollback policy.
- No unrelated refactoring of the existing online scenario harness.
