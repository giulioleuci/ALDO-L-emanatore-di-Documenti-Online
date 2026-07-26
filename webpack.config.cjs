const path = require('path');
const GasPlugin = require('gas-webpack-plugin');
const TerserPlugin = require('minimizer-webpack-plugin');

// `instrument: true` is used ONLY for the onlinetests webpack entry (see onlinetestsConfig
// below) — the online-coverage spike (docs/superpowers/specs/2026-07-26-test-completion-
// coverage-index-design.md §3.5) needs istanbul counters inside dist/OnlineTests.js so a live
// GAS run can report real coverage. coreConfig/entrypointsConfig (production Code.js/
// EntryPoints.js) must never be instrumented.
function makeBabelRule(instrument) {
  return {
    test: /\.ts$/,
    exclude: [/node_modules/, /\.test\.ts$/],
    use: {
      loader: 'babel-loader',
      options: {
        presets: [
          ['@babel/preset-env', { targets: { chrome: '80' }, modules: false }],
          ['@babel/preset-typescript', {}]
        ],
        // GAS V8's sandboxed parser rejects native class-field syntax even though
        // Chrome 80 supports it natively, so force the transform regardless of target.
        plugins: [
          ['@babel/plugin-transform-class-properties', { loose: false }],
          ...(instrument ? [['istanbul', { extension: ['.ts'] }]] : [])
        ]
      }
    }
  };
}

const babelRule = makeBabelRule(false);
const instrumentedBabelRule = makeBabelRule(true);

module.exports = (env) => {
  const readable = !!(env && env.readable);
  // Signaled from scripts/build-and-prepare.cjs's --mode=online webpack
  // invocation only (`npx webpack --env readable --env online`). Every other
  // build mode (production/testing/testoffline) must NOT build the online
  // test suite entry — it would just be bundled and then immediately deleted
  // by build-and-prepare.cjs's cleanup step, wasting build time.
  const online = !!(env && env.online);

  const coreConfig = {
    name: 'core',
    mode: 'production',
    entry: './src/index.ts',
    devtool: 'source-map',
    output: {
      filename: 'aldo-core.js',
      path: path.resolve(__dirname, 'dist'),
      library: { type: 'this' },
      clean: false
    },
    resolve: { extensions: ['.ts', '.js', '.json'] },
    module: { rules: [babelRule] },
    optimization: {
      minimize: !readable,
      minimizer: [
        new TerserPlugin({
          extractComments: false,
          terserOptions: { format: { comments: false } }
        })
      ]
    },
    plugins: [
      new GasPlugin({
        autoGlobalExportsFiles: [path.resolve(__dirname, 'src/index.ts')],
        comment: false
      })
    ]
  };

  // Document-generation/email-sending entry points (docs/superpowers/specs/
  // 2026-07-11-production-split-build-design.md): always readable, always
  // commented, regardless of --env readable or the ALDO build mode — this
  // file is meant to be opened and read/extended by a human.
  const entrypointsConfig = {
    name: 'entrypoints',
    mode: 'production',
    entry: './src/entrypoints/EntryPoints.ts',
    devtool: 'source-map',
    output: {
      filename: 'EntryPoints.js',
      path: path.resolve(__dirname, 'dist'),
      clean: false,
      iife: false
    },
    resolve: { extensions: ['.ts', '.js', '.json'] },
    module: { rules: [babelRule] },
    optimization: { minimize: false }
  };

  // Online GAS test suite (docs/superpowers/specs/2026-07-11-offline-online-test-expansion-design.md):
  // always its own output file, never concatenated into Code.js, so it can be
  // pushed or removed from the Apps Script project independently of app code.
  const onlinetestsConfig = {
    name: 'onlinetests',
    mode: 'production',
    entry: './src/onlinetests/index.ts',
    devtool: 'source-map',
    output: {
      filename: 'OnlineTests.js',
      path: path.resolve(__dirname, 'dist'),
      clean: false,
      iife: false
    },
    resolve: { extensions: ['.ts', '.js', '.json'] },
    module: { rules: [instrumentedBabelRule] },
    optimization: { minimize: false }
  };

  const configs = [coreConfig, entrypointsConfig];
  if (online) {
    configs.push(onlinetestsConfig);
  }
  return configs;
};
