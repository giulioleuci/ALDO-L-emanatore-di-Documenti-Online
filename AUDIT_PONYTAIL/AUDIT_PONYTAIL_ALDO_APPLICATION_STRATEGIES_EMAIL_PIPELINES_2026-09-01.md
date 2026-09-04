# Ponytail audit — application strategies, email, pipelines, factories, ports

## Scope and audited lines

Production source only; tests and callers were evidence only. 15 files, 3,342 lines:

- `src/application/strategies/DocPersonalizzatoGeneratorStrategy.ts` (23), `DocumentoConTabelleImportateGeneratorStrategy.ts` (80), `DocumentoGenericoGeneratorStrategy.ts` (16), `FoglioGenericoGeneratorStrategy.ts` (17), `GeneratorStrategy.ts` (7), `SheetMaterieConPermessiGeneratorStrategy.ts` (271), `SheetMaterieGeneratorStrategy.ts` (259).
- `src/application/email/boxes.ts` (861), `saluto.ts` (76).
- `src/application/pipelines/documentSteps.ts` (575), `emailSteps.ts` (819), `logRegistration.ts` (57), `postProcessActions.ts` (174).
- `src/application/factories/DocumentStrategyFactory.ts` (61); `src/application/ports/ITeachingAssignmentResolver.ts` (46).

Graph checks: no native GAS calls in scope; no dead function/class candidate after caller/test traces; the factory selects five real strategy products; `GeneratorStrategy` has four production implementations and `ITeachingAssignmentResolver` has its infrastructure implementation plus test doubles. `ComposableContentLib`, `PipelineFramework`, `WorkspaceTemplateEngine`, `RoleResolutionLib`, and `JobRunnerLib` were checked against the library graph. Email boxes already use `ComposableContentLib`; the local HTML helpers already delegate to `CoreUtilsLib.HtmlSanitizer`, so neither is a duplicate to remove.

## Findings

1. `yagni:` Remove the unread `ILogDocumentoRepository` import and `_logDocs` constructor injection; `ComposeEmailStep` never reads it, so delete its matching production call argument. `src/application/pipelines/emailSteps.ts:23,469` (~2 scoped lines).

net: -2 scoped production lines, -0 deps possible.
