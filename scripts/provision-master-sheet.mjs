#!/usr/bin/env node

/**
 * Creates a MASTER_SHEET on Google Drive with the required columns,
 * attaches a Google Apps Script project, and pushes the ALDO production build.
 *
 * Usage: node scripts/provision-master-sheet.mjs
 *
 * Prerequisites:
 *   - Sheets API enabled in Google Cloud project (for column headers)
 *   - OR: run with --skip-columns flag to create sheet + script only
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const MASTER_TITLE = 'MASTER_SHEET';
const COLUMNS = [
  'ANNO_SCOLASTICO',
  'ID_SPREADSHEET',
  'ID_CARTELLA_GOOGLE',
  'DIRIGENTE_SCOLASTICO',
  'SUPERVISORE_EMAIL',
  'TEST_MODE'
];

const skipColumns = process.argv.includes('--skip-columns');

// ── OAuth helpers ──────────────────────────────────────────────────────

function loadCredentials() {
  const raw = readFileSync(resolve(process.env.HOME, '.clasprc.json'), 'utf8');
  const { tokens } = JSON.parse(raw);
  const t = tokens.default || tokens;
  return {
    clientId: t.client_id,
    clientSecret: t.client_secret,
    refreshToken: t.refresh_token
  };
}

async function getAccessToken(creds) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
      refresh_token: creds.refreshToken,
      grant_type: 'refresh_token'
    })
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Token refresh failed (${res.status}): ${body}`);
  }
  const data = await res.json();
  return data.access_token;
}

// ── Google Sheets API ──────────────────────────────────────────────────

async function writeHeaders(token, spreadsheetId, columns) {
  const lastCol = String.fromCharCode(64 + columns.length);
  const range = `Foglio1!A1:${lastCol}1`;
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}?valueInputOption=RAW`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ values: [columns] })
    }
  );
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Write headers failed (${res.status}): ${body}`);
  }
}

async function createSpreadsheet(token, title, columns) {
  const res = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      properties: { title },
      sheets: [
        {
          properties: {
            title: 'Foglio1',
            gridProperties: { rowCount: 1000, columnCount: columns.length }
          }
        }
      ]
    })
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Spreadsheet creation failed (${res.status}): ${body}`);
  }
  return res.json();
}

async function createAppsScriptProject(token, spreadsheetId, title) {
  const res = await fetch('https://script.googleapis.com/v1/projects', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      title: `${title} — Apps Script`,
      parentId: { spreadsheetId, type: 'SPREADSHEET' }
    })
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Apps Script project creation failed (${res.status}): ${body}`);
  }
  return res.json();
}

// ── Clasp helpers ──────────────────────────────────────────────────────

function claspCreate(tempDir, title) {
  execSync(`npx clasp create --type sheets --title "${title}"`, { cwd: tempDir, stdio: 'pipe' });
  const raw = readFileSync(resolve(tempDir, '.clasp.json'), 'utf8');
  return JSON.parse(raw).scriptId;
}

// ── Main ───────────────────────────────────────────────────────────────

async function main() {
  console.log('Reading OAuth credentials…');
  const creds = loadCredentials();

  console.log('Refreshing access token…');
  const token = await getAccessToken(creds);

  // Strategy: try Sheets API first, fall back to clasp create
  let spreadsheetId;
  let scriptId;

  try {
    console.log(`Creating spreadsheet "${MASTER_TITLE}" via Sheets API…`);
    const spreadsheet = await createSpreadsheet(token, MASTER_TITLE, COLUMNS);
    spreadsheetId = spreadsheet.spreadsheetId;
    console.log(`  Spreadsheet ID: ${spreadsheetId}`);
    console.log(`  URL: https://docs.google.com/spreadsheets/d/${spreadsheetId}`);

    console.log('Creating bound Apps Script project via Apps Script API…');
    const project = await createAppsScriptProject(token, spreadsheetId, MASTER_TITLE);
    scriptId = project.scriptId;
    console.log(`  Script ID: ${scriptId}`);
  } catch (apiErr) {
    console.warn(`\n  ⚠ API approach failed: ${apiErr.message}`);
    console.warn('  Falling back to clasp create…\n');

    const tempDir = mkdtempSync(resolve(tmpdir(), 'aldo-master-'));
    try {
      console.log(`Creating spreadsheet + Apps Script via clasp…`);
      scriptId = claspCreate(tempDir, MASTER_TITLE);
      console.log(`  Script ID: ${scriptId}`);

      // Extract spreadsheet ID from the script's parent
      const propsRes = await fetch(`https://script.googleapis.com/v1/projects/${scriptId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (propsRes.ok) {
        const props = await propsRes.json();
        const parent = props.parentId;
        if (parent && parent.spreadsheetId) {
          spreadsheetId = parent.spreadsheetId;
          console.log(`  Spreadsheet ID: ${spreadsheetId}`);
          console.log(`  URL: https://docs.google.com/spreadsheets/d/${spreadsheetId}`);
        }
      }
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  }

  // Write column headers if we have the spreadsheet ID
  if (spreadsheetId && !skipColumns) {
    try {
      console.log('Writing column headers…');
      await writeHeaders(token, spreadsheetId, COLUMNS);
      console.log(`  Columns: ${COLUMNS.join(', ')}`);
    } catch (headerErr) {
      console.warn(`\n  ⚠ Could not write headers: ${headerErr.message}`);
      console.warn('  You may need to enable the Sheets API in your Google Cloud project:');
      console.warn(
        '  https://console.developers.google.com/apis/api/sheets.googleapis.com/overview?project=1072944905499'
      );
      console.warn('  Columns must be added manually.');
    }
  }

  // Update .clasp.json
  console.log('Updating .clasp.json…');
  const claspPath = resolve(ROOT, '.clasp.json');
  writeFileSync(claspPath, JSON.stringify({ scriptId, rootDir: './dist' }, null, 2) + '\n');
  console.log(`  Written to ${claspPath}`);

  // Push code
  console.log('Pushing ALDO production build…');
  execSync('npx clasp push --force', { cwd: ROOT, stdio: 'inherit' });

  console.log('\n✅ MASTER_SHEET provisioned successfully.');
  if (spreadsheetId) {
    console.log(`   Spreadsheet: https://docs.google.com/spreadsheets/d/${spreadsheetId}`);
  }
  console.log(`   Script ID:   ${scriptId}`);
}

main().catch((err) => {
  console.error(`\n❌ Provisioning failed: ${err.message}`);
  process.exit(1);
});
