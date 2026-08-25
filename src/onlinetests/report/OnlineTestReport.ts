interface OnlineTestResult {
  name: string;
  status: 'pass' | 'fail' | 'skipped';
  message?: string;
  artifactUrl?: string;
}

export interface OnlineTestReport {
  suite: 'aldo-online-tests';
  startedAt: string;
  finishedAt: string;
  passed: number;
  failed: number;
  skipped: number;
  results: OnlineTestResult[];
}

/** A check may be non-applicable only after examining real runtime evidence. */
export interface OnlineTestSkippedOutcome {
  status: 'skipped';
  message: string;
}

export function skippedOutcome(message: string): OnlineTestSkippedOutcome {
  return { status: 'skipped', message };
}

/** Convenzione: ogni check registra nome come "<gruppo>::<descrizione>" per il report aggregato. */
export function groupName(group: string, description: string): string {
  return `${group}::${description}`;
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

  add(
    name: string,
    artifactUrl: string | undefined,
    fn: () => void | OnlineTestSkippedOutcome
  ): void {
    const runner = new EnhancedTestRunner();
    let skipped: OnlineTestSkippedOutcome | undefined;
    runner.register(name, () => {
      const result = fn();
      if (result?.status === 'skipped') skipped = result;
    });
    const { failed, errors } = runner.run();
    if (skipped !== undefined) {
      this.skip(name, artifactUrl, skipped.message);
      return;
    }
    if (failed > 0) {
      const message = errors[0]?.message ?? 'Unknown error';
      this.results.push(
        artifactUrl !== undefined
          ? { name, status: 'fail', message, artifactUrl }
          : { name, status: 'fail', message }
      );
    } else {
      this.results.push(
        artifactUrl !== undefined ? { name, status: 'pass', artifactUrl } : { name, status: 'pass' }
      );
    }
  }

  /** Records a non-applicable online check without treating absent Workspace evidence as pass. */
  skip(name: string, artifactUrl: string | undefined, reason: string): void {
    this.results.push(
      artifactUrl !== undefined
        ? { name, status: 'skipped', message: reason, artifactUrl }
        : { name, status: 'skipped', message: reason }
    );
  }

  report(): OnlineTestReport {
    const passed = this.results.filter((r) => r.status === 'pass').length;
    const skipped = this.results.filter((r) => r.status === 'skipped').length;
    return {
      suite: 'aldo-online-tests',
      startedAt: this.startedAt,
      finishedAt: new Date().toISOString(),
      passed,
      failed: this.results.length - passed - skipped,
      skipped,
      results: this.results
    };
  }
}
