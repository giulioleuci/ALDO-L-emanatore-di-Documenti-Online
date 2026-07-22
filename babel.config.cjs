module.exports = {
  presets: [
    ['@babel/preset-env', { targets: { chrome: '80' }, modules: false }],
    ['@babel/preset-typescript', {}]
  ],
  // GAS V8's sandboxed parser rejects native class-field syntax even though
  // Chrome 80 supports it natively, so force the transform regardless of target.
  plugins: [['@babel/plugin-transform-class-properties', { loose: false }]]
};
