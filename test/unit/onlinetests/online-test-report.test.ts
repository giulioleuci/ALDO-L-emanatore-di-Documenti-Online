import {
  skippedOutcome,
  TestRunner,
  groupName
} from '../../../src/onlinetests/report/OnlineTestReport';

describe('groupName', () => {
  it('prefixes a check description with its group', () => {
    expect(groupName('documenti.standard', 'template interop')).toBe(
      'documenti.standard::template interop'
    );
  });
});

describe('TestRunner', () => {
  it('records a pass result when fn does not throw', () => {
    const runner = new TestRunner();
    runner.add('check-1', undefined, () => {});
    const report = runner.report();
    expect(report.suite).toBe('aldo-online-tests');
    expect(report.passed).toBe(1);
    expect(report.failed).toBe(0);
    expect(report.results).toEqual([{ name: 'check-1', status: 'pass' }]);
  });

  it('records a fail result with the caught error message and artifactUrl when fn throws', () => {
    const runner = new TestRunner();
    runner.add('check-2', 'https://drive.google.com/x', () => {
      throw new Error('boom');
    });
    const report = runner.report();
    expect(report.passed).toBe(0);
    expect(report.failed).toBe(1);
    expect(report.results).toEqual([
      {
        name: 'check-2',
        status: 'fail',
        message: 'boom',
        artifactUrl: 'https://drive.google.com/x'
      }
    ]);
  });

  it('records a documented skipped result without counting it as passed or failed', () => {
    const runner = new TestRunner();
    runner.skip('check-skipped', 'https://drive.google.com/x', 'SKIPPED: policy Workspace');

    expect(runner.report()).toMatchObject({
      passed: 0,
      failed: 0,
      skipped: 1,
      results: [
        {
          name: 'check-skipped',
          status: 'skipped',
          message: 'SKIPPED: policy Workspace',
          artifactUrl: 'https://drive.google.com/x'
        }
      ]
    });
  });

  it('records a policy skip returned after real callback work', () => {
    const runner = new TestRunner();
    runner.add('check-policy', undefined, () => skippedOutcome('SKIPPED: group-only ACL'));

    expect(runner.report()).toMatchObject({
      passed: 0,
      failed: 0,
      skipped: 1,
      results: [expect.objectContaining({ status: 'skipped', message: 'SKIPPED: group-only ACL' })]
    });
  });

  it('never throws out of add() even when fn throws a non-Error value', () => {
    const runner = new TestRunner();
    runner.add('check-3', undefined, () => {
      // eslint-disable-next-line @typescript-eslint/only-throw-error -- deliberately exercises the non-Error catch branch
      throw 'stringa';
    });
    expect(runner.report().results[0]).toEqual({
      name: 'check-3',
      status: 'fail',
      message: 'stringa'
    });
  });

  it('sets startedAt at construction and finishedAt at report() time as ISO strings', () => {
    const runner = new TestRunner();
    const report = runner.report();
    const isoPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
    expect(report.startedAt).toMatch(isoPattern);
    expect(report.finishedAt).toMatch(isoPattern);
    expect(new Date(report.finishedAt).getTime()).toBeGreaterThanOrEqual(
      new Date(report.startedAt).getTime()
    );
  });
});
