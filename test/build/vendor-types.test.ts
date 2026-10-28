import { execFileSync } from 'node:child_process';
import {
  mkdtempSync,
  mkdirSync,
  copyFileSync,
  writeFileSync,
  readFileSync,
  rmSync,
  existsSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';

describe('TypeScript GLF vendor', () => {
  it('includes the generated declaration entry points used by ALDO', () => {
    const config = JSON.parse(
      readFileSync(resolve(__dirname, '../../vendor/tsconfig.json'), 'utf8')
    ) as { compilerOptions: { paths: Record<string, string[]> } };

    for (const targets of Object.values(config.compilerOptions.paths)) {
      for (const target of targets.filter((name) => !name.includes('*'))) {
        expect(existsSync(resolve(__dirname, '../../vendor', target))).toBe(true);
      }
    }
    expect(config.compilerOptions.paths['@CoreUtilsLib']).toEqual([
      './types/CoreUtilsLib/index.d.ts'
    ]);
  });

  it('rejects a JavaScript-only GLF instead of restoring the old runtime', () => {
    const root = mkdtempSync(join(tmpdir(), 'aldo-vendor-'));
    try {
      mkdirSync(join(root, 'scripts'));
      mkdirSync(join(root, 'GasLibraryFactory/src'), { recursive: true });
      copyFileSync(
        resolve(__dirname, '../../scripts/refresh-vendor.cjs'),
        join(root, 'scripts/refresh-vendor.cjs')
      );
      writeFileSync(join(root, 'GasLibraryFactory/src/index.js'), '');

      expect(() =>
        execFileSync('node', [join(root, 'scripts/refresh-vendor.cjs')], {
          cwd: root,
          encoding: 'utf8'
        })
      ).toThrow('TypeScript GasLibraryFactory required');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
