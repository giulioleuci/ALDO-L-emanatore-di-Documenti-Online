import { registerArticolazioneChecks } from '../../../src/onlinetests/checks/articolazioneChecks';
import type { ServiceContainer } from '../../../src/config/ServiceContainer';
import type { E2eSampleDatabase } from '../../../src/onlinetests/E2eSampleDatabaseBuilder';

interface RegisteredCheck {
  name: string;
  artifactUrl: string | undefined;
}

class RecordingRunner {
  readonly checks: RegisteredCheck[] = [];

  add(name: string, artifactUrl: string | undefined, fn: () => void): void {
    void fn;
    this.checks.push({ name, artifactUrl });
  }
}

const sample: E2eSampleDatabase & { testMode: boolean } = {
  masterSpreadsheetId: 'master',
  sampleSpreadsheetId: 'sample',
  sampleSpreadsheetUrl: 'https://example.test/sample',
  sampleFolderUrl: 'https://example.test/folder',
  priorSampleSpreadsheetId: 'prior-sample',
  priorSampleSpreadsheetUrl: 'https://example.test/prior-sample',
  masterTestMode: true,
  staticAttachmentFileId: 'static-attachment',
  testMode: true
};

test('registers the articulation checks only for a TEST_MODE sample', () => {
  const runner = new RecordingRunner();

  registerArticolazioneChecks(runner as never, {} as ServiceContainer, sample);

  expect(runner.checks).toEqual([
    {
      name: 'Articolazione CDU: supplenza, titolare finale e confini data',
      artifactUrl: sample.sampleSpreadsheetUrl
    },
    {
      name: 'Articolazione CDU: serializzabilita, CdC unico, materie e indirizzo',
      artifactUrl: sample.sampleSpreadsheetUrl
    },
    {
      name: 'Articolazione CDU: round trip partner-parent e split comune/separato',
      artifactUrl: sample.sampleSpreadsheetUrl
    },
    {
      name: 'Articolazione CDU: target documenti COMPLETA e ARTICOLATA',
      artifactUrl: sample.sampleSpreadsheetUrl
    },
    {
      name: 'Articolazione CDU: target mail COMPLETA e ARTICOLATA',
      artifactUrl: sample.sampleSpreadsheetUrl
    },
    {
      name: 'Articolazione CDU: documento CDC include partner ed esclude parent',
      artifactUrl: sample.sampleSpreadsheetUrl
    },
    {
      name: 'Articolazione CDU: specifica nel repeater',
      artifactUrl: sample.sampleSpreadsheetUrl
    }
  ]);
});

test('registers only a TEST_MODE guard failure for an unsafe sample', () => {
  const runner = new RecordingRunner();

  registerArticolazioneChecks(runner as never, {} as ServiceContainer, {
    ...sample,
    testMode: false
  });

  expect(runner.checks).toEqual([
    {
      name: 'Articolazione CDU: MASTER.TEST_MODE guard',
      artifactUrl: sample.sampleSpreadsheetUrl
    }
  ]);
});
