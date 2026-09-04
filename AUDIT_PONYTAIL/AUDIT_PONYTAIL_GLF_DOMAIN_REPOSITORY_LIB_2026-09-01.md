Scope: GasLibraryFactory/DomainRepositoryLib non-generated source, tests, index, documentation, and manifest (excluding dist/node_modules); audited 12,151 physical lines.

1. yagni: Remove the unconsumed fluent SpecificationBuilder/FieldSpecificationBuilder facade and its dedicated tests/export; construct FieldSpecification and compose with and/or directly. [DomainRepositoryLib/src/specifications/SpecificationBuilder.js:7] (~557 lines)
2. yagni: Remove the unconsumed ExpressionSpecification feature, its test suite, and export; use FunctionSpecification only when a caller actually needs a runtime predicate. [DomainRepositoryLib/src/specifications/ExpressionSpecification.js:10] (~417 lines)
3. delete: Remove the unreachable GAS README_TESTS placeholder and its stale test inventory; Jest and the real online suite are the test surface. [DomainRepositoryLib/Tests.gs:1] (~58 lines)
4. shrink: Delete the README's duplicate advanced-mapping examples and retain its existing link to the complete guide. [DomainRepositoryLib/README.md:148] (~56 lines)
5. yagni: Remove Entity's never-consumed domain-event buffer and the README example that enqueues into it; there is no current dispatcher or persistence hook to flush it. [DomainRepositoryLib/src/Entity.js:28] (~27 lines)
6. delete: Remove the uncalled getMappingConfiguration escape hatch; EntityMapper already exposes the two required configuration methods. [DomainRepositoryLib/src/internal/mapping/EntityMapper.js:51] (~8 lines)

net: -1123 lines, -0 deps possible.
