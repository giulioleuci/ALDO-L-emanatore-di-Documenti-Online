# GasLibraryFactory Online-Test Audit

## Conclusion

Under the requested rule, online tests should verify real Google Workspace API behavior only in `GoogleApiWrapper`. The other libraries expose logic that is testable offline with injected services, fakes, or mocks. Their online tests are therefore removable from the online suite; their behavioral coverage should remain in the existing offline tests.

No test or production files were modified by this audit.

## Online test files removable

These complete library test files are candidates for removal from the online suite:

- `GasResilienceLib/__testOnline__/GasResilienceLibTests.gs`
- `DomainRepositoryLib/__testOnline__/DomainRepositoryLibTests.gs`
- `ContextEngine/__testOnline__/ContextEngineTests.gs`
- `JobRunnerLib/__testOnline__/JobRunnerLibTests.gs`
- `GasProcessMonitorLib/__testOnline__/GasProcessMonitorLibTests.gs`
- `WorkspaceTemplateEngine/__testOnline__/WorkspaceTemplateEngineTests.gs`
- `PipelineFramework/__testOnline__/PipelineFrameworkTests.gs`
- `GasExpressionEngineLib/__testOnline__/GasExpressionEngineLibTests.gs`
- `GasDataImporter/__testOnline__/GasDataImporterTests.gs`
- `RoleResolutionLib/__testOnline__/RoleResolutionLibTests.gs`
- `SheetDBLib/__testOnline__/SheetDBLibTests.gs`
- `GasSchemaValidatorLib/__testOnline__/SchemaValidatorTests.gs`

`SchemaValidatorTests.gs` is the clearest case: all five tests are pure validation/serialization tests, and the file is not registered by `MasterTestRunner`.

## Individual tests that are unambiguously offline

- All five tests in `GasSchemaValidatorLib/__testOnline__/SchemaValidatorTests.gs`.
- `GasResilienceLib/Error_Classification/GAS_Patterns`.
- Both `GasExpressionEngineLib` scenario tests; the spreadsheet writes only echo an already-computed in-memory result.
- Both `GasProcessMonitorLib` tests; the UI test uses a mock and the state test uses injectable wrapper services.
- `Integration/Utils/UtilsService_FormatDate_Utc` in `__testOnline__/integration/IntegrationTests_Utils.gs`.

The remaining non-`GoogleApiWrapper` tests are also removable as online tests under the stated policy, although moving or retaining equivalent coverage offline should be done first where the current test asserts document, sheet, drive, mail, cache, property, or trigger outcomes.

## Integration tests

Remove the online `SheetDB`, `Workflows`, `Lifecycle`, and TemplateEngine integration checks. They exercise higher-level behavior through Google services rather than testing the API boundary itself.

`IntegrationTests_DriveWrapper.gs` is different: its two checks verify `DriveService.getStandardApp()` and routed Drive file operations. Keep that behavior, but place it with the `GoogleApiWrapper` online tests. Likewise, `Integration/Utils/Trigger_Management` is redundant with `GoogleApiWrapper/TriggerService/Lifecycle` and can be removed or folded into that wrapper test.

## Tests to keep online

Keep all six files under `GoogleApiWrapper/__testOnline__/`:

- `GoogleApiWrapperTests.gs`
- `GoogleApiWrapperTests_Services.gs`
- `GoogleApiWrapperTests_Sheets.gs`
- `GoogleApiWrapperTests_Gmail.gs`
- `GoogleApiWrapperTests_Docs.gs`
- `GoogleApiWrapperTests_Drive.gs`

These are the sole online location for real Google API verification. The shared online framework, fixture helpers, and master runner remain necessary for this retained wrapper suite.
