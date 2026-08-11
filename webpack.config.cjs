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
  const productionSplit = !!(env && env.production);
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

  // Entry points always remain readable. Production emits Base/Menu/User as
  // individual GAS files; non-production combines them for one-file debugging.
  const makeEntrypointsConfig = (name, entry, filename) => ({
    name,
    mode: 'production',
    entry,
    devtool: 'source-map',
    output: {
      filename,
      path: path.resolve(__dirname, 'dist'),
      clean: false,
      iife: false
    },
    resolve: { extensions: ['.ts', '.js', '.json'] },
    module: { rules: [babelRule] },
    optimization: { minimize: false }
  });

  const entrypointsConfigs = productionSplit
    ? [
        makeEntrypointsConfig(
          'entrypoints-base',
          './src/entrypoints/EntryPoints_Base.ts',
          'EntryPoints_Base.js'
        ),
        makeEntrypointsConfig(
          'entrypoints-menu',
          './src/entrypoints/EntryPoints_Menu.ts',
          'EntryPoints_Menu.js'
        ),
        makeEntrypointsConfig(
          'entrypoints-user',
          './src/entrypoints/EntryPoints_User.ts',
          'EntryPoints_User.js'
        )
      ]
    : [makeEntrypointsConfig('entrypoints', './src/entrypoints/EntryPoints.ts', 'EntryPoints.js')];

  // Online GAS test suite (docs/superpowers/specs/2026-07-11-offline-online-test-expansion-design.md):
  // always its own output file, never concatenated into Code.js, so it can be
  // pushed or removed from the Apps Script project independently of app code.
  const onlinetestsConfig = {
    name: 'onlinetests',
    mode: 'production',
    entry: './src/onlinetests/OnlineTestsEntry.ts',
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

  const onlineEntrypointsConfig = makeEntrypointsConfig(
    'entrypoints-onlinetests',
    './src/onlinetests/entrypoints/EntryPointOnlineTests.ts',
    'EntryPointOnlineTests.js'
  );

  const configs = [coreConfig, ...entrypointsConfigs];
  if (online) {
    configs.push(onlinetestsConfig, onlineEntrypointsConfig);
  }
  return configs;
};
