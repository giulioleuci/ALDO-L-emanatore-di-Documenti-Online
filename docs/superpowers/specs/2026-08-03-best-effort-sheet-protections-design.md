# Best-effort Sheet protections

## Goal

Keep a generated Google Sheet when one or more requested protected ranges cannot
be assigned to their editors. This permits ALDO online E2E data to use fake,
non-existent addresses while still proving template rendering and file creation.

## Library API

Extend `GoogleApiWrapper`'s existing
`SpreadsheetService.protectRanges(spreadsheetId, protectionRequests, options)`.

- Existing calls keep strict, batch behaviour by default.
- `options.onError: 'continue'` opts into best-effort behaviour.
- In best-effort mode the service submits one protection request at a time. A
  rejected request does not stop later requests.
- Its result retains `spreadsheetId`, `protectedCount`, and
  `protectedRangeIds`; it adds `failures`, containing the rejected original
  request and its error message.
- A failure to resolve spreadsheet metadata or an invalid request before the
  individual submission remains an exception: it is not an editor-assignment
  failure and no request can be safely attempted.

This belongs in GLF because partial failure handling for Sheets advanced-API
batch updates is reusable and must remain behind `GoogleApiWrapper`.

## ALDO integration

`SheetMaterieConPermessiGeneratorStrategy` renders all placeholders first, then
calls `protectRanges` with `onError: 'continue'`. It logs every returned
failure with range and message. Rendering, document registration, and the
generated Sheet continue even when every fake editor is rejected.

Production configurations retain protection for valid ranges. Invalid editor
addresses leave only their affected range unprotected and become warnings;
they never delete a successfully-rendered document.

## Tests

1. GLF unit test: strict mode still makes one batch call and throws on API
   failure.
2. GLF unit test: continue mode submits requests independently, preserves
   successes, and returns structured failures.
3. ALDO strategy test: a rejected protection leaves `processSheet` complete
   and does not throw.
4. ALDO E2E test: `E2E_SHEET_PERMESSI` with fake addresses creates its Sheet,
   replaces dynamic headers/placeholders, and reports no real protected ranges
   as a failure in test mode.

## Non-goals

- Do not invent real E2E identities or relax Google permission validation.
- Do not edit generated `dist` or bypass `GoogleApiWrapper` from ALDO.
