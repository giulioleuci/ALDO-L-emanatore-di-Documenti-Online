import {
  registerPermessiChecks,
  type PermessiChecksDeps
} from '../../../src/onlinetests/checks/permessiChecks';
import type { ServiceContainer } from '../../../src/config/ServiceContainer';
import type { SharedTestDatabase } from '../../../src/onlinetests/data/SharedTestDatabaseBuilder';

class RecordingRunner {
  readonly checks: Array<{ name: string; artifactUrl: string | undefined; callback: () => void }> =
    [];
  readonly skipped: Array<{ name: string; artifactUrl: string | undefined; reason: string }> = [];

  add(name: string, artifactUrl: string | undefined, callback: () => void): void {
    this.checks.push({ name, artifactUrl, callback });
  }

  skip(name: string, artifactUrl: string | undefined, reason: string): void {
    this.skipped.push({ name, artifactUrl, reason });
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

test('reads active Workspace user and persisted Drive ACL without faking a pass', () => {
  const runner = new RecordingRunner();
  const deps: PermessiChecksDeps = {
    activeUser: { getEmail: () => 'preside@example.test' },
    readPermissions: () => [{ type: 'user', role: 'owner', emailAddress: 'preside@example.test' }]
  };

  registerPermessiChecks(runner as never, {} as ServiceContainer, sample, deps);

  expect(runner.skipped).toEqual([]);
  expect(runner.checks).toHaveLength(1);
  expect(() => runner.checks[0]!.callback()).not.toThrow();
});

test('records documented SKIPPED when Workspace policy withholds active-user identity', () => {
  const runner = new RecordingRunner();
  const deps: PermessiChecksDeps = {
    activeUser: { getEmail: () => '' },
    readPermissions: jest.fn()
  };

  registerPermessiChecks(runner as never, {} as ServiceContainer, sample, deps);

  expect(runner.checks).toEqual([]);
  expect(runner.skipped[0]?.name).toBe('permessi.attivi::visibilità utente attivo (gated)');
  expect(runner.skipped[0]?.reason).toMatch(/^SKIPPED:.*identit/i);
  expect(deps.readPermissions).not.toHaveBeenCalled();
});

test('records documented SKIPPED when read-back cannot attribute a group/domain ACL to active user', () => {
  const runner = new RecordingRunner();
  const deps: PermessiChecksDeps = {
    activeUser: { getEmail: () => 'preside@example.test' },
    readPermissions: () => [{ type: 'domain', role: 'reader', domain: 'example.test' }]
  };

  registerPermessiChecks(runner as never, {} as ServiceContainer, sample, deps);

  expect(runner.checks).toEqual([]);
  expect(runner.skipped[0]?.reason).toMatch(/^SKIPPED:.*group\/domain/i);
});

test('does not turn Drive quota/auth/read-back errors into a skip', () => {
  const runner = new RecordingRunner();
  const failure = new Error('Service invoked too many times');
  const deps: PermessiChecksDeps = {
    activeUser: { getEmail: () => 'preside@example.test' },
    readPermissions: () => {
      throw failure;
    }
  };

  expect(() =>
    registerPermessiChecks(runner as never, {} as ServiceContainer, sample, deps)
  ).toThrow(failure);
  expect(runner.skipped).toEqual([]);
});
