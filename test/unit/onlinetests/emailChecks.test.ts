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
}

class ImmediateRunner {
  readonly checks: CapturedCheck[] = [];

  add(name: string, artifactUrl: string | undefined, callback: () => void): void {
    try {
      callback();
    } catch {
      // TestRunner records failed callbacks instead of propagating them.
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

  it('enables safe test mode before every batch launch and disables it after the run', () => {
    const events: string[] = [];
    const rows: Record<string, unknown>[] = [];
    const email = {
      enableTestMode: jest.fn(() => events.push('enable')),
      disableTestMode: jest.fn(() => events.push('disable'))
    };
    const db = { table: jest.fn(() => ({ findAll: () => rows })) };
    const container = {
      get: jest.fn((key: string) => (key === 'emailNotificationService' ? email : db))
    } as unknown as ServiceContainer;
    jest
      .mocked(avviaInvioNotificheDataDriven)
      .mockImplementation((_container, patternId) => {
        events.push(`start:${patternId}`);
        rows.push({
          [COL_LOG_MAIL.PATTERN]: patternId,
          [COL_LOG_MAIL.DESTINATARI]: EMAIL_TEST_SAFE,
          [COL_LOG_MAIL.STATO]: 'SUCCESS',
          [COL_LOG_MAIL.ALLEGATI]: JSON.stringify({
            testMode: true,
            logicalTargetId: `target:${patternId}`,
            docs: ['document-id']
          })
        });
      });

    const runner = new ImmediateRunner();
    registerEmailChecks(runner as never, container, sample, EMAIL_TEST_SAFE);

    const launches = events
      .map((event, index) => ({ event, index }))
      .filter(({ event }) => event.startsWith('start:'));
    expect(launches).not.toHaveLength(0);
    for (const { index } of launches) {
      expect(events[index - 1]).toBe('enable');
      expect(events[index + 1]).toBe('disable');
    }
    expect(runner.checks.map((check) => check.name)).toEqual([
      expect.stringContaining('email.invio'),
      expect.stringContaining('email.sicurezza'),
      expect.stringContaining('email.duplicati')
    ]);
  });

  it('refuses to schedule any email batch when MASTER.TEST_MODE is false', () => {
    const runner = new ImmediateRunner();
    const container = { get: jest.fn() } as unknown as ServiceContainer;

    registerEmailChecks(runner as never, container, { ...sample, testMode: false }, EMAIL_TEST_SAFE);

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
});
