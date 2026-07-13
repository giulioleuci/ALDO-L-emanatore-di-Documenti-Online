export interface OnlineTestResult {
  name: string;
  status: 'pass' | 'fail';
  message?: string;
  artifactUrl?: string;
}

export interface OnlineTestReport {
  suite: 'aldo-online-tests';
  startedAt: string;
  finishedAt: string;
  passed: number;
  failed: number;
  results: OnlineTestResult[];
}

/**
 * Accumulates online-test results into ALDO's own {@link OnlineTestReport} shape (design spec §2:
 * one result per check, each optionally carrying an `artifactUrl` pointer into the sample DB/Drive
 * artifact it exercised). A thin adapter over `GasOnlineTestFramework.EnhancedTestRunner` (ref
 * ALDO_GLF_AUDIT_RESULTS.md K-2) for the actual pass/fail/error-capturing mechanics — a fresh
 * `EnhancedTestRunner` per `add()` call registers and immediately runs exactly that one check, so
 * this class no longer hand-rolls its own try/catch bookkeeping. `EnhancedTestRunner.run()`
 * doesn't have `artifactUrl` or an accumulate-many-calls report contract, so this adapter still
 * owns those two SGSA-specific concerns; everything else (running the check, catching its error,
 * counting pass/fail) is delegated.
 */
export class TestRunner {
  private readonly startedAt = new Date().toISOString();
  private readonly results: OnlineTestResult[] = [];

  add(name: string, artifactUrl: string | undefined, fn: () => void): void {
    const runner = new EnhancedTestRunner();
    runner.register(name, fn);
    const { failed, errors } = runner.run();
    if (failed > 0) {
      const message = errors[0]?.message ?? 'Unknown error';
      this.results.push(artifactUrl !== undefined ? { name, status: 'fail', message, artifactUrl } : { name, status: 'fail', message });
    } else {
      this.results.push(artifactUrl !== undefined ? { name, status: 'pass', artifactUrl } : { name, status: 'pass' });
    }
  }

  report(): OnlineTestReport {
    const passed = this.results.filter((r) => r.status === 'pass').length;
    return {
      suite: 'aldo-online-tests',
      startedAt: this.startedAt,
      finishedAt: new Date().toISOString(),
      passed,
      failed: this.results.length - passed,
      results: this.results
    };
  }
}
