import {
  assertExactDrivePermissionPrincipals,
  assertProtectedRangePrincipals,
  registerAclRealiChecks,
  type DrivePermissionExpectation
} from '../../../src/onlinetests/checks/aclRealiChecks';
import type { OnlineTestSkippedOutcome } from '../../../src/onlinetests/report/OnlineTestReport';
import type { ServiceContainer } from '../../../src/config/ServiceContainer';
import type { Cdu } from '../../../src/application/context-engine/Cdu';
import type { SharedTestDatabase } from '../../../src/onlinetests/data/SharedTestDatabaseBuilder';

class RecordingRunner {
  readonly checks: Array<{
    name: string;
    artifactUrl: string | undefined;
    callback: () => void | OnlineTestSkippedOutcome;
  }> = [];

  add(
    name: string,
    artifactUrl: string | undefined,
    callback: () => void | OnlineTestSkippedOutcome
  ): void {
    this.checks.push({ name, artifactUrl, callback });
  }
}

const sample: SharedTestDatabase = {
  masterSpreadsheetId: 'master',
  sampleSpreadsheetId: 'sample',
  sampleSpreadsheetUrl: 'https://example.test/sample',
  sampleFolderUrl: 'https://example.test/folder',
  priorSampleSpreadsheetId: 'prior-one',
  priorSampleSpreadsheetUrl: 'https://example.test/prior-one',
  priorSampleSpreadsheetId2: 'prior-two',
  priorSampleSpreadsheetUrl2: 'https://example.test/prior-two',
  logFoldFolderUrl: 'https://example.test/log-fold',
  jobRunnerDocConfigId: 'jobrunner',
  masterTestMode: true,
  staticAttachmentFileId: 'attachment'
};

test('registers real Drive ACL and protected-range read-back checks', () => {
  const runner = new RecordingRunner();

  registerAclRealiChecks(runner as never, {} as ServiceContainer, sample);

  expect(runner.checks.map(({ name, artifactUrl }) => ({ name, artifactUrl }))).toEqual([
    {
      name: 'acl.reali::lettura ACL file/cartella',
      artifactUrl: sample.sampleSpreadsheetUrl
    },
    {
      name: 'acl.reali::protected ranges Sheets reali',
      artifactUrl: sample.sampleSpreadsheetUrl
    }
  ]);
});

function protectedRangeCallback(
  ranges: Array<{ description?: string; editors?: { users?: string[] }; warningOnly?: boolean }>
): { callback: () => void | OnlineTestSkippedOutcome; getFiles: jest.Mock; getProtectedRanges: jest.Mock } {
  const runner = new RecordingRunner();
  const getFiles = jest.fn(() => ({ parents: ['folder'] }));
  const getProtectedRanges = jest.fn(() => ranges);
  const teacher = 'teacher@onlinetest.aldo.local';
  const coordinator = 'coordinator@onlinetest.aldo.local';
  const cdu = { meta: { parametriInput: {} }, tech: {} } as unknown as Cdu;
  const container = {
    get<T>(key: string): T {
      if (key === 'documentGenerationService') {
        return { generateForClasse: () => ({ fileId: 'sheet', status: 'CREATED' }) } as T;
      }
      if (key === 'contextBuilder') return { build: () => cdu } as T;
      if (key === 'risolutoreRuoli') {
        return {
          risolvi: (role: string) =>
            (role === 'DOCENTE_MATERIA' ? [teacher] : [coordinator]).map((value) => ({ value }))
        } as T;
      }
      throw new Error(`Unexpected service ${key}`);
    }
  } as ServiceContainer;
  jest.spyOn(ServiceFactory, 'getDriveService').mockReturnValue({ getFiles } as never);
  jest
    .spyOn(ServiceFactory, 'getSpreadsheetService')
    .mockReturnValue({ getProtectedRanges } as never);

  registerAclRealiChecks(runner as never, container, sample);
  const callback = runner.checks.find((check) => check.name.includes('protected ranges'))?.callback;
  if (callback === undefined) throw new Error('Protected-range callback was not registered');
  return { callback, getFiles, getProtectedRanges };
}

afterEach(() => jest.restoreAllMocks());

test('acl.reali records verified synthetic empty evidence as PASS, not a second skip', () => {
  const { callback, getFiles, getProtectedRanges } = protectedRangeCallback([]);

  expect(callback()).toBeUndefined();
  expect(getFiles).toHaveBeenCalledWith('sheet', expect.anything());
  expect(getProtectedRanges).toHaveBeenCalledWith('sheet');
});

test('acl.reali completes without a skip after strict MAT principal assertion succeeds', () => {
  const { callback } = protectedRangeCallback([
    {
      description: 'Colonna materia MAT (10 §9)',
      editors: {
        users: ['teacher@onlinetest.aldo.local', 'coordinator@onlinetest.aldo.local']
      },
      warningOnly: false
    }
  ]);

  expect(callback()).toBeUndefined();
});

test.each([
  {
    label: 'warning-only range',
    ranges: [
      {
        description: 'Colonna materia MAT (10 §9)',
        editors: { users: ['teacher@onlinetest.aldo.local', 'coordinator@onlinetest.aldo.local'] },
        warningOnly: true
      }
    ],
    error: /warningOnly/
  },
  {
    label: 'partial range',
    ranges: [
      {
        description: 'Colonna materia MAT (10 §9)',
        editors: { users: ['teacher@onlinetest.aldo.local'] },
        warningOnly: false
      }
    ],
    error: /coordinator@onlinetest\.aldo\.local/
  }
])('acl.reali sends $label to strict MAT principal assertion', ({ ranges, error }) => {
  const { callback } = protectedRangeCallback(ranges);

  expect(callback).toThrow(error);
});

test('Drive ACL assertion ignores owner but rejects unexpected non-owner principal', () => {
  const permissions = [
    { type: 'user', role: 'owner', emailAddress: 'owner@example.test' },
    { type: 'user', role: 'writer', emailAddress: 'expected@example.test' },
    { type: 'user', role: 'reader', emailAddress: 'unexpected@example.test' }
  ];

  expect(() =>
    assertExactDrivePermissionPrincipals('file', permissions, [
      { type: 'user', principal: 'expected@example.test', role: 'writer' }
    ])
  ).toThrow(/unexpected@example\.test/);
});

test('Drive ACL assertion accepts exact non-owner principals and deduplicates API rows', () => {
  const permissions = [
    { type: 'user', role: 'owner', emailAddress: 'owner@example.test' },
    { type: 'user', role: 'writer', emailAddress: 'writer@example.test' },
    { type: 'user', role: 'writer', emailAddress: 'writer@example.test' }
  ];

  expect(() =>
    assertExactDrivePermissionPrincipals('file', permissions, [
      { type: 'user', principal: 'writer@example.test', role: 'writer' }
    ])
  ).not.toThrow();
});

test.each([
  [{ type: 'domain', role: 'reader', domain: 'example.test' }, /domain:example\.test/],
  [{ type: 'anyone', role: 'reader' }, /anyone/]
])('Drive ACL assertion rejects unexpected non-email principal %#', (extra, expectedError) => {
  const expected: DrivePermissionExpectation[] = [
    { type: 'user', principal: 'writer@example.test', role: 'writer' }
  ];

  expect(() =>
    assertExactDrivePermissionPrincipals(
      'file',
      [{ type: 'user', role: 'writer', emailAddress: 'writer@example.test' }, extra],
      expected
    )
  ).toThrow(expectedError);
});

test('Drive ACL assertion preserves principal type and rejects a group where a user is expected', () => {
  expect(() =>
    assertExactDrivePermissionPrincipals(
      'file',
      [{ type: 'group', role: 'writer', emailAddress: 'writer@example.test' }],
      [{ type: 'user', principal: 'writer@example.test', role: 'writer' }]
    )
  ).toThrow(/group:writer@example\.test/);
});

test('Drive ACL assertion rejects an unexpected permission role', () => {
  expect(() =>
    assertExactDrivePermissionPrincipals(
      'folder',
      [{ type: 'user', role: 'writer', emailAddress: 'reader@example.test' }],
      [{ type: 'user', principal: 'reader@example.test', role: 'reader' }]
    )
  ).toThrow(/writer/);
});

test('protected-range assertion rejects missing editor and an unprotected expected subject', () => {
  expect(() =>
    assertProtectedRangePrincipals(
      [
        {
          description: 'Colonna materia MAT (10 §9)',
          editors: { users: ['coordinatore@example.test'] },
          warningOnly: false
        }
      ],
      ['coordinatore@example.test', 'docente@example.test'],
      'MAT'
    )
  ).toThrow(/docente@example\.test/);
});

test('protected-range assertion accepts exact editors for focal subject', () => {
  expect(() =>
    assertProtectedRangePrincipals(
      [
        {
          description: 'Colonna materia MAT (10 §9)',
          editors: { users: ['coordinatore@example.test', 'docente@example.test'] },
          warningOnly: false
        }
      ],
      ['docente@example.test', 'coordinatore@example.test'],
      'MAT'
    )
  ).not.toThrow();
});
