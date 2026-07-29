# GLF Effective Assignment Extraction — Design

## Goal

Make ALDO a thin consumer of GasLibraryFactory for teaching-position resolution and
CDU collection transformation. Reusable algorithms move into `RoleResolutionLib`
and `ContextEngine`; ALDO retains only its schema mappings, declarative
configuration, domain labels, and irreducibly school-specific relationships.

Breaking GLF changes are allowed because ALDO is its only consumer and neither
project is in production.

## Scope

This design covers only:

- nominal teaching-position assignments;
- permanent changes from `VARIAZIONI_CATTEDRA`;
- temporary and transitive substitutions from `SUPPLENZE`;
- role, email, document ACL, spreadsheet ACL, and CDU consumers of those results;
- ContextEngine collection operations needed to project resolved assignments into
  ALDO's CDU;
- main, ITP, arbitrary subject-specific slots, IRC, ALT, and articulated classes.

It does not audit unrelated custom logic elsewhere in ALDO.

## Sources of Truth

`SPECS_ALDO/01_SCHEMA_DATABASE.md` and
`SPECS_ALDO/02_CDU_STRUTTURA.md` remain authoritative.

In particular:

- `CLASSI.[MATERIA]` is a main teaching slot;
- `CLASSI.[MATERIA].itp` is an ITP teaching slot;
- `CLASSI.[MATERIA].[SPECIFICA]` is an arbitrary specific teaching slot;
- musical instruments are examples of `SPECIFICA`, not a special model;
- IRC and ALT are `MATERIE` rows marked by `IS_RELIGIONE_ALT=true`;
- `VARIAZIONI_CATTEDRA` and `SUPPLENZE` therefore apply to IRC and ALT like any
  other subject;
- `MAT_NON_STANDARD.md` contains stale statements that must be reconciled with the
  authoritative schema.

## Ownership Boundary

### RoleResolutionLib

`RoleResolutionLib` owns the generic sequence:

```text
base assignments
    -> temporal/contextual overrides
    -> temporary delegation chain
    -> recipient routing
    -> result and audit trace
```

It owns candidate ordering, latest-effective selection, ambiguity detection,
delegation traversal, cycle protection, deduplication, routing, and trace
generation.

### ContextEngine

`ContextEngine` owns reusable collection operations: target-path traversal, map,
filter, flatMap, grouping, aggregation, distinct selection, stable sorting,
conditional prepend/append, zero-to-many replacement, and transform traces.

### ALDO

ALDO retains:

- adapters that expose SheetDB rows through GLF contracts;
- declarative field and scope mappings;
- mapping of dynamic CLASSI column names to generic slot dimensions;
- articulated-class membership data;
- CDU projections, Italian labels, and error-message localization;
- domain-specific selection inputs such as a student's curriculum and religion
  choice.

ALDO must not retain candidate precedence, override selection, delegation
traversal, routing switches, generic grouping, or substitution algorithms.

## RoleResolutionLib Components

### AssignmentSlot

An immutable slot key containing arbitrary dimensions. GLF does not define school
terms such as MAIN, ITP, SPECIFICA, IRC, or ALT.

ALDO configures dimensions equivalent to:

```text
MAT
  subject=MAT, kind=MAIN

INF.itp
  subject=INF, kind=ITP

INTERPRETAZIONE.CHITARRA
  subject=INTERPRETAZIONE, kind=SPECIFICA, discriminator=CHITARRA
```

Every suffix other than the reserved `.itp` form is an arbitrary specificity.

### AssignmentCandidate

An immutable candidate containing:

- actor ID;
- slot;
- validity interval;
- source identifier;
- priority;
- metadata needed for tracing and consumer projection.

### Sources

- `AssignmentSource` supplies base candidates.
- `OverrideSource` supplies dated replacements and identifies the replaced actor.
- `ScopedDelegationSource` supplies temporary delegations matching arbitrary
  scope dimensions.
- `CompositeAssignmentSource` combines independently resolved sources such as
  articulated-class partners.
- `MappedAssignmentSource`, `MappedOverrideSource`, and
  `MappedDelegationSource` convert row-shaped data through declarative mappings.

Mapped sources support:

- field/path extraction;
- CSV scope values;
- the `*` wildcard;
- configurable date parsing;
- arbitrary metadata;
- configurable slot and actor keys.

### EffectiveAssignmentResolver

The main facade resolves one or many slots through:

1. base candidate lookup;
2. effective override lookup;
3. latest-effective override selection;
4. permanent actor resolution;
5. contextual delegation-chain resolution;
6. routing-policy application;
7. deduplication and trace production.

### ResolutionPolicy

The policy configures:

- candidate and source priority;
- latest-effective selection;
- tied-candidate behavior;
- missing-actor behavior;
- identity and deduplication keys;
- composite-source merge behavior;
- delegation depth and cycle behavior;
- routing policy.

### ResolutionResult and ResolutionTrace

The result exposes:

- original and effective permanent actor;
- final delegated actor;
- delegation chain;
- slot and scope metadata;
- routed recipients;
- a structured trace of candidates considered, rejected, replaced, selected, and
  delegated.

## ContextEngine Components

Add a declarative collection-projection pipeline supporting:

- `map`;
- `filter`;
- `flatMap`;
- `groupBy` and aggregation;
- `distinctBy`;
- stable `sortBy`;
- conditional prepend and append;
- zero-to-many replacement at target paths;
- registered projection strategies where declarative paths are insufficient;
- structured configuration and transformation errors;
- transformation traces.

This supersedes the narrow substitution-interceptor use case. It must support:

- splitting council rows by resolved actor/substitution state;
- aggregating subjects and slot metadata;
- arbitrary-specificity filtering against student curriculum;
- IRC/ALT filtering against the student's religion choice;
- construction of the combined `REL/ALT` display and ACL column;
- deterministic ordering and deduplication.

ALDO provides field mappings, predicates/configuration, and display labels. GLF
executes the collection algorithms.

## Resolution Semantics

ALDO exposes every populated dynamic teaching column as a base assignment slot.
For every slot GLF:

1. loads the nominal assignment;
2. finds overrides matching class, subject, date, and replaced actor;
3. selects the override with the latest effective date;
4. resolves the new permanent actor;
5. finds temporary delegations matching date, class, and subject;
6. follows the delegation chain to its final actor;
7. applies the requested routing policy;
8. returns actors, recipients, slot metadata, chain, and trace.

The current database has no separate ITP or specificity fields in
`VARIAZIONI_CATTEDRA` or `SUPPLENZE`. Consequently:

- an override applies to every matching slot of the subject held by
  `VECCHIO_TITOLARE`;
- a substitution applies to every matching slot held by `TITOLARE`;
- if the same actor holds several specificities, the row applies to all matching
  slots unless a future schema adds finer scope dimensions.

This rule applies equally to main, ITP, and arbitrary SPECIFICA slots.

IRC and ALT are classified subjects, not slot kinds. They pass through the same
override and delegation pipeline. Consumers decide whether to include or combine
them based on `IS_RELIGIONE_ALT` and the operation's declared policy.

Articulated-class partners resolve independently through a generic composite
source, then merge using configured slot/actor identity keys.

## Consumer Migration

Every consumer uses a single resolved-assignment facade:

- full class council;
- student-filtered class council;
- `DOCENTE_MATERIA`, CDC, exam-teacher, and related roles;
- email recipient resolution;
- document permissions;
- spreadsheet range permissions;
- subject and specificity lists in the CDU;
- `REL/ALT` combined display and permission columns.

`CattedraResolver`, `SupplenzaRepository.findSupplenzaSpecifica`,
`RisolutoreRuoliService.applicaSupplenze`, and the collection algorithms in
`CdcAssembler` become thin adapters/configuration or are removed.

The ALDO consumption phase must explicitly prove correct behavior for:

- ordinary subjects;
- ITP slots;
- arbitrary SPECIFICA slots;
- multiple specificities for one subject or student;
- IRC;
- ALT;
- articulated variants of every applicable case.

## Error Policy

GLF provides typed failures for:

- malformed or duplicate slots;
- missing referenced actors;
- inconsistent overrides;
- ambiguous latest-effective overrides;
- invalid or overlapping delegations;
- delegation cycles;
- delegation-depth overflow;
- invalid scope mappings;
- collection-transform configuration errors.

Invalid configuration never silently falls back to a nominal actor. ALDO may map
generic failures to localized `DomainError` messages but does not duplicate
detection logic.

## Migration Sequence

1. Add characterization tests for current correct ALDO behavior and failing tests
   for uncovered ITP, arbitrary SPECIFICA, IRC, and ALT cases.
2. Implement the generic effective-assignment pipeline in `RoleResolutionLib`.
3. Implement declarative collection projection in `ContextEngine`.
4. Remove obsolete GLF compatibility APIs where the new design supersedes them.
5. Rebuild GLF, refresh ALDO's vendor bundle and type declarations, and migrate
   ALDO to the new APIs.
6. Replace ALDO algorithms with mappings and configuration.
7. Remove obsolete interceptors, helpers, dead code, and duplicate tests.
8. Reconcile ALDO specifications, especially `MAT_NON_STANDARD.md`.
9. Verify all consumers and test tiers.

## Acceptance Matrix

The test matrix covers:

- main, ITP, and several arbitrary SPECIFICA slots;
- musical instruments as one fixture, never as a library concept;
- IRC and ALT chair changes and substitutions;
- nominal-only, latest override, tied override, stale replaced actor, and missing
  replacement actor;
- no substitute, direct substitute, substitute-of-substitute, cycle, overlap,
  wildcard scope, and CSV scope;
- one actor holding multiple subjects, slot kinds, or specificities;
- standard and articulated classes;
- `SOLO_TITOLARI`, `SOLO_SUPPLENTI`, and `ENTRAMBI`;
- full and student-filtered councils;
- filtering by both `ALUNNI.CURRICULUM` and religion choice;
- agreement among CDU, role recipients, email recipients, document ACLs,
  spreadsheet ACLs, and `REL/ALT` output for shared fixtures;
- deterministic grouping, ordering, deduplication, and trace contents.

## Verification

Run:

- GLF unit and integration tests;
- ALDO unit, integration, and build tests;
- ALDO online smoke/E2E tests;
- typecheck and lint;
- testing, testoffline, production, and online builds;
- vendor refresh and vendor verification.

Use the codebase knowledge graph to verify:

- ALDO-to-GLF linkage and exact signatures;
- no dead custom resolution code remains;
- no duplicate precedence, delegation, routing, or collection algorithms remain in
  ALDO;
- no native GAS bypasses were introduced;
- no architectural cycles were introduced;
- all affected production consumers reach the shared GLF-backed facade.

## Success Criterion

ALDO contains only SheetDB/schema adaptation, declarative scope and slot mappings,
CDU field projections, articulated-class relationship inputs, and domain labels.
All reusable assignment precedence, temporal overrides, delegation traversal,
routing, collection transformation, grouping, ordering, and deduplication are
owned by GasLibraryFactory.
