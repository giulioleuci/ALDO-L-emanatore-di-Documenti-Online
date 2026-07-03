// Jest setup: make the vendored GasLibraryFactory classes (Entity, Repository,
// FieldSpecification, etc.) available as globals for tests, exactly as the
// deployed GAS bundle does at runtime. The vendored bundle is webpack-built with
// library.type:'this' and also Object.assign(global, Lib) in its entry, so
// executing it with `this === global` populates globalThis with every lib class.
// Validated in the R0 harness spike (see docs/superpowers/specs/2026-07-03-repo-breadth-R0-design.md §3).
const fs = require('fs');
const path = require('path');

const bundlePath = path.join(__dirname, '..', '..', 'vendor', 'gaslibs.Code.js');
const code = fs.readFileSync(bundlePath, 'utf8');
// Deliberate: execute the self-contained, checksum-verified vendored bundle with
// this===global so its classes register on globalThis (not untrusted input).
new Function(code).call(global);
