#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(msg) {
  console.log(msg);
}

function heading(text) {
  log(`\n${'='.repeat(80)}`);
  log(`${c.bold}${c.cyan}${text}${c.reset}`);
  log(`${'='.repeat(80)}`);
}

function step(n, total, text) {
  log(`\n${c.yellow}[${n}/${total}] ${text}${c.reset}`);
}

function ok(msg) {
  log(`  ${c.green}✓${c.reset} ${msg}`);
}

function warn(msg) {
  log(`  ${c.yellow}⚠${c.reset} ${msg}`);
}

function fail(msg) {
  log(`  ${c.red}✗${c.reset} ${msg}`);
}

function info(msg) {
  log(`  ${c.blue}ℹ${c.reset} ${msg}`);
}

const args = process.argv.slice(2);

function getArg(name) {
  const arg = args.find((a) => a.startsWith(`--${name}=`));
  return arg ? arg.split('=').slice(1).join('=') : undefined;
}

const mode = getArg('mode') || 'testing';

if (!['production', 'testing', 'testoffline'].includes(mode)) {
  console.error(
    `${c.red}Error: Invalid mode "${mode}". Use --mode=production, --mode=testing, or --mode=testoffline${c.reset}`
  );
  process.exit(1);
}

const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist');
const codeJsPath = path.join(distDir, 'Code.js');
const appsscriptSrc = path.join(rootDir, 'appsscript.json');
const appsscriptDest = path.join(distDir, 'appsscript.json');

const vendorBundle = path.join(rootDir, 'vendor', 'gaslibs.Code.js');
const aldoBundle = path.join(distDir, 'aldo.js');

const webpackCmd = mode === 'production' ? 'npx webpack' : 'npx webpack --env readable';

// Steps: Clean, Vendor verify, Webpack, Prelude concat, Copy appsscript.json,
// V8 patch, Configure deployment files, Source map index, [offline tests], Summary
const TOTAL_STEPS = mode === 'testoffline' ? 10 : 9;

heading('ALDO (SGSA) - Build and Prepare');
info(`Mode:         ${c.bold}${mode.toUpperCase()}${c.reset}`);
if (mode === 'testoffline') {
  info(`Code.js:      Readable (not minified), no comments`);
  info(`Offline tests: Will run after build (unit + integration)`);
} else {
  info(
    `Code.js:      ${mode === 'production' ? 'Minified (Terser), no comments' : 'Readable (not minified), no comments'}`
  );
}

step(1, TOTAL_STEPS, 'Cleaning dist directory...');

if (fs.existsSync(distDir)) {
  fs.rmSync(distDir, { recursive: true, force: true });
  ok('Cleaned dist/');
} else {
  ok('dist/ does not exist yet (will be created by Webpack)');
}

step(2, TOTAL_STEPS, 'Verifying vendored library bundle...');

try {
  execSync('node scripts/verify-vendor.cjs', { cwd: rootDir, stdio: 'inherit' });
  ok('Vendor checksum verified');
} catch (_) {
  fail('Vendor checksum verification failed');
  process.exit(1);
}

step(3, TOTAL_STEPS, `Running Webpack build (${webpackCmd})...`);

try {
  execSync(webpackCmd, { stdio: 'inherit', cwd: rootDir });
  ok('Webpack build completed');
} catch (_) {
  fail('Webpack build failed');
  process.exit(1);
}

if (!fs.existsSync(aldoBundle)) {
  fail('dist/aldo.js was not produced by Webpack');
  process.exit(1);
}

step(4, TOTAL_STEPS, 'Concatenating vendor prelude + ALDO bundle into Code.js...');

{
  const prelude = fs.readFileSync(vendorBundle, 'utf8');
  const aldo = fs.readFileSync(aldoBundle, 'utf8');
  fs.writeFileSync(codeJsPath, prelude + '\n;\n' + aldo, 'utf8');
  fs.rmSync(aldoBundle, { force: true });
  fs.rmSync(aldoBundle + '.map', { force: true });
  ok('Wrote dist/Code.js (vendor prelude + ALDO bundle)');
}

if (!fs.existsSync(codeJsPath)) {
  fail('dist/Code.js was not produced');
  process.exit(1);
}

step(5, TOTAL_STEPS, 'Copying appsscript.json...');

if (fs.existsSync(appsscriptSrc)) {
  fs.copyFileSync(appsscriptSrc, appsscriptDest);

  try {
    const manifest = JSON.parse(fs.readFileSync(appsscriptDest, 'utf8'));
    if (manifest.runtimeVersion === 'V8') {
      ok('Copied appsscript.json (runtimeVersion: V8)');
    } else {
      warn(
        `appsscript.json runtimeVersion is "${manifest.runtimeVersion || 'UNSET'}" — expected "V8"`
      );
    }
  } catch (e) {
    warn(`Could not parse appsscript.json for validation: ${e.message}`);
  }
} else {
  fail('appsscript.json not found at project root');
  process.exit(1);
}

step(6, TOTAL_STEPS, 'GAS V8 compatibility post-processing...');

let code = fs.readFileSync(codeJsPath, 'utf8');
let patchCount = 0;
let warningCount = 0;

{
  const regex = /Object\.hasOwn\(/g;
  const matches = code.match(regex);
  if (matches) {
    code = code.replace(regex, 'Object.prototype.hasOwnProperty.call(');
    patchCount += matches.length;
    ok(`Replaced ${matches.length} instance(s) of Object.hasOwn() → Object.prototype.hasOwnProperty.call()`);
  } else {
    ok('No Object.hasOwn() found (already compatible)');
  }
}

{
  const regex = /\.replaceAll\(("[^"]*"|'[^']*'),\s*/g;
  const matches = code.match(regex);
  if (matches) {
    code = code.replace(
      /\.replaceAll\(("[^"]*"|'[^']*'),\s*("[^"]*"|'[^']*'|[^)]+)\)/g,
      '.split($1).join($2)'
    );
    patchCount += matches.length;
    ok(`Replaced ${matches.length} instance(s) of .replaceAll() → .split().join()`);
  } else {
    ok('No .replaceAll() with string literal found (already compatible)');
  }
}

{
  const target =
    '/\\p{Lu}?\\p{Ll}+|[0-9]+|\\p{Lu}+(?!\\p{Ll})|\\p{Emoji_Presentation}|\\p{Extended_Pictographic}|\\p{L}+/gu';
  if (code.includes(target)) {
    const replacement =
      "(function(){try{return new RegExp('\\\\p{Lu}?\\\\p{Ll}+|[0-9]+|\\\\p{Lu}+(?!\\\\p{Ll})|\\\\p{L}+','gu')}catch(e){return /[A-Z]?[a-z]+|[0-9]+|[A-Z]+(?![a-z])/g}})()";
    code = code.replace(target, replacement);
    patchCount++;
    ok('Replaced es-toolkit CASE_SPLIT_PATTERN regex with GAS-safe fallback');
  } else {
    ok('No es-toolkit CASE_SPLIT_PATTERN regex found (already compatible)');
  }
}

{
  const target = '"^(\\\\p{Extended_Pictographic}|\\\\p{Emoji_Component})+$"';
  if (code.includes(target)) {
    const replacement =
      '"^[\\\\u{1F600}-\\\\u{1F64F}\\\\u{1F300}-\\\\u{1F5FF}\\\\u{1F680}-\\\\u{1F6FF}\\\\u{1F900}-\\\\u{1F9FF}\\\\u{1FA00}-\\\\u{1FA6F}\\\\u{1FA70}-\\\\u{1FAFF}\\\\u{2600}-\\\\u{26FF}\\\\u{2700}-\\\\u{27BF}\\\\u{FE00}-\\\\u{FE0F}\\\\u{200D}\\\\u{20E3}\\\\u{E0020}-\\\\u{E007F}]+$"';
    code = code.replace(target, replacement);
    patchCount++;
    ok('Replaced Zod emoji regex with GAS-safe Unicode range fallback');
  } else {
    ok('No Zod emoji regex found (already compatible)');
  }
}

{
  const urlUsages = (code.match(/new URL\(/g) || []).length;
  if (urlUsages > 0) {
    const shim = [
      'if(typeof URL==="undefined"){',
      'var URL=function(u){',
      'if(typeof u!=="string")throw new TypeError("Invalid URL");',
      'var m=u.match(/^(([a-zA-Z][a-zA-Z0-9+.-]*):)?\\/\\/([^/?#]*)([^?#]*)(\\?[^#]*)?(#.*)?$/);',
      'if(!m)throw new TypeError("Invalid URL");',
      'this.protocol=(m[2]||"")+":";',
      'this.hostname=m[3]||"";',
      'this.host=this.hostname;',
      'this.pathname=m[4]||"/";',
      'this.search=m[5]||"";',
      'this.hash=m[6]||"";',
      'this.href=u;',
      'this.origin=this.protocol+"//"+this.hostname;',
      '};',
      '}'
    ].join('');

    code = shim + ';' + code;
    patchCount++;
    ok(`Injected URL constructor shim (${urlUsages} usage(s) of new URL() found)`);
  } else {
    ok('No new URL() found (no shim needed)');
  }
}

const scanPatterns = [
  {
    label: 'crypto.getRandomValues()',
    regex: /crypto\.getRandomValues\s*\(/g,
    reason: 'Not available in GAS. Use nanoid/non-secure or Utilities.getUuid().'
  },
  {
    label: 'structuredClone()',
    regex: /\bstructuredClone\s*\(/g,
    reason: 'ES2022 (Chrome 98+). Use cloneDeep() from es-toolkit or JSON parse/stringify.'
  },
  {
    label: 'Array.prototype.at()',
    regex: /\.at\s*\(\s*-?\d+\s*\)/g,
    reason: 'ES2022 (Chrome 92+). Use bracket notation or arr[arr.length - 1].'
  },
  {
    label: 'Array.prototype.findLast()',
    regex: /\.findLast\s*\(/g,
    reason: 'ES2023 (Chrome 97+). Use .slice().reverse().find() or a manual loop.'
  },
  {
    label: 'Array.prototype.findLastIndex()',
    regex: /\.findLastIndex\s*\(/g,
    reason: 'ES2023 (Chrome 97+). Use a manual loop from the end.'
  },
  {
    label: 'Promise.any()',
    regex: /Promise\.any\s*\(/g,
    reason: 'ES2021 (Chrome 85+). Not useful in GAS synchronous runtime anyway.'
  },
  {
    label: 'Logical assignment operators (??=, ||=, &&=)',
    regex: /(?:&&=|\|\|=|\?\?=)/g,
    reason: 'ES2021 (Chrome 85+). Use explicit assignment instead.'
  }
];

for (const { label, regex, reason } of scanPatterns) {
  const matches = code.match(regex);
  if (matches) {
    warn(`Found ${matches.length} instance(s) of ${c.bold}${label}${c.reset}`);
    info(`  Reason: ${reason}`);
    warningCount += matches.length;
  }
}

const GAS_FILE_SIZE_LIMIT = 6 * 1024 * 1024;
const GAS_FILE_SIZE_WARNING = 4 * 1024 * 1024;
const patchedSize = Buffer.byteLength(code, 'utf8');
const sizeKB = (patchedSize / 1024).toFixed(1);

if (patchedSize > GAS_FILE_SIZE_LIMIT) {
  fail(`Code.js is ${sizeKB} KB — exceeds GAS 6 MB per-file limit!`);
  warningCount++;
} else if (patchedSize > GAS_FILE_SIZE_WARNING) {
  warn(`Code.js is ${sizeKB} KB — approaching GAS 6 MB per-file limit`);
  warningCount++;
} else {
  ok(`Code.js size: ${sizeKB} KB (within GAS limits)`);
}

if (patchCount > 0) {
  fs.writeFileSync(codeJsPath, code, 'utf8');
  ok(`Wrote patched Code.js (${patchCount} fix(es) applied)`);
} else {
  ok('No patches needed — Code.js unchanged');
}

if (warningCount > 0) {
  warn(
    `${warningCount} compatibility warning(s) detected — review above for details`
  );
}

step(7, TOTAL_STEPS, 'Configuring deployment files...');

{
  const claspignore = `*.map
*.map.json
source-map-index.json
test-file-map.json
*.log
*.tmp
**/__tests__/**
`;

  fs.writeFileSync(path.join(distDir, '.claspignore'), claspignore);
  ok('Created .claspignore (excludes tests and map files)');
}

step(8, TOTAL_STEPS, 'Generating source map index...');

{
  const sourceMapPath = path.join(distDir, 'Code.js.map');
  const testMapPath = path.join(distDir, 'test-file-map.json');
  const indexPath = path.join(distDir, 'source-map-index.json');

  const index = {
    version: 1,
    buildMode: mode,
    timestamp: new Date().toISOString(),
    patchesApplied: patchCount,
    warningCount: warningCount,
    note: patchCount > 0
      ? 'Code.js.map is generated by Webpack before V8 compatibility patches. Line numbers near patched areas (Object.hasOwn, replaceAll, URL shim, etc.) may have slight offsets. Additionally, Code.js is the vendor prelude concatenated with the ALDO bundle, so Code.js.map (if present) only maps the ALDO portion.'
      : 'Code.js.map accurately maps to the final Code.js (no V8 patches were needed). Note that Code.js is the vendor prelude concatenated with the ALDO bundle, so any source map only maps the ALDO portion.',
    codeJs: {
      file: 'Code.js',
      sourceMapFile: null,
      sizeBytes: Buffer.byteLength(code, 'utf8'),
      sourceFiles: []
    },
    testFiles: {}
  };

  // Extract source file listing from Code.js.map (non-fatal if missing — the
  // prelude-concat step deletes aldo.js.map and never produces a Code.js.map)
  if (fs.existsSync(sourceMapPath)) {
    try {
      const sourceMap = JSON.parse(fs.readFileSync(sourceMapPath, 'utf8'));
      index.codeJs.sourceMapFile = 'Code.js.map';
      if (sourceMap.sources && Array.isArray(sourceMap.sources)) {
        index.codeJs.sourceFiles = sourceMap.sources
          .map((s) => s.replace(/^webpack:\/\/aldo-sgsa\//, '').replace(/^\.\//, ''))
          .filter((s) => !s.startsWith('node_modules/') && s !== 'webpack/bootstrap' && !s.startsWith('webpack/'))
          .sort();
      }
      ok(`Parsed Code.js.map: ${index.codeJs.sourceFiles.length} source file(s) indexed`);
    } catch (e) {
      warn(`Could not parse Code.js.map: ${e.message}`);
    }
  } else {
    warn('Code.js.map not found — source map was not generated (expected: prelude concat removes aldo.js.map)');
  }

  // Load test file mappings, if any
  if (fs.existsSync(testMapPath)) {
    try {
      index.testFiles = JSON.parse(fs.readFileSync(testMapPath, 'utf8'));
      ok(`Loaded test file mappings: ${Object.keys(index.testFiles).length} test file(s)`);
    } catch (e) {
      warn(`Could not parse test-file-map.json: ${e.message}`);
    }
  } else {
    ok('No test-file-map.json (no test files copied)');
  }

  fs.writeFileSync(indexPath, JSON.stringify(index, null, 2));
  ok(`Generated source-map-index.json`);
}

let offlineTestsPassed = false;

if (mode === 'testoffline') {
  step(9, TOTAL_STEPS, 'Running offline tests (unit + integration)...');

  let unitPassed = false;
  let integrationPassed = false;

  info('Running unit tests...');
  try {
    execSync('npx jest --config jest.config.cjs', { stdio: 'inherit', cwd: rootDir });
    unitPassed = true;
    ok('Unit tests passed');
  } catch (_) {
    fail('Unit tests failed (see above for details)');
  }

  info('Running integration tests...');
  try {
    execSync('npx jest --config jest.integration.config.cjs', { stdio: 'inherit', cwd: rootDir });
    integrationPassed = true;
    ok('Integration tests passed');
  } catch (_) {
    fail('Integration tests failed (see above for details)');
  }

  offlineTestsPassed = unitPassed && integrationPassed;
  if (offlineTestsPassed) {
    ok('All offline tests passed');
  } else {
    fail('Some offline tests failed');
  }
}

const summaryStep = TOTAL_STEPS;
step(summaryStep, TOTAL_STEPS, 'Build summary');

const finalFiles = fs
  .readdirSync(distDir)
  .filter((f) => fs.statSync(path.join(distDir, f)).isFile());

if (mode === 'testoffline') {
  heading(offlineTestsPassed ? 'Build & Test Complete — All Tests Passed' : 'Build Complete — Tests Failed');
} else {
  heading('Build Complete — Ready for Deployment');
}

info(`Mode:             ${c.bold}${mode.toUpperCase()}${c.reset}`);
info(`Output directory: dist/`);
info(`GAS patches:      ${patchCount > 0 ? `${patchCount} applied` : 'none needed'}`);
info(`Source maps:      Code.js.map (if present) + source-map-index.json (excluded from CLASP push)`);
if (warningCount > 0) {
  info(`Warnings:         ${c.yellow}${warningCount}${c.reset}`);
}
if (mode === 'testoffline') {
  info(
    `Offline tests:    ${offlineTestsPassed ? `${c.green}PASSED${c.reset}` : `${c.red}FAILED${c.reset}`}`
  );
}

log('');
info(`Files in dist/ (${finalFiles.length}):`);

let totalSizeBytes = 0;
finalFiles.forEach((file) => {
  const size = fs.statSync(path.join(distDir, file)).size;
  totalSizeBytes += size;
  const kb = (size / 1024).toFixed(2);
  log(`    ${file} ${c.dim}(${kb} KB)${c.reset}`);
});

const totalKB = (totalSizeBytes / 1024).toFixed(2);
log(`    ${c.dim}─────────────────────────────${c.reset}`);
log(`    ${c.bold}Total: ${totalKB} KB${c.reset}`);

log('');
if (mode === 'testoffline') {
  if (offlineTestsPassed) {
    info(`${c.green}The compiled bundle passed all offline validation tests.${c.reset}`);
    info(`Next step: ${c.bold}clasp push${c.reset} (or run --mode=production for deployment)`);
  } else {
    info(`${c.red}Some offline tests failed. Review the output above.${c.reset}`);
  }
} else {
  info(`Next step: ${c.bold}clasp push${c.reset}`);
}
log(`${'='.repeat(80)}\n`);

if (mode === 'testoffline' && !offlineTestsPassed) {
  process.exit(1);
}
