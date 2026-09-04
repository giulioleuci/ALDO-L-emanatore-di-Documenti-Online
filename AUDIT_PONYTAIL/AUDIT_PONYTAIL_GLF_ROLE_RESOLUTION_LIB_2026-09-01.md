# Ponytail audit — RoleResolutionLib

Scope: `GasLibraryFactory/RoleResolutionLib` source, unit tests, `index.js`, `README.md`, and `appsscript.json`; generated output and dependencies excluded.
Audited: 60 files, 11,264 lines (5,355 library/docs and 5,909 tests).

1. [delete] Drop the undocumented loose-POJO compatibility branches and their tests; the published source contract already says `Assignment[]`, so call `assignment.matches(...)` / `assignment.isValidAt(...)` directly. [RoleResolutionLib/src/registry/AssignmentSource.js:102] (~173 lines)
2. [delete] Drop loose delegation-object fallbacks and their tests; `DelegationSource` documents `Delegation[]`, whose `isValidAt`, `appliesToRole`, and `appliesToScope` already provide this behavior. [RoleResolutionLib/src/registry/DelegationSource.js:85] (~94 lines)
3. [yagni] Remove the internally unreferenced `RoutingResult` convenience surface (`allPrimary`, recipient-query helpers, three `with*` builders, and `merge`); construction with `{ primary, cc, bcc }` is the only library idiom and the README does not promise these extras. [RoleResolutionLib/src/internal/routing/RoutingResult.js:68] (~126 lines)
4. [delete] Remove the never-read `DelegationValidator` import and eagerly created field; `RoleResolver` performs its own delegation checks and has no `_delegationValidator` use. [RoleResolutionLib/src/internal/resolution/RoleResolver.js:11] (~6 lines)
5. [shrink] Remove the empty `delegationChain.forEach` and unused `actorIds` local from the `CHAIN_ALL` branch; the result already obtains `chainActorIds` once in its metadata. [RoleResolutionLib/src/internal/routing/RoutingResolver.js:233] (~8 lines)

net: -407 lines, -0 deps possible.
