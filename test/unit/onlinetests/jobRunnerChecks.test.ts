import {
  avviaGenerazioneDataDriven,
  avviaInvioNotificheDataDriven,
  creaJobRunner,
  riprendiJobSospeso
} from '../../../src/config/Bootstrap';
import type { ServiceContainer } from '../../../src/config/ServiceContainer';
import { COL_LOG_DOCS, COL_LOG_MAIL, TABLE } from '../../../src/config/schema';
import {
  registerJobRunnerChecks,
  registerJobRunnerDocGenChecks,
  registerJobRunnerEmailChecks,
  registerJobRunnerTriggerRealeCheck
} from '../../../src/onlinetests/checks/jobRunnerChecks';
import { CONF_DOC_JOBRUNNER, CONF_MAIL_JOBRUNNER } from '../../../src/onlinetests/data/fixtures';

const AUTHENTICATED_OPERATOR = 'operator@example.test';

const propertyValues = new Map<string, string>();

jest.mock('../../../src/infrastructure/facades/PropertiesFacade', () => ({
  ScriptPropertiesFacade: jest.fn(() => ({
    get: (key: string) => propertyValues.get(key) ?? null,
    set: (key: string, value: string) => propertyValues.set(key, value)
  }))
}));

jest.mock('../../../src/config/Bootstrap', () => ({
  avviaGenerazioneDataDriven: jest.fn(),
  avviaInvioNotificheDataDriven: jest.fn(),
  creaJobRunner: jest.fn(),
  riprendiJobSospeso: jest.fn()
}));

interface CapturedCheck {
  name: string;
  error?: Error;
}

class ImmediateRunner {
  readonly checks: CapturedCheck[] = [];

  add(name: string, _artifactUrl: string | undefined, callback: () => void): void {
    try {
      callback();
      this.checks.push({ name });
    } catch (error) {
      this.checks.push({
        name,
        error: error instanceof Error ? error : new Error(String(error))
      });
    }
  }
}

interface FakeStatus {
  state: string;
  completed: boolean;
  percentage: number;
}

function makeJobRunner(jobName: string) {
  let status: FakeStatus = { state: 'not_started', completed: false, percentage: 0 };
  return {
    getStatus: jest.fn(() => ({ ...status })),
    setStatus(next: FakeStatus) {
      status = next;
    },
    resetJob: jest.fn(() => {
      const triggerId = propertyValues.get(`trigger_${jobName}`);
      propertyValues.delete(`trigger_${jobName}`);
      if (triggerId !== undefined) propertyValues.delete(`job_for_trigger_${triggerId}`);
      propertyValues.delete(`state_${jobName}`);
      status = { state: 'not_started', completed: false, percentage: 0 };
    }),
    cancelJob: jest.fn(() => {
      status = { state: 'cancelled', completed: false, percentage: 0 };
    })
  };
}

const sample = {
  sampleSpreadsheetUrl: 'https://example.test/sample',
  testMode: true
} as const;

describe('JobRunner online checks', () => {
  const docJobName = `gen_${CONF_DOC_JOBRUNNER}`;
  const mailJobName = `mail_${CONF_MAIL_JOBRUNNER}`;
  let docRows: Record<string, unknown>[];
  let mailRows: Record<string, unknown>[];
  let docRunner: ReturnType<typeof makeJobRunner>;
  let mailRunner: ReturnType<typeof makeJobRunner>;
  let container: ServiceContainer;

  beforeEach(() => {
    jest.clearAllMocks();
    propertyValues.clear();
    docRows = [];
    mailRows = [];
    docRunner = makeJobRunner(docJobName);
    mailRunner = makeJobRunner(mailJobName);
    container = {
      get: jest.fn((key: string) => {
        if (key !== 'db') return {};
        return {
          table: (table: string) => ({
            findAll: () => (table === TABLE.LOG_DOCS ? docRows : mailRows)
          })
        };
      })
    } as unknown as ServiceContainer;
    jest.mocked(creaJobRunner).mockReset();
    jest
      .mocked(creaJobRunner)
      .mockReturnValueOnce(docRunner as never)
      .mockReturnValueOnce(mailRunner as never);

    jest
      .mocked(avviaGenerazioneDataDriven)
      .mockImplementation((_container, configId, runner, budget) => {
        expect(configId).toBe(CONF_DOC_JOBRUNNER);
        expect(runner).toBe(docRunner);
        expect(budget).toBe(50);
        docRows.push({
          [COL_LOG_DOCS.ID]: 'doc-1',
          [COL_LOG_DOCS.ID_GEN]: CONF_DOC_JOBRUNNER,
          [COL_LOG_DOCS.TIPO]: 'PIANO_PERS',
          [COL_LOG_DOCS.SOTTOTIPO]: 'PDP_BES',
          [COL_LOG_DOCS.CLASSI]: '3C-S',
          [COL_LOG_DOCS.UTENTI]: 'student-1@onlinetest.aldo.local',
          [COL_LOG_DOCS.MATERIE]: ''
        });
        propertyValues.set(
          `state_${docJobName}`,
          JSON.stringify({
            confDocId: CONF_DOC_JOBRUNNER,
            jobId: docJobName,
            nextIndex: 1,
            processed: ['student-1@onlinetest.aldo.local:PDP_BES'],
            errori: [],
            planTargets: [
              { studente: 'student-1@onlinetest.aldo.local', tipo: 'PDP_BES' },
              { studente: 'student-2@onlinetest.aldo.local', tipo: 'PEI' }
            ]
          })
        );
        propertyValues.set(`trigger_${docJobName}`, 'trigger-doc');
        propertyValues.set('job_for_trigger_trigger-doc', docJobName);
        docRunner.setStatus({ state: 'to_resume', completed: false, percentage: 50 });
        return null;
      });

    jest
      .mocked(avviaInvioNotificheDataDriven)
      .mockImplementation((_container, patternId, runner, budget, recipient, chunkSize) => {
        expect(patternId).toBe(CONF_MAIL_JOBRUNNER);
        expect(runner).toBe(mailRunner);
        expect(budget).toBe(50);
        expect(recipient).toBe(AUTHENTICATED_OPERATOR);
        expect(chunkSize).toBe(1);
        mailRows.push(mailRow('class:1A'));
        propertyValues.set(
          `state_${mailJobName}`,
          JSON.stringify({
            patternId: CONF_MAIL_JOBRUNNER,
            jobId: mailJobName,
            chunkSize: 1,
            testRecipient: AUTHENTICATED_OPERATOR,
            nextIndex: 1,
            processed: ['1A'],
            sent: 1,
            errors: []
          })
        );
        propertyValues.set(`trigger_${mailJobName}`, 'trigger-mail');
        propertyValues.set('job_for_trigger_trigger-mail', mailJobName);
        mailRunner.setStatus({ state: 'to_resume', completed: false, percentage: (1 / 3) * 100 });
        return null;
      });

    jest.mocked(riprendiJobSospeso).mockImplementation((_container, runner, jobName, budget) => {
      expect(budget).toBe(25 * 60 * 1000);
      if (jobName === docJobName) {
        expect(runner).toBe(docRunner);
        docRows.push({
          [COL_LOG_DOCS.ID]: 'doc-2',
          [COL_LOG_DOCS.ID_GEN]: CONF_DOC_JOBRUNNER,
          [COL_LOG_DOCS.TIPO]: 'PIANO_PERS',
          [COL_LOG_DOCS.SOTTOTIPO]: 'PEI',
          [COL_LOG_DOCS.CLASSI]: '5B',
          [COL_LOG_DOCS.UTENTI]: 'student-2@onlinetest.aldo.local',
          [COL_LOG_DOCS.MATERIE]: ''
        });
        docRunner.setStatus({ state: 'completed', completed: true, percentage: 100 });
      } else {
        expect(jobName).toBe(mailJobName);
        expect(runner).toBe(mailRunner);
        mailRows.push(mailRow('class:2A'));
        mailRows.push(mailRow('class:3A'));
        mailRunner.setStatus({ state: 'completed', completed: true, percentage: 100 });
      }
      return { done: true };
    });
  });

  it('runs doc and safe-email suspend, manual-resume and reset checks without duplicate logical targets', () => {
    const runner = new ImmediateRunner();

    registerJobRunnerChecks(runner as never, container, sample as never, AUTHENTICATED_OPERATOR);

    expect(runner.checks).toHaveLength(6);
    expect(runner.checks.every((check) => check.error === undefined)).toBe(true);
    expect(runner.checks.map((check) => check.name)).toEqual([
      'jobrunner.docGen::sospensione to_resume + trigger',
      'jobrunner.docGen::resume manuale completa senza duplicati',
      'jobrunner.docGen::resetJob pulisce trigger e stato',
      'jobrunner.email::sospensione to_resume + trigger',
      'jobrunner.email::resume manuale completa senza duplicati',
      'jobrunner.email::resetJob pulisce trigger e stato'
    ]);
    expect(docRunner.resetJob).toHaveBeenCalledWith(docJobName);
    expect(mailRunner.resetJob).toHaveBeenCalledWith(mailJobName);
    expect(docRunner.getStatus(docJobName).state).toBe('not_started');
    expect(mailRunner.getStatus(mailJobName).state).toBe('not_started');
  });

  it('records all three doc checks and cancels a still-suspended job when reset itself fails', () => {
    // The first check now resets stale state before starting (registerJobRunnerDocGenChecks) —
    // that call must succeed; only the deliberate reset in the third check should fail.
    docRunner.resetJob
      .mockImplementationOnce(() => undefined)
      .mockImplementation(() => {
        throw new Error('reset unavailable');
      });
    jest.mocked(riprendiJobSospeso).mockImplementation(() => {
      throw new Error('resume unavailable');
    });
    const runner = new ImmediateRunner();

    registerJobRunnerDocGenChecks(runner as never, container, sample as never);

    expect(runner.checks).toHaveLength(3);
    expect(runner.checks[0]?.error).toBeUndefined();
    expect(runner.checks[1]?.error?.message).toContain('resume unavailable');
    expect(runner.checks[2]?.error?.message).toContain('reset unavailable');
    expect(docRunner.cancelJob).toHaveBeenCalledWith(docJobName);
  });

  it('rejects a document resume that logs the suspended logical target twice', () => {
    jest.mocked(riprendiJobSospeso).mockImplementation(() => {
      docRows.push({ ...docRows[0], [COL_LOG_DOCS.ID]: 'doc-duplicate' });
      docRunner.setStatus({ state: 'completed', completed: true, percentage: 100 });
      return { done: true };
    });
    const runner = new ImmediateRunner();

    registerJobRunnerDocGenChecks(runner as never, container, sample as never);

    expect(runner.checks[1]?.error?.message).toContain('duplicati non allineati');
  });

  it('rejects an email resume that logs the suspended logical target twice', () => {
    jest
      .mocked(creaJobRunner)
      .mockReset()
      .mockReturnValue(mailRunner as never);
    jest.mocked(riprendiJobSospeso).mockImplementation(() => {
      mailRows.push(mailRow('class:1A'));
      mailRunner.setStatus({ state: 'completed', completed: true, percentage: 100 });
      return { done: true };
    });
    const runner = new ImmediateRunner();

    registerJobRunnerEmailChecks(
      runner as never,
      container,
      sample as never,
      AUTHENTICATED_OPERATOR
    );

    expect(runner.checks[1]?.error?.message).toContain('duplicati non allineati');
  });

  it('fails cleanup when resetJob leaves trigger mappings or checkpoint state behind', () => {
    docRunner.resetJob.mockImplementation(() => {
      docRunner.setStatus({ state: 'not_started', completed: false, percentage: 0 });
    });
    const runner = new ImmediateRunner();

    registerJobRunnerDocGenChecks(runner as never, container, sample as never);

    expect(runner.checks[2]?.error?.message).toContain(
      'resetJob non ha pulito trigger, checkpoint o stato'
    );
  });

  it('polls the isolated real-trigger check until completion and verifies trigger context cleanup', () => {
    jest
      .mocked(creaJobRunner)
      .mockReset()
      .mockReturnValue(docRunner as never);
    const runner = new ImmediateRunner();
    let now = 0;
    const sleep = jest.fn((milliseconds: number) => {
      now += milliseconds;
      docRows.push({
        [COL_LOG_DOCS.ID]: 'doc-2',
        [COL_LOG_DOCS.ID_GEN]: CONF_DOC_JOBRUNNER,
        [COL_LOG_DOCS.TIPO]: 'PIANO_PERS',
        [COL_LOG_DOCS.SOTTOTIPO]: 'PEI',
        [COL_LOG_DOCS.CLASSI]: '5B',
        [COL_LOG_DOCS.UTENTI]: 'student-2@onlinetest.aldo.local',
        [COL_LOG_DOCS.MATERIE]: ''
      });
      propertyValues.delete(`job_for_trigger_trigger-doc`);
      docRunner.setStatus({ state: 'completed', completed: true, percentage: 100 });
    });

    registerJobRunnerTriggerRealeCheck(runner as never, container, sample as never, {
      sleep,
      now: () => now,
      pollIntervalMs: 10,
      pollTimeoutMs: 30
    });

    expect(runner.checks).toEqual([
      { name: 'jobrunner.triggerReale::resume via contesto trigger' }
    ]);
    expect(sleep).toHaveBeenCalledTimes(1);
    expect(sleep).toHaveBeenCalledWith(10);
    expect(docRunner.cancelJob).not.toHaveBeenCalled();
  });

  it('uses the typed utilities service when the real-trigger poller has no injected sleep seam', () => {
    jest
      .mocked(creaJobRunner)
      .mockReset()
      .mockReturnValue(docRunner as never);
    const runner = new ImmediateRunner();
    let now = 0;
    const sleep = jest.fn((milliseconds: number) => {
      now += milliseconds;
      docRows.push({
        [COL_LOG_DOCS.ID]: 'doc-2',
        [COL_LOG_DOCS.ID_GEN]: CONF_DOC_JOBRUNNER,
        [COL_LOG_DOCS.TIPO]: 'PIANO_PERS',
        [COL_LOG_DOCS.SOTTOTIPO]: 'PEI',
        [COL_LOG_DOCS.CLASSI]: '5B',
        [COL_LOG_DOCS.UTENTI]: 'student-2@onlinetest.aldo.local',
        [COL_LOG_DOCS.MATERIE]: ''
      });
      propertyValues.delete('job_for_trigger_trigger-doc');
      docRunner.setStatus({ state: 'completed', completed: true, percentage: 100 });
    });
    const utilitiesSpy = jest
      .spyOn(ServiceFactory, 'getUtilitiesService')
      .mockReturnValue({ sleep } as never);

    try {
      registerJobRunnerTriggerRealeCheck(runner as never, container, sample as never, {
        now: () => now,
        pollIntervalMs: 10,
        pollTimeoutMs: 30
      });

      expect(runner.checks).toEqual([
        { name: 'jobrunner.triggerReale::resume via contesto trigger' }
      ]);
      expect(utilitiesSpy).toHaveBeenCalledTimes(1);
      expect(sleep).toHaveBeenCalledWith(10);
    } finally {
      utilitiesSpy.mockRestore();
    }
  });

  it('cancels the isolated real-trigger job when polling reaches the timeout', () => {
    jest
      .mocked(creaJobRunner)
      .mockReset()
      .mockReturnValue(docRunner as never);
    const runner = new ImmediateRunner();
    let now = 0;
    docRunner.cancelJob.mockImplementation(() => {
      propertyValues.delete(`state_${docJobName}`);
      propertyValues.delete(`trigger_${docJobName}`);
      propertyValues.delete('job_for_trigger_trigger-doc');
      docRunner.setStatus({ state: 'cancelled', completed: false, percentage: 0 });
    });

    registerJobRunnerTriggerRealeCheck(runner as never, container, sample as never, {
      sleep: (milliseconds) => {
        now += milliseconds;
      },
      now: () => now,
      pollIntervalMs: 10,
      pollTimeoutMs: 20
    });

    expect(runner.checks[0]?.error?.message).toContain('trigger one-time non è scattato');
    expect(docRunner.cancelJob).toHaveBeenCalledTimes(1);
    expect(docRunner.cancelJob).toHaveBeenCalledWith(docJobName);
    expect(propertyValues.get(`state_${docJobName}`)).toBeUndefined();
    expect(propertyValues.get(`trigger_${docJobName}`)).toBeUndefined();
    expect(propertyValues.get('job_for_trigger_trigger-doc')).toBeUndefined();
  });
});

function mailRow(logicalTargetId: string): Record<string, unknown> {
  return {
    [COL_LOG_MAIL.PATTERN]: CONF_MAIL_JOBRUNNER,
    [COL_LOG_MAIL.DESTINATARI]: AUTHENTICATED_OPERATOR,
    [COL_LOG_MAIL.STATO]: 'SUCCESS',
    [COL_LOG_MAIL.ALLEGATI]: JSON.stringify({
      testMode: true,
      logicalTargetId,
      docs: [],
      folders: [],
      attach: []
    })
  };
}
