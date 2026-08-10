# Parent document visibility for articulated classes — design

## Goal

A document registered for an articulated parent class is discoverable when a
partner class is queried. The stored `LOG_DOCS.CLASSI` value remains the
canonical owner and is never expanded merely to make the document searchable.

## Scope and direction

- Parent document -> partner query: visible.
- Parent document -> parent query: visible as today.
- Partner document -> parent query: not visible through this rule.
- Partner document -> sibling-partner query: not visible through this rule.
- Non-articulated classes retain exact-class matching.

The rule applies to every application query for class documents, including CDU
providers and `AggregatoreDati`'s `documentiPerClasse` source used by email
boxes and imports.

## Architecture

`LogDocumentoRepository.findByClasse(classe)` becomes the common read boundary
for this rule. It receives `IClasseRepository` and builds a lookup scope:

1. Include the requested class ID.
2. If the requested class has a parent, include only that parent ID.
3. Return each matching `LogDocumento` once, even if a pre-existing row happens
   to name more than one ID.

The repository does not mutate `LOG_DOCS`; `LogDocumento.containsClasse()`
continues to represent the raw CSV membership of a persisted row.

`AggregatoreDati.getDocumentiPerClasse()` delegates to this repository rather
than independently filtering its cached raw rows, so `DATI_SORGENTE` and direct
repository consumers share the same visibility contract.

## Composition

The composition root supplies the already-wired `IClasseRepository` to
`LogDocumentoRepository`. `AggregatoreDati` reuses its `ClasseRepository` when
constructing its document repository. No application service constructs a
repository ad hoc.

## Tests

Unit tests cover:

1. A parent-owned document is returned for a direct partner query.
2. A partner-owned document is not returned for parent or sibling queries.
3. A row that names both applicable IDs is returned once.
4. `AggregatoreDati.documentiPerClasse` inherits the same behavior.
5. The E2E verbale scenario sends for each articulated coordinator while the
   parent-owned verbale remains stored only under the parent class.

The scenario-10b E2E assertion is separately corrected to expect the real
coordinator of `3C-C` (Paolo Fontana).
