import { avviaInvioNotificheDataDriven } from '../../../src/config/Bootstrap';
import { registerEmailChecks } from '../../../src/onlinetests/checks/emailChecks';
import type { ServiceContainer } from '../../../src/config/ServiceContainer';
import { COL_LOG_MAIL } from '../../../src/config/schema';
import { EMAIL_TEST_SAFE } from '../../../src/onlinetests/data/fixtures';

jest.mock('../../../src/config/Bootstrap', () => ({
  avviaInvioNotificheDataDriven: jest.fn(),
  creaJobRunner: jest.fn(() => ({ runner: true }))
}));

interface CapturedCheck {
  name: string;
  artifactUrl: string | undefined;
  error?: Error;
}

class ImmediateRunner {
  readonly checks: CapturedCheck[] = [];

  add(name: string, artifactUrl: string | undefined, callback: () => void): void {
    try {
      callback();
    } catch (error) {
      // TestRunner records failed callbacks instead of propagating them.
      this.checks.push({
        name,
        artifactUrl,
        error: error instanceof Error ? error : new Error(String(error))
      });
      return;
    }
    this.checks.push({ name, artifactUrl });
  }
}

const sample = {
  sampleSpreadsheetUrl: 'https://example.test/sample',
  testMode: true
} as const;

describe('registerEmailChecks', () => {
  afterEach(() => jest.clearAllMocks());

  it('persists the safe recipient override with every batch launch without mutating the container test mode', () => {
    const launches: Array<{ patternId: string; testRecipient: unknown }> = [];
    const rows: Record<string, unknown>[] = [];
    const db = { table: jest.fn(() => ({ findAll: () => rows })) };
    const container = {
      get: jest.fn(() => db)
    } as unknown as ServiceContainer;
    jest
      .mocked(avviaInvioNotificheDataDriven)
      .mockImplementation((_container, patternId, _runner, _budget, testRecipient) => {
        launches.push({ patternId, testRecipient });
        rows.push({
          [COL_LOG_MAIL.PATTERN]: patternId,
          [COL_LOG_MAIL.DESTINATARI]: EMAIL_TEST_SAFE,
          [COL_LOG_MAIL.STATO]: 'SUCCESS',
          [COL_LOG_MAIL.ALLEGATI]: JSON.stringify({
            testMode: true,
            logicalTargetId: `target:${patternId}`,
            docs: ['document-id'],
            folders: ['folder-id'],
            attach: []
          })
        });
      });

    const runner = new ImmediateRunner();
    registerEmailChecks(runner as never, container, sample, EMAIL_TEST_SAFE);

    expect(launches).not.toHaveLength(0);
    expect(launches.every((launch) => launch.testRecipient === EMAIL_TEST_SAFE)).toBe(true);
    expect(launches.map((launch) => launch.patternId)).toContain('E2E_MAIL_PIANI');
    expect(runner.checks.map((check) => check.name)).toEqual([
      expect.stringContaining('email.invio'),
      expect.stringContaining('email.sicurezza'),
      expect.stringContaining('email.duplicati')
    ]);
  });

  it('refuses to schedule any email batch when MASTER.TEST_MODE is false', () => {
    const runner = new ImmediateRunner();
    const container = { get: jest.fn() } as unknown as ServiceContainer;

    registerEmailChecks(
      runner as never,
      container,
      { ...sample, testMode: false },
      EMAIL_TEST_SAFE
    );

    expect(avviaInvioNotificheDataDriven).not.toHaveBeenCalled();
    expect(runner.checks[0]?.name).toContain('MASTER.TEST_MODE guard');
    expect(runner.checks[0]?.artifactUrl).toBe(sample.sampleSpreadsheetUrl);
  });

  it('refuses a recipient outside the dedicated online-test domain before any batch launch', () => {
    const runner = new ImmediateRunner();
    const container = { get: jest.fn() } as unknown as ServiceContainer;

    registerEmailChecks(runner as never, container, sample, 'teacher@school.example');

    expect(avviaInvioNotificheDataDriven).not.toHaveBeenCalled();
    expect(runner.checks[0]?.name).toContain('safe recipient guard');
  });

  it('rejects verbale logs that lack the persisted document and folder evidence', () => {
    const rows: Record<string, unknown>[] = [];
    const db = { table: jest.fn(() => ({ findAll: () => rows })) };
    const container = { get: jest.fn(() => db) } as unknown as ServiceContainer;
    jest.mocked(avviaInvioNotificheDataDriven).mockImplementation((_container, patternId) => {
      rows.push({
        [COL_LOG_MAIL.PATTERN]: patternId,
        [COL_LOG_MAIL.DESTINATARI]: EMAIL_TEST_SAFE,
        [COL_LOG_MAIL.STATO]: 'SUCCESS',
        [COL_LOG_MAIL.ALLEGATI]: JSON.stringify({
          testMode: true,
          logicalTargetId: `target:${patternId}`,
          docs: ['verbale-id'],
          folders: patternId === 'E2E_MAIL_VERBALE' ? [] : ['folder-id'],
          attach: []
        })
      });
    });

    const runner = new ImmediateRunner();
    registerEmailChecks(runner as never, container, sample, EMAIL_TEST_SAFE);

    expect(runner.checks[0]?.error?.message).toContain(
      'ogni LOG_MAIL testMode deve registrare documenti e cartelle'
    );
  });
});
