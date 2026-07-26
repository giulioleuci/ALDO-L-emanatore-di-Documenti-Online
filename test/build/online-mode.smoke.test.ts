import { execSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

describe('online build mode', () => {
  it('produces a distinct, unminified, comment-free Code.js and OnlineTests.js plus a valid gas-source-map.json', () => {
    execSync('node scripts/build-and-prepare.cjs --mode=online', {
      cwd: resolve(__dirname, '../..'),
      stdio: 'pipe'
    });

    const distDir = resolve(__dirname, '../../dist');
    const codeJs = readFileSync(resolve(distDir, 'Code.js'), 'utf8');
    const onlineTestsJs = readFileSync(resolve(distDir, 'OnlineTests.js'), 'utf8');

    expect(codeJs).not.toContain('/**');
    expect(onlineTestsJs).not.toContain('/**');
    expect(codeJs).not.toEqual(onlineTestsJs);
    expect(onlineTestsJs).toContain('__coverage__');
    expect(codeJs).not.toContain('__coverage__');

    const avgLineLen = (s: string) => s.length / (s.split('\n').length || 1);
    expect(avgLineLen(codeJs)).toBeLessThan(200);
    expect(avgLineLen(onlineTestsJs)).toBeLessThan(200);

    const mapPath = resolve(distDir, 'gas-source-map.json');
    expect(existsSync(mapPath)).toBe(true);
    const map = JSON.parse(readFileSync(mapPath, 'utf8')) as unknown[];
    expect(map.length).toBeGreaterThan(0);

    const claspignore = readFileSync(resolve(distDir, '.claspignore'), 'utf8');
    expect(claspignore).toContain('gas-source-map.json');
  }, 120_000);
});
