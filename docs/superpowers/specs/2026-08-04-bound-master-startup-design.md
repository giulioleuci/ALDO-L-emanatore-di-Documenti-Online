# Bound Master Sheet startup

## Goal

Make every ALDO execution use the spreadsheet to which the Apps Script project
is bound as the Master Sheet. `ScriptProperties.MASTER_SPREADSHEET_ID` must not
be a prerequisite for document-generation entrypoints such as a user-created
`generaDocPers` wrapper.

## Design

`initAldo()` will obtain the bound spreadsheet identifier through
`GoogleApiWrapper`'s `SpreadsheetService.getActiveStandard().getId()`. The
existing wrapper remains the only route to the native `SpreadsheetApp` global.

The bound identifier will construct the Master `DatabaseService`, including the
existing `MASTER`-table validation and TEST_MODE owner lookup. The school-year
database continues to come from `MASTER.ID_SPREADSHEET` exactly as today.

`MASTER_SPREADSHEET_ID`, its Script Properties read, and the
`impostaMasterSpreadsheetId` GAS entrypoint will be removed. Script Properties
remain available for batch-job and email checkpoint state, which is unrelated
to locating the bound Master Sheet.

## Error handling

If the bound spreadsheet cannot be resolved, the normal library/GAS error is
allowed to surface. If it resolves but is not an ALDO Master Sheet, the
existing table validation reports that configuration problem.

## Tests

Add a regression test for `initAldo()` showing that it opens the Master database
with the bound spreadsheet ID even when the injected properties facade has no
master-ID value. Remove the obsolete index entrypoint test.
