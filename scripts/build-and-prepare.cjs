#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { minify_sync } = require('terser');

// The script body below is otherwise fully synchronous top-to-bottom; it is
// wrapped in an async function solely so the online-mode gas-source-map.json
// step (which awaits SourceMapConsumer.with(...)) can use `await` in place.
// Every other step's behavior/order is unchanged.
async function main() {
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

  if (!['production', 'testing', 'testoffline', 'online'].includes(mode)) {
    console.error(
      `${c.red}Error: Invalid mode "${mode}". Use --mode=production, --mode=testing, --mode=testoffline, or --mode=online${c.reset}`
    );
    process.exit(1);
  }

  const rootDir = path.resolve(__dirname, '..');
  const distDir = path.join(rootDir, 'dist');
  const codeJsPath = path.join(distDir, 'Code.js');
  const appsscriptSrc = path.join(rootDir, 'appsscript.json');
  const appsscriptDest = path.join(distDir, 'appsscript.json');

  const vendorBundle = path.join(rootDir, 'vendor', 'gaslibs.Code.js');
  const aldoCoreBundle = path.join(distDir, 'aldo-core.js');
  const entryPointsBundle = path.join(distDir, 'EntryPoints.js');
  const productionEntryPoints = [
    {
      js: path.join(distDir, 'EntryPoints_Base.js'),
      gs: path.join(distDir, 'EntryPoints_Base.gs')
    },
    {
      js: path.join(distDir, 'EntryPoints_Menu.js'),
      gs: path.join(distDir, 'EntryPoints_Menu.gs')
    },
    { js: path.join(distDir, 'EntryPoints_User.js'), gs: path.join(distDir, 'EntryPoints_User.gs') }
  ];

  const webpackCmd =
    mode === 'production'
      ? 'npx webpack --env production'
      : mode === 'online'
        ? 'npx webpack --env readable --env online'
        : 'npx webpack --env readable';

  // Steps: Clean, Vendor verify, Webpack, Compose Code.js/EntryPoints.js,
  // Copy appsscript.json, V8 patch, Configure deployment files,
  // [production verify | testoffline/online offline tests],
  // [online: gas-source-map.json generation], Summary
  const TOTAL_STEPS = mode === 'testing' ? 8 : mode === 'online' ? 10 : 9;

  heading('ALDO (SGSA) - Build and Prepare');
  info(`Mode:         ${c.bold}${mode.toUpperCase()}${c.reset}`);
  if (mode === 'online') {
    info(
      `Code.js:      Vendor + ALDO core + ALDO entry points, merged, unminified structure, comments stripped`
    );
    info(
      `OnlineTests.js: ALDO online GAS test suite, separate file, unminified structure, comments stripped`
    );
    info(`EntryPointOnlineTests.gs: readable GAS launchers, kept separate from OnlineTests.js`);
    info(`gas-source-map.json: Line-level map from all online output files back to original src/**/*.ts`);
    info(`Offline tests: Will run after build (unit + integration), as a pre-push sanity gate`);
  } else if (mode === 'testoffline') {
    info(`Code.js:      Vendor + ALDO core + ALDO entry points, merged, readable`);
    info(`Offline tests: Will run after build (unit + integration)`);
  } else if (mode === 'production') {
    info(`Code.js:      Vendor + ALDO core — minified (Terser), no comments`);
    info(`EntryPoints_Base/Menu/User.gs: readable ALDO entry points, with comments`);
  } else {
    info(`Code.js:      Vendor + ALDO core + ALDO entry points, merged, readable`);
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

  if (!fs.existsSync(aldoCoreBundle)) {
    fail('dist/aldo-core.js was not produced by Webpack');
    process.exit(1);
  }
  if (mode === 'production') {
    for (const { js } of productionEntryPoints) {
      if (!fs.existsSync(js)) {
        fail(`dist/${path.basename(js)} was not produced by Webpack`);
        process.exit(1);
      }
    }
  } else if (!fs.existsSync(entryPointsBundle)) {
    fail('dist/EntryPoints.js was not produced by Webpack');
    process.exit(1);
  }

  // Webpack builds the core and entrypoint entries for every mode, and adds the
  // online test suite and its readable launcher entry only for --mode=online.
  // The online artifacts are deliverables only in that mode; for every other
  // mode discard them so dist/ output shape is unaffected.
  if (mode !== 'online') {
    fs.rmSync(path.join(distDir, 'OnlineTests.js'), { force: true });
    fs.rmSync(path.join(distDir, 'OnlineTests.js.map'), { force: true });
    fs.rmSync(path.join(distDir, 'EntryPointOnlineTests.js'), { force: true });
    fs.rmSync(path.join(distDir, 'EntryPointOnlineTests.js.map'), { force: true });
    fs.rmSync(path.join(distDir, 'EntryPointOnlineTests.gs'), { force: true });
  }

  step(4, TOTAL_STEPS, 'Composing GAS deployment file(s)...');

  // Populated only in online mode (see below): the exact 1-based line-number
  // offsets marking where `core`'s and `entrypoints`'s stripped content start
  // within the final dist/Code.js (see the stripComments/onlineCoreLineOffset
  // computation further down). Used by the gas-source-map.json generation step.
  let onlineCoreLineOffset = 0;
  let onlineEntrypointsLineOffset = 0;

  // Populated only in online mode: JSON source-map strings PRODUCED BY TERSER
  // ITSELF for the comment-stripping pass on `core` / `entrypoints` /
  // OnlineTests.js — i.e. they map RAW (pre-strip) line/column positions
  // (exactly the `generatedLine`/`generatedColumn` values read out of
  // aldo-core.js.map / EntryPoints.js.map / OnlineTests.js.map, since those
  // webpack-produced maps describe positions in the pre-strip bundle) to their
  // corresponding position in the ACTUAL STRIPPED text that was written to
  // disk. This is necessary because Terser's `beautify: true` printer does not
  // preserve a uniform 1:1 line correspondence with its input when it removes
  // comments (a single constant per-component offset is not enough — see the
  // gas-source-map.json generation step for the full explanation and the
  // empirical numbers that motivated this).
  let onlineCoreTerserMapJson = null;
  let onlineEntrypointsTerserMapJson = null;
  let onlineOnlineTestsTerserMapJson = null;

  {
    const prelude = fs.readFileSync(vendorBundle, 'utf8');
    const core = fs.readFileSync(aldoCoreBundle, 'utf8');

    if (mode === 'production') {
      let minified;
      try {
        minified = minify_sync(prelude, { format: { comments: false } });
      } catch (e) {
        fail(`Failed to minify vendor prelude: ${e instanceof Error ? e.message : String(e)}`);
        process.exit(1);
      }
      if (typeof minified.code !== 'string') {
        fail('Failed to minify vendor prelude: no code produced');
        process.exit(1);
      }
      fs.writeFileSync(codeJsPath, minified.code + '\n;\n' + core, 'utf8');
      ok('Wrote dist/Code.js (vendor prelude minified + ALDO core, minified, no comments)');
      for (const { js, gs } of productionEntryPoints) {
        fs.renameSync(js, gs);
        fs.rmSync(js + '.map', { force: true });
      }
      ok('Kept dist/EntryPoints_Base/Menu/User.gs separate (readable, with comments)');
      fs.rmSync(aldoCoreBundle, { force: true });
      fs.rmSync(aldoCoreBundle + '.map', { force: true });
    } else if (mode === 'online') {
      const entrypoints = fs.readFileSync(entryPointsBundle, 'utf8');

      // Each of prelude/core/entrypoints is run through Terser SEPARATELY
      // (rather than concatenating raw source into one string and minifying
      // once) so the per-component line offsets used by the gas-source-map.json
      // step further down can be computed EXACTLY from each stripped part's own
      // line count, rather than approximated from pre-Terser source line
      // counts. This distinction matters a lot in practice: Terser's printer
      // does not preserve a 1:1 correspondence between input and output line
      // numbers when reformatting a large program under `beautify: true` —
      // empirically, minifying the ~75k-line vendor prelude alone this way
      // compacts it to ~46k lines (JSDoc/comment removal plus Terser's own
      // line-breaking heuristics), a ~38% reduction that a naive
      // pre-Terser-line-count offset would not predict. With `compress: false`
      // and `mangle: false` there is no cross-module dead-code elimination,
      // inlining, or renaming, so minifying prelude/core/entrypoints
      // independently and concatenating the *results* is equivalent (for our
      // purposes — comment stripping only) to minifying the raw concatenation
      // as one program, while making the resulting offsets exact rather than
      // best-effort.
      // `withMap: true` additionally asks Terser to emit its OWN source map
      // for this transformation (raw src -> stripped code); Terser always
      // names the single anonymous input source "0" in that map, regardless
      // of the `filename` passed in `sourceMap` (which only sets the *output*
      // file name recorded in the map). That per-component map is what lets
      // the gas-source-map.json step below translate a raw (pre-strip)
      // generatedLine/generatedColumn — exactly what aldo-core.js.map /
      // EntryPoints.js.map / OnlineTests.js.map report — into its real
      // position in the stripped text actually written to disk.
      const stripComments = (src, label, withMap) => {
        const opts = {
          compress: false,
          mangle: false,
          format: { comments: false, beautify: true }
        };
        if (withMap) {
          opts.sourceMap = { filename: label, includeSources: false };
        }
        let result;
        try {
          result = minify_sync(src, opts);
        } catch (e) {
          fail(
            `Failed to strip comments from ${label}: ${e instanceof Error ? e.message : String(e)}`
          );
          process.exit(1);
        }
        if (typeof result.code !== 'string') {
          fail(`Failed to strip comments from ${label}: no code produced`);
          process.exit(1);
        }
        return { code: result.code, mapJson: withMap ? result.map : null };
      };

      const strippedPrelude = stripComments(prelude, 'vendor prelude', false).code;
      const coreStrip = stripComments(core, 'aldo-core.js', true);
      const strippedCore = coreStrip.code;
      onlineCoreTerserMapJson = coreStrip.mapJson;
      const entrypointsStrip = stripComments(entrypoints, 'EntryPoints.js', true);
      const strippedEntrypoints = entrypointsStrip.code;
      onlineEntrypointsTerserMapJson = entrypointsStrip.mapJson;

      const countNewlines = (s) => (s.match(/\n/g) || []).length;
      // '\n;\n' is a literal 2-newline separator (the previous part's last line
      // is terminated by the first '\n'; ';' is its own line; the trailing
      // '\n' ends that line) — matches the exact separator used below when
      // concatenating the stripped parts, so these offsets are exact positions
      // in the actual written dist/Code.js, not an approximation.
      onlineCoreLineOffset = countNewlines(strippedPrelude) + 2;
      onlineEntrypointsLineOffset = onlineCoreLineOffset + countNewlines(strippedCore) + 2;

      fs.writeFileSync(
        codeJsPath,
        strippedPrelude + '\n;\n' + strippedCore + '\n;\n' + strippedEntrypoints,
        'utf8'
      );
      ok(
        'Wrote dist/Code.js (vendor + ALDO core + entry points, unminified structure, comments stripped)'
      );
      fs.rmSync(aldoCoreBundle, { force: true });
      fs.rmSync(entryPointsBundle, { force: true });
      // aldo-core.js.map / EntryPoints.js.map are kept on disk (not rmSync'd
      // here) so the gas-source-map.json generation step can index them; they
      // are removed after indexing instead.

      const onlineTestsBundle = path.join(distDir, 'OnlineTests.js');
      if (!fs.existsSync(onlineTestsBundle)) {
        fail('dist/OnlineTests.js was not produced by Webpack');
        process.exit(1);
      }
      const onlineTestsSrc = fs.readFileSync(onlineTestsBundle, 'utf8');
      const onlineTestsStrip = stripComments(onlineTestsSrc, 'OnlineTests.js', true);
      const strippedTestsCode = onlineTestsStrip.code;
      onlineOnlineTestsTerserMapJson = onlineTestsStrip.mapJson;
      fs.writeFileSync(onlineTestsBundle, strippedTestsCode, 'utf8');
      ok(
        'Wrote dist/OnlineTests.js (unminified structure, comments stripped, kept separate from Code.js)'
      );
      // OnlineTests.js.map is likewise kept on disk for the gas-source-map.json step.

      const onlineEntrypointsBundle = path.join(distDir, 'EntryPointOnlineTests.js');
      if (!fs.existsSync(onlineEntrypointsBundle)) {
        fail('dist/EntryPointOnlineTests.js was not produced by Webpack');
        process.exit(1);
      }
      // Launcher leggibili con commenti conservati; keep its map temporarily so
      // gas-source-map.json can index it in step 9, then delete both .js/.map.
      fs.copyFileSync(
        onlineEntrypointsBundle,
        path.join(distDir, 'EntryPointOnlineTests.gs')
      );
      fs.rmSync(onlineEntrypointsBundle, { force: true });
      ok('Wrote dist/EntryPointOnlineTests.gs (readable launchers, kept separate)');
    } else {
      const entrypoints = fs.readFileSync(entryPointsBundle, 'utf8');
      fs.writeFileSync(codeJsPath, prelude + '\n;\n' + core + '\n;\n' + entrypoints, 'utf8');
      ok('Wrote dist/Code.js (vendor prelude + ALDO core + ALDO entry points)');
      fs.rmSync(aldoCoreBundle, { force: true });
      fs.rmSync(aldoCoreBundle + '.map', { force: true });
      fs.rmSync(entryPointsBundle, { force: true });
      fs.rmSync(entryPointsBundle + '.map', { force: true });
    }
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

  // The five structural GAS-V8 patches below must be applied to every file
  // that actually runs in the live GAS V8 runtime. In online mode that is
  // BOTH dist/Code.js and dist/OnlineTests.js (the online GAS test suite runs
  // in the same Apps Script project/runtime as the app code), so this is
  // factored into a function and invoked once per file rather than being
  // Code.js-specific.
  function applyGasV8CompatPatches(inputCode, fileLabel) {
    let code = inputCode;
    let patchCount = 0;

    {
      const regex = /Object\.hasOwn\(/g;
      const matches = code.match(regex);
      if (matches) {
        code = code.replace(regex, 'Object.prototype.hasOwnProperty.call(');
        patchCount += matches.length;
        ok(
          `${fileLabel}: replaced ${matches.length} instance(s) of Object.hasOwn() → Object.prototype.hasOwnProperty.call()`
        );
      } else {
        ok(`${fileLabel}: no Object.hasOwn() found (already compatible)`);
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
        ok(
          `${fileLabel}: replaced ${matches.length} instance(s) of .replaceAll() → .split().join()`
        );
      } else {
        ok(`${fileLabel}: no .replaceAll() with string literal found (already compatible)`);
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
        ok(`${fileLabel}: replaced es-toolkit CASE_SPLIT_PATTERN regex with GAS-safe fallback`);
      } else {
        ok(`${fileLabel}: no es-toolkit CASE_SPLIT_PATTERN regex found (already compatible)`);
      }
    }

    {
      const target = '"^(\\\\p{Extended_Pictographic}|\\\\p{Emoji_Component})+$"';
      if (code.includes(target)) {
        const replacement =
          '"^[\\\\u{1F600}-\\\\u{1F64F}\\\\u{1F300}-\\\\u{1F5FF}\\\\u{1F680}-\\\\u{1F6FF}\\\\u{1F900}-\\\\u{1F9FF}\\\\u{1FA00}-\\\\u{1FA6F}\\\\u{1FA70}-\\\\u{1FAFF}\\\\u{2600}-\\\\u{26FF}\\\\u{2700}-\\\\u{27BF}\\\\u{FE00}-\\\\u{FE0F}\\\\u{200D}\\\\u{20E3}\\\\u{E0020}-\\\\u{E007F}]+$"';
        code = code.replace(target, replacement);
        patchCount++;
        ok(`${fileLabel}: replaced Zod emoji regex with GAS-safe Unicode range fallback`);
      } else {
        ok(`${fileLabel}: no Zod emoji regex found (already compatible)`);
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
        ok(
          `${fileLabel}: injected URL constructor shim (${urlUsages} usage(s) of new URL() found)`
        );
      } else {
        ok(`${fileLabel}: no new URL() found (no shim needed)`);
      }
    }

    return { code, patchCount };
  }

  let code;
  let patchCount = 0;
  let codePatchCount = 0;
  let onlineTestsPatchCount = 0;
  let onlineEntrypointsPatchCount = 0;
  let warningCount = 0;

  {
    const result = applyGasV8CompatPatches(fs.readFileSync(codeJsPath, 'utf8'), 'Code.js');
    code = result.code;
    codePatchCount = result.patchCount;
    patchCount += result.patchCount;
  }

  // OnlineTests.js runs in the same real GAS V8 environment as Code.js (it is
  // pushed into the same Apps Script project in online mode), so it needs the
  // exact same compatibility patches applied — not just Code.js.
  let onlineTestsPatchedCode = null;
  let onlineEntrypointsPatchedCode = null;
  if (mode === 'online') {
    const onlineTestsBundle = path.join(distDir, 'OnlineTests.js');
    const result = applyGasV8CompatPatches(
      fs.readFileSync(onlineTestsBundle, 'utf8'),
      'OnlineTests.js'
    );
    onlineTestsPatchedCode = result.code;
    onlineTestsPatchCount = result.patchCount;
    patchCount += result.patchCount;

    const onlineEntrypointsBundle = path.join(distDir, 'EntryPointOnlineTests.gs');
    const entrypointsResult = applyGasV8CompatPatches(
      fs.readFileSync(onlineEntrypointsBundle, 'utf8'),
      'EntryPointOnlineTests.gs'
    );
    onlineEntrypointsPatchedCode = entrypointsResult.code;
    onlineEntrypointsPatchCount = entrypointsResult.patchCount;
    patchCount += entrypointsResult.patchCount;
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

  if (codePatchCount > 0) {
    fs.writeFileSync(codeJsPath, code, 'utf8');
    ok(`Wrote patched Code.js (${codePatchCount} fix(es) applied)`);
  } else {
    ok('No patches needed — Code.js unchanged');
  }

  if (mode === 'online') {
    const onlineTestsBundle = path.join(distDir, 'OnlineTests.js');
    if (onlineTestsPatchCount > 0) {
      fs.writeFileSync(onlineTestsBundle, onlineTestsPatchedCode, 'utf8');
      ok(`Wrote patched OnlineTests.js (${onlineTestsPatchCount} fix(es) applied)`);
    } else {
      ok('No patches needed — OnlineTests.js unchanged');
    }

    let onlineTestsWarnings = 0;
    for (const { label, regex, reason } of scanPatterns) {
      const matches = onlineTestsPatchedCode.match(regex);
      if (matches) {
        warn(`OnlineTests.js: found ${matches.length} instance(s) of ${c.bold}${label}${c.reset}`);
        info(`  Reason: ${reason}`);
        onlineTestsWarnings += matches.length;
      }
    }
    if (onlineTestsWarnings === 0) {
      ok('OnlineTests.js: no GAS V8 compatibility issues detected');
    }
    warningCount += onlineTestsWarnings;

    const onlineEntrypointsBundle = path.join(distDir, 'EntryPointOnlineTests.gs');
    if (onlineEntrypointsPatchCount > 0) {
      fs.writeFileSync(onlineEntrypointsBundle, onlineEntrypointsPatchedCode, 'utf8');
      ok(
        `Wrote patched EntryPointOnlineTests.gs (${onlineEntrypointsPatchCount} fix(es) applied)`
      );
    } else {
      ok('No patches needed — EntryPointOnlineTests.gs unchanged');
    }

    let onlineEntrypointsWarnings = 0;
    for (const { label, regex, reason } of scanPatterns) {
      const matches = onlineEntrypointsPatchedCode.match(regex);
      if (matches) {
        warn(
          `EntryPointOnlineTests.gs: found ${matches.length} instance(s) of ${c.bold}${label}${c.reset}`
        );
        info(`  Reason: ${reason}`);
        onlineEntrypointsWarnings += matches.length;
      }
    }
    if (onlineEntrypointsWarnings === 0) {
      ok('EntryPointOnlineTests.gs: no GAS V8 compatibility issues detected');
    }
    warningCount += onlineEntrypointsWarnings;
  }

  if (mode === 'production') {
    let entryWarnings = 0;
    for (const { gs } of productionEntryPoints) {
      const entryPointsCode = fs.readFileSync(gs, 'utf8');
      for (const { label, regex, reason } of scanPatterns) {
        const matches = entryPointsCode.match(regex);
        if (matches) {
          warn(
            `${path.basename(gs)}: found ${matches.length} instance(s) of ${c.bold}${label}${c.reset}`
          );
          info(`  Reason: ${reason}`);
          entryWarnings += matches.length;
        }
      }
    }
    if (entryWarnings === 0) {
      ok('EntryPoints_Base/Menu/User.gs: no GAS V8 compatibility issues detected (scan-only)');
    }
    warningCount += entryWarnings;
  }

  if (warningCount > 0) {
    warn(`${warningCount} compatibility warning(s) detected — review above for details`);
  }

  step(7, TOTAL_STEPS, 'Configuring deployment files...');

  {
    const claspignore = `*.map
*.map.json
gas-source-map.json
*.log
*.tmp
**/__tests__/**
`;

    fs.writeFileSync(path.join(distDir, '.claspignore'), claspignore);
    ok('Created .claspignore (excludes tests and map files)');
  }

  if (mode === 'production') {
    step(8, TOTAL_STEPS, 'Verifying production split output...');

    let productionVerifyPassed = true;
    const codeJsContent = fs.readFileSync(codeJsPath, 'utf8');
    const entryPointContents = productionEntryPoints.map(({ gs }) => ({
      file: path.basename(gs),
      content: fs.existsSync(gs) ? fs.readFileSync(gs, 'utf8') : ''
    }));
    const entryPointRequirements = [
      ['EntryPoints_Base.gs', ['MAX_JOB_EXECUTION_TIME_MS', 'resumeJob']],
      [
        'EntryPoints_Menu.gs',
        [
          'onOpen',
          'menu_avvioGenerazioneDocumenti',
          'menu_avvioComunicazioniEmail',
          'menu_avvioImportazioni',
          'menu_validazioneDatabase',
          'menu_bloccaDocumenti'
        ]
      ],
      ['EntryPoints_User.gs', []]
    ];
    if (codeJsContent.includes('/**')) {
      fail(
        'Code.js contains JSDoc comment blocks — expected fully comment-stripped minified output'
      );
      productionVerifyPassed = false;
    } else {
      ok('Code.js contains no JSDoc comment blocks (minified, comment-free)');
    }

    for (const [file, requiredNames] of entryPointRequirements) {
      const entryPoint = entryPointContents.find((candidate) => candidate.file === file);
      if (!entryPoint || entryPoint.content === '') {
        fail(`dist/${file} was not produced`);
        productionVerifyPassed = false;
        continue;
      }
      if (!entryPoint.content.includes('/**')) {
        fail(`${file} contains no JSDoc comment blocks — expected readable, commented output`);
        productionVerifyPassed = false;
      } else {
        ok(`${file} retains JSDoc comment blocks`);
      }

      const missingFromEntryPoints = requiredNames.filter(
        (name) => !entryPoint.content.includes(name)
      );
      if (missingFromEntryPoints.length > 0) {
        fail(`${file} is missing expected entry point(s): ${missingFromEntryPoints.join(', ')}`);
        productionVerifyPassed = false;
      } else {
        ok(`${file} contains expected entry points`);
      }

      const lineCount = entryPoint.content.split('\n').length || 1;
      const avgLineLength = entryPoint.content.length / lineCount;
      if (avgLineLength > 200) {
        fail(
          `${file} looks minified (avg line length ${avgLineLength.toFixed(0)} chars) — expected readable multi-line output`
        );
        productionVerifyPassed = false;
      } else {
        ok(
          `${file} is readable (avg line length ${avgLineLength.toFixed(0)} chars over ${lineCount} lines)`
        );
      }
    }

    const testLeakLabels = [
      ['Code.js', codeJsContent],
      ...entryPointContents.map(({ file, content }) => [file, content])
    ];
    let testLeakFound = false;
    for (const [label, content] of testLeakLabels) {
      if (content.includes('__tests__') || content.includes('.test.ts')) {
        fail(
          `${label} contains test-file references — test code leaked into the production bundle`
        );
        productionVerifyPassed = false;
        testLeakFound = true;
      }
    }
    if (!testLeakFound) {
      ok('No test-file references found in production output');
    }

    if (!productionVerifyPassed) {
      fail('Production split verification failed — see above');
      process.exit(1);
    }
  }

  let offlineTestsPassed = false;

  if (mode === 'testoffline' || mode === 'online') {
    step(8, TOTAL_STEPS, 'Running offline tests (unit + integration)...');

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

  if (mode === 'online') {
    step(9, TOTAL_STEPS, 'Generating gas-source-map.json (online mode)...');

    const { SourceMapConsumer } = require('source-map');
    const gasMapEntries = [];

    // aldo-core.js.map / EntryPoints.js.map / OnlineTests.js.map each describe
    // positions in their PRE-STRIP webpack bundle (aldo-core.js /
    // EntryPoints.js / the OnlineTests.js webpack produced before step 4's
    // Terser pass), not the actual STRIPPED text that step 4 wrote to disk.
    // Two corrections are needed to translate a raw `m.generatedLine` into a
    // real dist/Code.js (or dist/OnlineTests.js) line:
    //
    // 1. `terserConsumer` (built from the source map Terser itself produced
    //    while comment-stripping that component in step 4) translates the raw
    //    pre-strip line/column into its real position in the STRIPPED text.
    //    This is necessary — not just an approximation nicety — because
    //    Terser's `beautify: true` printer does not preserve a uniform 1:1
    //    line correspondence with its input when it removes comments: the
    //    reduction is proportional to how comment-heavy each region of the
    //    source is, so a single constant offset per component would
    //    increasingly overshoot for content deeper into a comment-heavy file
    //    (empirically, e.g., the ~75k-line vendor prelude alone compacts to
    //    ~46k lines this way — a non-uniform ~38% reduction, not evenly
    //    distributed). Using Terser's own map avoids that drift and (unlike a
    //    naive offset) never points past the end of the actual written file.
    // 2. `lineOffset` (onlineCoreLineOffset / onlineEntrypointsLineOffset,
    //    computed in step 4 from the ACTUAL stripped text's own line counts)
    //    then shifts that stripped-component-local line to its real position
    //    in the merged dist/Code.js (`strippedPrelude + '\n;\n' + strippedCore
    //    + '\n;\n' + strippedEntrypoints`). OnlineTests.js is a standalone
    //    webpack entry (never merged with anything else), so it needs no
    //    lineOffset — only the terserConsumer correction.
    //
    // This is still a best-effort debugging aid, not a formally verified map:
    // Terser's own source map is trusted as accurate for its own
    // transformation (a reasonable assumption — it's the same tool
    // authoritatively describing its own output), but no independent proof of
    // that is attempted here; that is considered adequately in-scope
    // precision for symbolicating a GAS stack trace back to approximate
    // original source locations.
    async function buildTerserConsumer(mapJson) {
      if (!mapJson) return null;
      return new SourceMapConsumer(JSON.parse(mapJson));
    }

    const coreTerserConsumer = await buildTerserConsumer(onlineCoreTerserMapJson);
    const entrypointsTerserConsumer = await buildTerserConsumer(onlineEntrypointsTerserMapJson);
    const onlineTestsTerserConsumer = await buildTerserConsumer(onlineOnlineTestsTerserMapJson);

    async function indexMap(generatedFileLabel, mapPath, lineOffset, terserConsumer) {
      if (!fs.existsSync(mapPath)) {
        warn(`No source map found at ${mapPath} — skipping`);
        return;
      }
      const rawMap = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
      await SourceMapConsumer.with(rawMap, null, (consumer) => {
        const seen = new Set();
        consumer.eachMapping((m) => {
          if (m.source === null || m.originalLine === null) return;
          const originalFile = m.source
            .replace(/^webpack:\/\/aldo-sgsa\//, '')
            .replace(/^\.\//, '');
          if (originalFile.startsWith('node_modules/') || originalFile.startsWith('webpack/'))
            return;

          let strippedLine = m.generatedLine;
          if (terserConsumer) {
            // Terser's own map: source "0" (its fixed name for a single
            // anonymous input string) -> stripped output position. Try
            // LEAST_UPPER_BOUND first (nearest mapped position at/after this
            // one — handles the common case where the exact line was a
            // comment/blank line that got removed entirely), then fall back
            // to GREATEST_LOWER_BOUND, then to the raw pre-strip line as a
            // last resort so we still emit a (less precise) entry rather than
            // silently dropping it.
            let pos = terserConsumer.generatedPositionFor({
              source: '0',
              line: m.generatedLine,
              column: m.generatedColumn || 0,
              bias: SourceMapConsumer.LEAST_UPPER_BOUND
            });
            if (pos == null || typeof pos.line !== 'number') {
              pos = terserConsumer.generatedPositionFor({
                source: '0',
                line: m.generatedLine,
                column: m.generatedColumn || 0,
                bias: SourceMapConsumer.GREATEST_LOWER_BOUND
              });
            }
            if (pos && typeof pos.line === 'number') {
              strippedLine = pos.line;
            }
          }

          const generatedLine = strippedLine + lineOffset;
          const key = `${generatedLine}:${originalFile}:${m.originalLine}`;
          if (seen.has(key)) return;
          seen.add(key);
          gasMapEntries.push({
            file: generatedFileLabel,
            generatedLine,
            originalFile,
            originalLine: m.originalLine
          });
        });
      });
    }

    await indexMap(
      'Code.js',
      path.join(distDir, 'aldo-core.js.map'),
      onlineCoreLineOffset,
      coreTerserConsumer
    );
    await indexMap(
      'Code.js',
      path.join(distDir, 'EntryPoints.js.map'),
      onlineEntrypointsLineOffset,
      entrypointsTerserConsumer
    );
    await indexMap(
      'OnlineTests.js',
      path.join(distDir, 'OnlineTests.js.map'),
      0,
      onlineTestsTerserConsumer
    );
    await indexMap(
      'EntryPointOnlineTests.gs',
      path.join(distDir, 'EntryPointOnlineTests.js.map'),
      0,
      null
    );

    if (coreTerserConsumer) coreTerserConsumer.destroy();
    if (entrypointsTerserConsumer) entrypointsTerserConsumer.destroy();
    if (onlineTestsTerserConsumer) onlineTestsTerserConsumer.destroy();

    gasMapEntries.sort((a, b) => a.file.localeCompare(b.file) || a.generatedLine - b.generatedLine);
    fs.writeFileSync(
      path.join(distDir, 'gas-source-map.json'),
      JSON.stringify(gasMapEntries, null, 2),
      'utf8'
    );
    ok(`Generated gas-source-map.json (${gasMapEntries.length} entries)`);

    // .map files are no longer needed after indexing — remove them same as other modes
    for (const p of [
      path.join(distDir, 'aldo-core.js.map'),
      path.join(distDir, 'EntryPoints.js.map'),
      path.join(distDir, 'OnlineTests.js.map'),
      path.join(distDir, 'EntryPointOnlineTests.js.map')
    ]) {
      fs.rmSync(p, { force: true });
    }
  }

  const summaryStep = TOTAL_STEPS;
  step(summaryStep, TOTAL_STEPS, 'Build summary');

  const finalFiles = fs
    .readdirSync(distDir)
    .filter((f) => fs.statSync(path.join(distDir, f)).isFile());

  if (mode === 'testoffline' || mode === 'online') {
    heading(
      offlineTestsPassed
        ? 'Build & Test Complete — All Tests Passed'
        : 'Build Complete — Tests Failed'
    );
  } else {
    heading('Build Complete — Ready for Deployment');
  }

  info(`Mode:             ${c.bold}${mode.toUpperCase()}${c.reset}`);
  info(`Output directory: dist/`);
  info(`GAS patches:      ${patchCount > 0 ? `${patchCount} applied` : 'none needed'}`);
  info(
    mode === 'online'
      ? `Source maps:      gas-source-map.json (excluded from CLASP push)`
      : `Source maps:      Code.js.map (if present) (excluded from CLASP push)`
  );
  if (mode === 'online') {
    info(`Online launcher:  EntryPointOnlineTests.gs (readable, separate from OnlineTests.js)`);
  }
  if (warningCount > 0) {
    info(`Warnings:         ${c.yellow}${warningCount}${c.reset}`);
  }
  if (mode === 'testoffline' || mode === 'online') {
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
  if (mode === 'testoffline' || mode === 'online') {
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

  if ((mode === 'testoffline' || mode === 'online') && !offlineTestsPassed) {
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.stack || e.message : String(e));
  process.exit(1);
});
