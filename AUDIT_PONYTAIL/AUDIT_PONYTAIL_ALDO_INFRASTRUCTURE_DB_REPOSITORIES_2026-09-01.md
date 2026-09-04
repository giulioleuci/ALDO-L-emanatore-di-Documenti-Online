# Ponytail audit — ALDO infrastructure DB and repositories

Scope: all 23 requested files — `src/infrastructure/db/` (303 lines) and `src/infrastructure/repositories/` (1,842 lines), 2,145 lines total. No files outside this scope are counted.

Audit evidence: `aldo-full-coverage` graph architecture, symbol/search/path and snippet review; DB/repository interfaces and matching unit tests; `SheetDBLib`, `DomainRepositoryLib`, and `CoreUtilsLib` docs plus GLF graph signatures. `SheetTableAdapter` remains: it is the necessary typed/composite-key seam. Per-repository list caches remain: GLF only supplies per-ID/cache-service behavior, not an equivalent cached-list API.

## Findings

1. `delete:` Remove the production-unused repository `getBoxes` delegate; callers use `ConfigurazioneEmail.getBoxes()` directly, and `IConfigurazioneEmailRepository` does not expose it. Replacement: none. [src/infrastructure/repositories/ConfigurazioneEmailRepository.ts:33] (~4)
2. `delete:` Remove test-only IRC/ALT convenience methods; neither is in `IClasseRepository` and production has no call site. Replacement: none. [src/infrastructure/repositories/ClasseRepository.ts:181] (~6)
3. `delete:` Remove test-only articulated subject lookup; it is not part of `IClasseRepository` and production resolves teaching slots through the retained API. Replacement: none. [src/infrastructure/repositories/ClasseRepository.ts:322] (~14)

net: -24 ALDO lines, -0 deps possible.
