# Ponytail audit — ALDO tests

Scope: tracked, non-generated `test/**` only (unit, integration, build, fakes, fixtures, setup, and type contracts): 209 files, 42,715 physical lines. `src/` was read only to verify the E2E-builder seams; existing test edits were preserved.

1. shrink: Replace the five local `RecordingSpreadsheet`/factory harnesses with one test fake that records rows, headers, batches, and an optional bound master; the copies differ only in those four switches. [test/unit/application/database-validation-service-full-db.test.ts:22] (~169 lines).
2. shrink: Delete the two local `recordingArtifacts` clones and import the existing `testArtifactFactory`; all three are the same two-method sequential artifact fake, so coverage is unchanged. [test/unit/onlinetests/shared-test-database-builder-migration.test.ts:93] (~22 lines).
3. shrink: Move the identical complete `E2eTemplateIds` literal used by the migration, seeder, and full-DB tests into one fixture; tests that deliberately use the older partial set remain local. [test/unit/application/database-validation-service-full-db.test.ts:79] (~55 lines).

net: -246 lines, -0 deps possible.
