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

/** Accumulates online-test results, catching every check's own error so one failure never aborts the run. */
export class TestRunner {
  private readonly startedAt = new Date().toISOString();
  private readonly results: OnlineTestResult[] = [];

  add(name: string, artifactUrl: string | undefined, fn: () => void): void {
    try {
      fn();
      this.results.push(artifactUrl !== undefined ? { name, status: 'pass', artifactUrl } : { name, status: 'pass' });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      this.results.push(artifactUrl !== undefined ? { name, status: 'fail', message, artifactUrl } : { name, status: 'fail', message });
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
