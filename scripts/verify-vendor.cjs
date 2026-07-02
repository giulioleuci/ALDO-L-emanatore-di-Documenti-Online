const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const vendorDir = path.join(__dirname, '..', 'vendor');
const bundle = path.join(vendorDir, 'gaslibs.Code.js');
const checksumFile = path.join(vendorDir, 'CHECKSUM');

if (!fs.existsSync(bundle) || !fs.existsSync(checksumFile)) {
  console.error('vendor: gaslibs.Code.js or CHECKSUM missing. Run npm run refresh:vendor.');
  process.exit(1);
}
const actual = crypto.createHash('sha256').update(fs.readFileSync(bundle)).digest('hex');
const expected = fs.readFileSync(checksumFile, 'utf8').trim();
if (actual !== expected) {
  console.error(`vendor: checksum mismatch.\n expected ${expected}\n actual   ${actual}`);
  process.exit(1);
}
console.log('vendor: checksum OK');
