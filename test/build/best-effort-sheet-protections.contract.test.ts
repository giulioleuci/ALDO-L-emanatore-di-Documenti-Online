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

test('SpreadsheetService exposes the best-effort protection contract', () => {
  expect(compileBestEffortProtectionContract).toBeDefined();
});
