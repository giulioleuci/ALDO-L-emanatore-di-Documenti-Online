import { execSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

describe('online build mode', () => {
  it('produces Code.js, OnlineTests.js, and a readable online-test launcher plus a valid gas-source-map.json', () => {
    execSync('node scripts/build-and-prepare.cjs --mode=online', {
      cwd: resolve(__dirname, '../..'),
      stdio: 'pipe'
    });

    const distDir = resolve(__dirname, '../../dist');
    const codeJs = readFileSync(resolve(distDir, 'Code.js'), 'utf8');
    const onlineTestsJs = readFileSync(resolve(distDir, 'OnlineTests.js'), 'utf8');
    const onlineEntrypointsGs = resolve(distDir, 'EntryPointOnlineTests.gs');
    const onlineEntrypointsJs = resolve(distDir, 'EntryPointOnlineTests.js');

    expect(codeJs).not.toContain('/**');
    expect(onlineTestsJs).not.toContain('/**');
    expect(codeJs).not.toEqual(onlineTestsJs);
    expect(onlineTestsJs).toContain('__coverage__');
    expect(codeJs).not.toContain('__coverage__');
    expect(onlineTestsJs).toContain('function runArticolazioneScenarios()');
    expect(onlineTestsJs).toContain('gasGlobal.runArticolazioneScenarios = runArticolazioneScenarios');
    expect(onlineTestsJs).toMatch(/new ScriptPropertiesFacade\b/);
    expect(onlineTestsJs).not.toContain('onlinetests_ScriptPropertiesFacade');
    expect(existsSync(onlineEntrypointsGs)).toBe(true);
    expect(existsSync(onlineEntrypointsJs)).toBe(false);
    expect(readFileSync(onlineEntrypointsGs, 'utf8')).toContain('function runFullOnlineTests()');

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
