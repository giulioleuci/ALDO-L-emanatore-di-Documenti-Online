import {
  dumpOnlineCoverage,
  runArticolazioneScenarios,
  runE2eScenarios,
  runOnlineTests
} from './index';

/**
 * GAS loads every pushed script file into one global namespace, while Webpack
 * keeps the online test implementation inside its module scope. This tiny
 * entry module deliberately exposes only zero-argument GAS runners.
 */
const gasGlobal = globalThis as typeof globalThis & {
  dumpOnlineCoverage: typeof dumpOnlineCoverage;
  runArticolazioneScenarios: typeof runArticolazioneScenarios;
  runE2eScenarios: typeof runE2eScenarios;
  runOnlineTests: typeof runOnlineTests;
};

gasGlobal.runOnlineTests = runOnlineTests;
gasGlobal.dumpOnlineCoverage = dumpOnlineCoverage;
gasGlobal.runE2eScenarios = runE2eScenarios;
gasGlobal.runArticolazioneScenarios = runArticolazioneScenarios;
