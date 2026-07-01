const path = require('path');
const GasPlugin = require('gas-webpack-plugin');

module.exports = (env) => {
  const readable = !!(env && env.readable);
  return {
    mode: 'production',
    entry: './src/index.ts',
    devtool: 'source-map',
    output: {
      filename: 'aldo.js',
      path: path.resolve(__dirname, 'dist'),
      library: { type: 'this' },
      clean: false
    },
    resolve: { extensions: ['.ts', '.js', '.json'] },
    module: {
      rules: [
        {
          test: /\.ts$/,
          exclude: [/node_modules/, /\.test\.ts$/],
          use: {
            loader: 'babel-loader',
            options: {
              presets: [
                ['@babel/preset-env', { targets: { chrome: '80' }, modules: false }],
                ['@babel/preset-typescript', {}]
              ]
            }
          }
        }
      ]
    },
    optimization: { minimize: !readable },
    plugins: [new GasPlugin({ autoGlobalExportsFiles: [path.resolve(__dirname, 'src/index.ts')], comments: false })]
  };
};
