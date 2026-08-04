const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');

const repoRoot = path.join(__dirname, '..');
const claspJsonPath = path.join(repoRoot, '.clasp.json');
const trackingPath = path.join(repoRoot, '.aldo-testonline.json');
const SHEET_TITLE = '_ALDO_E2E_MASTER';

function readJson(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (_err) {
    return null;
  }
}

function alreadySetUp() {
  const clasp = readJson(claspJsonPath);
  const tracking = readJson(trackingPath);
  if (clasp === null || tracking === null) return null;
  if (typeof clasp.scriptId !== 'string' || clasp.scriptId !== tracking.scriptId) return null;
  return tracking;
}

function partialState() {
  const clasp = readJson(claspJsonPath);
  const tracking = readJson(trackingPath);
  return { claspExists: clasp !== null, trackingExists: tracking !== null };
}

function resolveSetupAction(existing, partial, replace) {
  if (existing !== null && !replace) return 'existing';
  if (!replace && (partial.claspExists || partial.trackingExists)) return 'partial-error';
  return 'create';
}

function createProject() {
  const scratchDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aldo-testonline-'));
  console.log(`Creating MASTER sheet + bound Apps Script project ("${SHEET_TITLE}")...`);
  try {
    let output;
    try {
      output = execSync(`npx clasp create --type sheets --title "${SHEET_TITLE}"`, {
        cwd: scratchDir,
        encoding: 'utf8'
      });
    } catch (err) {
      console.error('clasp create failed:');
      console.error(err.stdout || err.message);
      console.error(
        '\nIf this mentions the Apps Script API not being enabled, visit https://script.google.com/home/usersettings, enable it, and re-run this script.' +
          '\nIf clasp create is blocked entirely (e.g. by a Workspace admin policy), see the manual fallback in docs/superpowers/specs/2026-07-22-testonline-project-setup-push-design.md ("Fallback: if clasp create fails").'
      );
      return false;
    }
    console.log(output);

    const scratchClasp = readJson(path.join(scratchDir, '.clasp.json'));
    if (scratchClasp === null || typeof scratchClasp.scriptId !== 'string') {
      console.error('clasp create succeeded but no .clasp.json with a scriptId was produced.');
      return false;
    }

    const urlMatch = output.match(
      /https:\/\/docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9_-]+)|https:\/\/drive\.google\.com\/open\?id=([a-zA-Z0-9_-]+)/
    );
    if (urlMatch === null) {
      console.error(
        'clasp create succeeded but its output did not contain a recognizable spreadsheet URL. ' +
          'Open the script (clasp open) and copy the spreadsheet id manually into .aldo-testonline.json.'
      );
      return false;
    }
    const masterSpreadsheetId = urlMatch[1] || urlMatch[2];

    fs.writeFileSync(claspJsonPath, JSON.stringify({ scriptId: scratchClasp.scriptId, rootDir: './dist' }, null, 2) + '\n');
    fs.writeFileSync(
      trackingPath,
      JSON.stringify(
        { scriptId: scratchClasp.scriptId, masterSpreadsheetId, createdAt: new Date().toISOString() },
        null,
        2
      ) + '\n'
    );

    console.log(`Created. scriptId=${scratchClasp.scriptId} masterSpreadsheetId=${masterSpreadsheetId}`);
    console.log(
      'Next steps: npm run push:online, then open the MASTER sheet -> Extensions -> Apps Script -> ' +
        'Run -> impostaMasterSpreadsheetId (once).'
    );
    return true;
  } finally {
    fs.rmSync(scratchDir, { recursive: true, force: true });
  }
}

function main() {
  const existing = alreadySetUp();
  const partial = partialState();
  const action = resolveSetupAction(existing, partial, process.argv.includes('--replace'));
  if (action === 'existing') {
    console.log(
      `Already set up: scriptId=${existing.scriptId} masterSpreadsheetId=${existing.masterSpreadsheetId} (created ${existing.createdAt}). Nothing to do.`
    );
    return;
  }

  if (action === 'partial-error') {
    console.error(
      'Local Apps Script tracking is incomplete or inconsistent — refusing to run clasp create because it could repoint a current deployment.\n' +
        'To keep the existing project, restore both .clasp.json and .aldo-testonline.json from a known-good setup, ' +
        'with matching scriptId values and the MASTER spreadsheet id in .aldo-testonline.json.\n' +
        'To intentionally provision a replacement, run npm run setup:testonline -- --replace.'
    );
    process.exitCode = 1;
    return;
  }

  if (!createProject()) process.exitCode = 1;
}

if (require.main === module) main();

module.exports = { resolveSetupAction };
