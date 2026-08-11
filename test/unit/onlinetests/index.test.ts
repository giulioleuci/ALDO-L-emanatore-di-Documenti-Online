import { dumpOnlineCoverage, runFullOnlineTests } from '../../../src/onlinetests';

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

describe('dumpOnlineCoverage', () => {
  afterEach(() => {
    delete (globalThis as { __coverage__?: unknown }).__coverage__;
  });

  it('logs the Istanbul coverage map when instrumentation populated it', () => {
    const info = jest.fn();
    const loggerSpy = jest
      .spyOn(ServiceFactory, 'getLogger')
      .mockReturnValue({ info } as never);
    (globalThis as { __coverage__?: unknown }).__coverage__ = { 'src/foo.ts': { s: { '0': 1 } } };

    dumpOnlineCoverage();

    expect(info).toHaveBeenCalledWith(JSON.stringify({ 'src/foo.ts': { s: { '0': 1 } } }));
    loggerSpy.mockRestore();
  });

  it('logs an empty object when the bundle was not instrumented', () => {
    const info = jest.fn();
    const loggerSpy = jest
      .spyOn(ServiceFactory, 'getLogger')
      .mockReturnValue({ info } as never);

    dumpOnlineCoverage();

    expect(info).toHaveBeenCalledWith('{}');
    loggerSpy.mockRestore();
  });
});
