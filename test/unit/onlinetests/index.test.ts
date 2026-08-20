import {
  dumpOnlineCoverage,
  historicalSpreadsheetUrls,
  PROP_ONLINETEST_MASTER_SPREADSHEET_ID,
  PROP_ONLINETEST_STATIC_ATTACHMENT_FILE_ID,
  readPersistedFullOnlineTestSample,
  runFullOnlineTests,
  testArticolazione,
  testITPeMateriePuntate,
  testSupplenzeERuoli,
  testACLReali,
  testJobRunnerDocGen,
  testJobRunnerEmail,
  testRecuperoStoricoAlunno,
  testRecuperoStoricoClasse,
  testRecuperoStoricoDocumenti
} from '../../../src/onlinetests';

const persistedMaster = {
  idSpreadsheet: 'sample-sheet',
  idCartellaRoot: 'sample-folder',
  testMode: true,
  historicalSpreadsheetIds: ['prior-one', 'prior-two'],
  historicalSpreadsheetUrls: [
    'https://docs.google.com/spreadsheets/d/prior-one',
    'https://docs.google.com/spreadsheets/d/prior-two'
  ]
};

function persistedProperties(values: Record<string, string>) {
  return {
    get: (key: string) => values[key] ?? null,
    set: () => undefined
  };
}

test('reads the exact persisted non-Sheets static attachment ID with strict Drive metadata fields', () => {
  const driveService = {
    getFiles: jest.fn(() => ({ id: 'real-static-doc', mimeType: 'application/vnd.google-apps.document' }))
  };

  const sample = readPersistedFullOnlineTestSample(
    persistedProperties({
      [PROP_ONLINETEST_MASTER_SPREADSHEET_ID]: 'master-sheet',
      [PROP_ONLINETEST_STATIC_ATTACHMENT_FILE_ID]: ' real-static-doc '
    }),
    { readMasterConfig: () => persistedMaster, driveService }
  );

  expect(sample.staticAttachmentFileId).toBe('real-static-doc');
  expect(driveService.getFiles).toHaveBeenCalledWith('real-static-doc', {
    fields: 'id,mimeType',
    strict: true
  });
});

test('rejects a missing persisted static attachment ID', () => {
  expect(() =>
    readPersistedFullOnlineTestSample(
      persistedProperties({ [PROP_ONLINETEST_MASTER_SPREADSHEET_ID]: 'master-sheet' }),
      { readMasterConfig: () => persistedMaster }
    )
  ).toThrow(/allegato statico.*mancante/i);
});

test('rejects a persisted static attachment which Drive identifies as a Google Sheet', () => {
  expect(() =>
    readPersistedFullOnlineTestSample(
      persistedProperties({
        [PROP_ONLINETEST_MASTER_SPREADSHEET_ID]: 'master-sheet',
        [PROP_ONLINETEST_STATIC_ATTACHMENT_FILE_ID]: 'sheet-not-attachment'
      }),
      {
        readMasterConfig: () => persistedMaster,
        driveService: {
          getFiles: () => ({
            id: 'sheet-not-attachment',
            mimeType: 'application/vnd.google-apps.spreadsheet'
          })
        }
      }
    )
  ).toThrow(/non può essere un foglio Google/i);
});

test('maps persisted historical configs to useful spreadsheet artifact URLs', () => {
  expect(
    historicalSpreadsheetUrls([{ idSpreadsheet: 'prior-one' }, { idSpreadsheet: 'prior-two' }])
  ).toEqual([
    'https://docs.google.com/spreadsheets/d/prior-one',
    'https://docs.google.com/spreadsheets/d/prior-two'
  ]);
});

function report(failed = 0) {
  return {
    suite: 'aldo-online-tests' as const,
    startedAt: '2026-07-12T09:00:00.000Z',
    finishedAt: '2026-07-12T09:00:01.000Z',
    passed: failed === 0 ? 3 : 2,
    failed,
    results: []
  };
}

describe('runFullOnlineTests', () => {
  it('reports the aggregate suite through the normal job logger', () => {
    const lines: string[] = [];
    const logSpy = jest.spyOn(Logger, 'log').mockImplementation((line) => lines.push(String(line)));
    const expected = report();

    expect(runFullOnlineTests(() => expected, new LoggerService())).toBe(expected);
    expect(lines.join('\n')).toContain(
      '🚀 [INIT] AVVIO JOB: online_tests_full (Tipo: ONLINE_TEST_SUITE)'
    );
    expect(logSpy).not.toHaveBeenCalledWith(JSON.stringify(expected));
  });
});

describe('JobRunner scenario launchers', () => {
  it.each([
    ['doc', testJobRunnerDocGen],
    ['email', testJobRunnerEmail]
  ])('reports the %s three-check scenario through the normal job logger', (_name, launch) => {
    const expected = report();

    expect(launch(() => expected, new LoggerService())).toBe(expected);
  });
});

describe('storico scenario launchers', () => {
  it.each([
    ['alunno', testRecuperoStoricoAlunno],
    ['classe', testRecuperoStoricoClasse],
    ['documenti', testRecuperoStoricoDocumenti]
  ])('reports the scoped %s scenario through the normal job logger', (_name, launch) => {
    const expected = report();

    expect(launch(() => expected, new LoggerService())).toBe(expected);
  });
});

describe('articolazione scenario launcher', () => {
  it('reports articulated checks through the normal job logger', () => {
    const expected = report();

    expect(testArticolazione(() => expected, new LoggerService())).toBe(expected);
  });
});

describe('ITP/dotted scenario launcher', () => {
  it('reports ITP/dotted checks through the normal job logger', () => {
    const expected = report();

    expect(testITPeMateriePuntate(() => expected, new LoggerService())).toBe(expected);
  });
});

describe('supplenze and real ACL scenario launchers', () => {
  it.each([
    ['supplenze', testSupplenzeERuoli],
    ['ACL', testACLReali]
  ])('reports %s checks through the normal job logger', (_name, launch) => {
    const expected = report();

    expect(launch(() => expected, new LoggerService())).toBe(expected);
  });
});

describe('dumpOnlineCoverage', () => {
  afterEach(() => {
    delete (globalThis as { __coverage__?: unknown }).__coverage__;
  });

  it('logs the Istanbul coverage map when instrumentation populated it', () => {
    const info = jest.fn();
    const loggerSpy = jest.spyOn(ServiceFactory, 'getLogger').mockReturnValue({ info } as never);
    (globalThis as { __coverage__?: unknown }).__coverage__ = { 'src/foo.ts': { s: { '0': 1 } } };

    dumpOnlineCoverage();

    expect(info).toHaveBeenCalledWith(JSON.stringify({ 'src/foo.ts': { s: { '0': 1 } } }));
    loggerSpy.mockRestore();
  });

  it('logs an empty object when the bundle was not instrumented', () => {
    const info = jest.fn();
    const loggerSpy = jest.spyOn(ServiceFactory, 'getLogger').mockReturnValue({ info } as never);

    dumpOnlineCoverage();

    expect(info).toHaveBeenCalledWith('{}');
    loggerSpy.mockRestore();
  });
});
