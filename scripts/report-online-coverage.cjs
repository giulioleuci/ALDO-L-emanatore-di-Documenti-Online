#!/usr/bin/env node
// Turns a raw istanbul coverage map (dumped via Logger.log(JSON.stringify(globalThis.__coverage__))
// from a live GAS `dumpOnlineCoverage()` run) into a text-summary coverage report. See
// docs/ONLINE_COVERAGE_SPIKE.md for the manual live-run procedure that produces the input file.
const fs = require('fs');
const path = require('path');
const libCoverage = require('istanbul-lib-coverage');
const libReport = require('istanbul-lib-report');
const reports = require('istanbul-reports');

const inputPath = process.argv[2];
if (!inputPath) {
  console.error('Usage: node scripts/report-online-coverage.cjs <raw-coverage.json>');
  process.exit(1);
}

const raw = JSON.parse(fs.readFileSync(path.resolve(inputPath), 'utf8'));
const coverageMap = libCoverage.createCoverageMap(raw);
const context = libReport.createContext({
  dir: path.join(__dirname, '..', 'coverage-online'),
  coverageMap
});
const report = reports.create('text-summary');
report.execute(context);
