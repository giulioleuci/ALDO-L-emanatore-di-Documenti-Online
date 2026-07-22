import { registerE2eScenarioChecks } from '../../../src/onlinetests/checks/e2eScenarioChecks';
import { TestRunner } from '../../../src/onlinetests/OnlineTestReport';
import type { ServiceContainer } from '../../../src/config/ServiceContainer';
import type { E2eSampleDatabase } from '../../../src/onlinetests/E2eSampleDatabaseBuilder';

test('refuses to register any check and reports a single failure when the sample is not TEST_MODE', () => {
  const runner = new TestRunner();
  const container = {} as ServiceContainer;
  const sample: E2eSampleDatabase & { testMode: boolean } = {
    masterSpreadsheetId: 'm',
    sampleSpreadsheetId: 's',
    sampleSpreadsheetUrl: 'https://example.test/s',
    sampleFolderUrl: 'https://example.test/f',
    masterTestMode: false,
    testMode: false
  };

  registerE2eScenarioChecks(runner, container, sample);

  const report = runner.report();
  expect(report.failed).toBe(1);
  expect(report.results[0]!.message).toMatch(/TEST_MODE/);
});
