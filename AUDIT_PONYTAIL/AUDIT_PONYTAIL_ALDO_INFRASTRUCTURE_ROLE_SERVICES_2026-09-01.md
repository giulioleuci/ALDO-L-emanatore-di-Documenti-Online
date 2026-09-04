# Ponytail audit — ALDO infrastructure role-resolution/services

Scope: ALDO only — `src/infrastructure/role-resolution/` and `src/infrastructure/services/`; complexity and over-engineering only.

Audited: 4 source files / 713 assigned source lines; GLF docs and graph signatures checked first; external source/tests inspected only as usage evidence.

1. [shrink] Replace the 25-line scope-hoisting incident history and the three-line duplicate wrapper rationale with two one-line invariants; the wrappers and their GLF calls remain. [src/infrastructure/role-resolution/RowScopeExpansion.ts:30] (~26 lines)
2. [yagni] Delete the private one-method `ResolutionConfiguration` abstraction and return its only implementation, `ArticulatedResolutionConfiguration`, directly. [src/infrastructure/role-resolution/AldoTeachingResolutionConfig.ts:16] (~3 lines)
3. [delete] Remove the private `CartellaResult` declaration and let `findOrCreate` infer its already-identical structural result. [src/infrastructure/services/AlberoCartelle.ts:16] (~4 lines)
4. [yagni] Drop legacy singular `classe`/`utente` options: the sole production caller supplies canonical `classi`/`utenti`; remaining uses are this service's tests. [src/infrastructure/services/AlberoCartelle.ts:5] (~2 lines)

net: -35 lines, -0 deps possible.
