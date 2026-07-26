import { execFileSync } from 'child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';

describe('scripts/report-online-coverage.cjs', () => {
  it('prints an istanbul text-summary computed from a raw coverage JSON dump', () => {
    const dir = mkdtempSync(join(tmpdir(), 'online-coverage-'));
    const rawCoveragePath = join(dir, 'raw-coverage.json');
    const raw = {
      '/repo/src/foo.ts': {
        path: '/repo/src/foo.ts',
        statementMap: {
          '0': { start: { line: 1, column: 0 }, end: { line: 1, column: 10 } },
          '1': { start: { line: 2, column: 0 }, end: { line: 2, column: 10 } }
        },
        fnMap: {},
        branchMap: {},
        s: { '0': 1, '1': 0 },
        f: {},
        b: {}
      }
    };
    writeFileSync(rawCoveragePath, JSON.stringify(raw), 'utf8');

    const output = execFileSync(
      'node',
      [resolve(__dirname, '../../scripts/report-online-coverage.cjs'), rawCoveragePath],
      { cwd: resolve(__dirname, '../..'), encoding: 'utf8' }
    );

    expect(output).toContain('Statements');
    expect(output).toContain('50%');

    rmSync(dir, { recursive: true, force: true });
  });

  it('exits non-zero with a usage message when no path argument is given', () => {
    expect(() =>
      execFileSync('node', [resolve(__dirname, '../../scripts/report-online-coverage.cjs')], {
        cwd: resolve(__dirname, '../..'),
        encoding: 'utf8'
      })
    ).toThrow();
  });
});
