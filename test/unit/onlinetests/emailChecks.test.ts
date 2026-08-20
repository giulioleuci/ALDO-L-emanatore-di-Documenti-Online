import { avviaInvioNotificheDataDriven } from '../../../src/config/Bootstrap';
import { registerEmailChecks } from '../../../src/onlinetests/checks/emailChecks';
import type { ServiceContainer } from '../../../src/config/ServiceContainer';
import { COL_LOG_DOCS, COL_LOG_FOLD, COL_LOG_MAIL, TABLE } from '../../../src/config/schema';
import { EMAIL_TEST_SAFE } from '../../../src/onlinetests/data/fixtures';

const AUTHENTICATED_OPERATOR = 'operator@example.test';

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

function databaseFor(
  mailRows: Record<string, unknown>[],
  documentRows: Record<string, unknown>[] = [],
  folderRows: Record<string, unknown>[] = []
) {
  return {
    table: jest.fn((table: string) => ({
      findAll: () =>
        table === TABLE.LOG_MAIL
          ? mailRows
          : table === TABLE.LOG_DOCS
            ? documentRows
            : table === TABLE.LOG_FOLD
              ? folderRows
              : []
    }))
  };
}

describe('registerEmailChecks', () => {
  afterEach(() => jest.clearAllMocks());

  it('persists the authenticated operator with every batch launch and accepts matching successful LOG_MAIL rows', () => {
    const launches: Array<{ patternId: string; testRecipient: unknown }> = [];
    const rows: Record<string, unknown>[] = [];
    const db = databaseFor(
      rows,
      [
        {
          [COL_LOG_DOCS.ID]: 'document-id',
          [COL_LOG_DOCS.ID_GEN]: 'E2E_VERBALE',
          [COL_LOG_DOCS.TIPO]: 'VERBALE',
          [COL_LOG_DOCS.LINK]: 'https://drive.example/document-id'
        }
      ],
      [
        {
          [COL_LOG_FOLD.ID]: 'folder-id',
          [COL_LOG_FOLD.LINK]: 'https://drive.example/folder-id'
        }
      ]
    );
    const container = {
      get: jest.fn(() => db)
    } as unknown as ServiceContainer;
    jest
      .mocked(avviaInvioNotificheDataDriven)
      .mockImplementation((_container, patternId, _runner, _budget, testRecipient) => {
        launches.push({ patternId, testRecipient });
        rows.push({
          [COL_LOG_MAIL.PATTERN]: patternId,
          [COL_LOG_MAIL.DESTINATARI]: AUTHENTICATED_OPERATOR,
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
    registerEmailChecks(runner as never, container, sample, AUTHENTICATED_OPERATOR);

    expect(launches).not.toHaveLength(0);
    expect(launches.every((launch) => launch.testRecipient === AUTHENTICATED_OPERATOR)).toBe(true);
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

  it.each([
    ['multiple recipients', `${AUTHENTICATED_OPERATOR}, production@example.test`, 'SUCCESS', 'target:mail'],
    ['a production recipient different from the authenticated operator', 'production@example.test', 'SUCCESS', 'target:mail'],
    ['a non-success result', AUTHENTICATED_OPERATOR, 'ERROR', 'target:mail'],
    ['an empty logical target ID', AUTHENTICATED_OPERATOR, 'SUCCESS', '']
  ])(
    'rejects LOG_MAIL rows with %s',
    (_caseName, recipients, status, logicalTargetId) => {
      const rows: Record<string, unknown>[] = [];
      const db = databaseFor(rows);
      const container = { get: jest.fn(() => db) } as unknown as ServiceContainer;
      jest.mocked(avviaInvioNotificheDataDriven).mockImplementation((_container, patternId) => {
        rows.push({
          [COL_LOG_MAIL.PATTERN]: patternId,
          [COL_LOG_MAIL.DESTINATARI]: recipients,
          [COL_LOG_MAIL.STATO]: status,
          [COL_LOG_MAIL.ALLEGATI]: JSON.stringify({
            testMode: true,
            logicalTargetId,
            docs: [],
            folders: [],
            attach: []
          })
        });
      });

      const runner = new ImmediateRunner();
      registerEmailChecks(runner as never, container, sample, AUTHENTICATED_OPERATOR);

      expect(runner.checks[0]?.error?.message).toContain('LOG_MAIL testMode non sicuro o incompleto');
    }
  );

  it('rejects verbale logs whose document and folder IDs do not resolve to the expected persisted artifacts', () => {
    const rows: Record<string, unknown>[] = [];
    const db = databaseFor(
      rows,
      [
        {
          [COL_LOG_DOCS.ID]: 'expected-document-id',
          [COL_LOG_DOCS.ID_GEN]: 'E2E_VERBALE',
          [COL_LOG_DOCS.TIPO]: 'VERBALE',
          [COL_LOG_DOCS.LINK]: 'https://drive.example/expected-document-id'
        }
      ],
      [
        {
          [COL_LOG_FOLD.ID]: 'folder-id',
          [COL_LOG_FOLD.LINK]: 'https://drive.example/folder-id'
        }
      ]
    );
    const container = { get: jest.fn(() => db) } as unknown as ServiceContainer;
    jest.mocked(avviaInvioNotificheDataDriven).mockImplementation((_container, patternId) => {
      rows.push({
        [COL_LOG_MAIL.PATTERN]: patternId,
        [COL_LOG_MAIL.DESTINATARI]: EMAIL_TEST_SAFE,
        [COL_LOG_MAIL.STATO]: 'SUCCESS',
        [COL_LOG_MAIL.ALLEGATI]: JSON.stringify({
          testMode: true,
          logicalTargetId: `target:${patternId}`,
          docs: [patternId === 'E2E_MAIL_VERBALE' ? 'wrong-document-id' : 'expected-document-id'],
          folders: ['folder-id'],
          attach: []
        })
      });
    });

    const runner = new ImmediateRunner();
    registerEmailChecks(runner as never, container, sample, EMAIL_TEST_SAFE);

    expect(runner.checks[0]?.error?.message).toContain(
      'non corrispondono ai VERBALE/LOG_FOLD persistiti'
    );
  });
});
