function compileBestEffortProtectionContract(service: SpreadsheetService):
  | { request: SpreadsheetProtectRequest; message: string }
  | undefined {
  const result = service.protectRanges(
    'spreadsheet-id',
    { range: 'Sheet1!A:A' },
    { onError: 'continue' }
  );

  return result.failures[0];
}

function compileProtectionRepliesContract(service: SpreadsheetService): unknown[] {
  return service.protectRanges('spreadsheet-id', { range: 'Sheet1!A:A' }).replies;
}

test('SpreadsheetService exposes the best-effort protection contract', () => {
  expect(compileBestEffortProtectionContract).toBeDefined();
  expect(compileProtectionRepliesContract).toBeDefined();
});
