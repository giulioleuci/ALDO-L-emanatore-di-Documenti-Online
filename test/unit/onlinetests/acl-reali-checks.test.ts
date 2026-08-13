import {
  assertExactDrivePermissionPrincipals,
  assertProtectedRangePrincipals,
  registerAclRealiChecks
} from '../../../src/onlinetests/checks/aclRealiChecks';
import type { ServiceContainer } from '../../../src/config/ServiceContainer';
import type { SharedTestDatabase } from '../../../src/onlinetests/data/SharedTestDatabaseBuilder';

class RecordingRunner {
  readonly checks: Array<{ name: string; artifactUrl: string | undefined; callback: () => void }> = [];

  add(name: string, artifactUrl: string | undefined, callback: () => void): void {
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

test('Drive ACL assertion ignores owner but rejects unexpected non-owner principal', () => {
  const permissions = [
    { type: 'user', role: 'owner', emailAddress: 'owner@example.test' },
    { type: 'user', role: 'writer', emailAddress: 'expected@example.test' },
    { type: 'user', role: 'reader', emailAddress: 'unexpected@example.test' }
  ];

  expect(() =>
    assertExactDrivePermissionPrincipals('file', permissions, ['expected@example.test'])
  ).toThrow(/unexpected@example\.test/);
});

test('Drive ACL assertion accepts exact non-owner principals and deduplicates API rows', () => {
  const permissions = [
    { type: 'user', role: 'owner', emailAddress: 'owner@example.test' },
    { type: 'user', role: 'writer', emailAddress: 'writer@example.test' },
    { type: 'user', role: 'writer', emailAddress: 'writer@example.test' }
  ];

  expect(() =>
    assertExactDrivePermissionPrincipals('file', permissions, ['writer@example.test'])
  ).not.toThrow();
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
