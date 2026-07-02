const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

const repoRoot = path.join(__dirname, '..');
const monorepo = path.join(repoRoot, 'GasLibraryFactory');
const vendorDir = path.join(repoRoot, 'vendor');

if (!fs.existsSync(monorepo)) { console.error(`GasLibraryFactory not found at ${monorepo}`); process.exit(1); }

console.log('Building GasLibraryFactory (testing mode)...');
execSync('npm run build:testing -- --online-tests=false', { cwd: monorepo, stdio: 'inherit' });

const built = path.join(monorepo, 'dist', 'Code.js');
if (!fs.existsSync(built)) { console.error('GasLibraryFactory dist/Code.js not produced'); process.exit(1); }

fs.mkdirSync(vendorDir, { recursive: true });
const dest = path.join(vendorDir, 'gaslibs.Code.js');
fs.copyFileSync(built, dest);

const checksum = crypto.createHash('sha256').update(fs.readFileSync(dest)).digest('hex');
fs.writeFileSync(path.join(vendorDir, 'CHECKSUM'), checksum + '\n');

let version = 'unknown';
try {
  version = JSON.parse(fs.readFileSync(path.join(monorepo, 'package.json'), 'utf8')).version;
} catch (_err) {
  // best-effort: keep version = 'unknown' if package.json is unreadable/unparsable
}
fs.writeFileSync(path.join(vendorDir, 'VERSION'), `${version}\n`);

console.log(`vendor: refreshed gaslibs.Code.js (v${version}, sha256 ${checksum.slice(0, 12)}...)`);
