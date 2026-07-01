module.exports = {
  presets: [
    ['@babel/preset-env', { targets: { chrome: '80' }, modules: false }],
    ['@babel/preset-typescript', {}]
  ]
};
