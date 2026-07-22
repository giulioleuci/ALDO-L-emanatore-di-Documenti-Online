const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');

const repoRoot = path.join(__dirname, '..');
const claspJsonPath = path.join(repoRoot, '.clasp.json');
const trackingPath = path.join(repoRoot, '.aldo-testonline.json');
const SHEET_TITLE = 'ALDO MASTER (testonline)';

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

function createProject() {
  const scratchDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aldo-testonline-'));
  console.log(`Creating MASTER sheet + bound Apps Script project ("${SHEET_TITLE}")...`);
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
    process.exit(1);
  }
  console.log(output);

  const scratchClasp = readJson(path.join(scratchDir, '.clasp.json'));
  if (scratchClasp === null || typeof scratchClasp.scriptId !== 'string') {
    console.error('clasp create succeeded but no .clasp.json with a scriptId was produced.');
    process.exit(1);
  }

  const urlMatch = output.match(/https:\/\/docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if (urlMatch === null) {
    console.error(
      'clasp create succeeded but its output did not contain a recognizable spreadsheet URL. ' +
        'Open the script (clasp open) and copy the spreadsheet id manually into .aldo-testonline.json.'
    );
    process.exit(1);
  }
  const masterSpreadsheetId = urlMatch[1];

  fs.writeFileSync(claspJsonPath, JSON.stringify({ scriptId: scratchClasp.scriptId, rootDir: './dist' }, null, 2) + '\n');
  fs.writeFileSync(
    trackingPath,
    JSON.stringify(
      { scriptId: scratchClasp.scriptId, masterSpreadsheetId, createdAt: new Date().toISOString() },
      null,
      2
    ) + '\n'
  );

  fs.rmSync(scratchDir, { recursive: true, force: true });

  console.log(`Created. scriptId=${scratchClasp.scriptId} masterSpreadsheetId=${masterSpreadsheetId}`);
  console.log(
    'Next steps: npm run push:online, then open the MASTER sheet -> Extensions -> Apps Script -> ' +
      'Run -> impostaMasterSpreadsheetId (once).'
  );
}

function main() {
  const existing = alreadySetUp();
  if (existing !== null) {
    console.log(
      `Already set up: scriptId=${existing.scriptId} masterSpreadsheetId=${existing.masterSpreadsheetId} (created ${existing.createdAt}). Nothing to do.`
    );
    return;
  }

  const { claspExists, trackingExists } = partialState();
  if (claspExists && !trackingExists) {
    console.error(
      '.clasp.json exists but .aldo-testonline.json does not (or scriptId does not match) — ' +
        'refusing to run clasp create again, which would mint a SECOND MASTER sheet.\n' +
        'Either restore .aldo-testonline.json manually (scriptId from .clasp.json + the MASTER ' +
        "sheet's spreadsheet id from its URL), or delete .clasp.json to start fresh.\n" +
        'See docs/superpowers/specs/2026-07-22-testonline-project-setup-push-design.md, ' +
        '"Fallback: if clasp create fails" for the manual recovery steps.'
    );
    process.exit(1);
  }

  createProject();
}

main();
