/** Launcher GAS leggibili, inoltrati al bridge installato da OnlineTests.js. */
interface AldoOnlineTestsLaunchers {
  creaDatiMockDrive: () => unknown;
  testDocumentiStandard: () => unknown;
  testDocumentiArticolati: () => unknown;
  testDocumentiTabelleImportate: () => unknown;
  testDuplicazioneDocumenti: () => unknown;
  testInvioEmail: () => unknown;
  testEmailSicurezza: () => unknown;
  testJobRunnerDocGen: () => unknown;
  testJobRunnerEmail: () => unknown;
  testJobRunnerTriggerReale: () => unknown;
  testImportFileSingolo: () => unknown;
  testImportCartelleClasse: () => unknown;
  testImportCercaDocumenti: () => unknown;
  testImportChunked: () => unknown;
  testRecuperoStoricoAlunno: () => unknown;
  testRecuperoStoricoClasse: () => unknown;
  testRecuperoStoricoDocumenti: () => unknown;
  testArticolazione: () => unknown;
  testITPeMateriePuntate: () => unknown;
  testSupplenzeERuoli: () => unknown;
  testACLReali: () => unknown;
  testCacheIsolamento: () => unknown;
  testPermessiAttivi: () => unknown;
  runFullOnlineTests: () => unknown;
  dumpOnlineCoverage: () => void;
}

function getAldoOnlineTestsLaunchersBridge(): AldoOnlineTestsLaunchers {
  return (
    globalThis as typeof globalThis & {
      __ALDO_ONLINE_TESTS_LAUNCHERS__: AldoOnlineTestsLaunchers;
    }
  ).__ALDO_ONLINE_TESTS_LAUNCHERS__;
}

export function creaDatiMockDrive(): unknown {
  return getAldoOnlineTestsLaunchersBridge().creaDatiMockDrive();
}

export function testDocumentiStandard(): unknown {
  return getAldoOnlineTestsLaunchersBridge().testDocumentiStandard();
}

export function testDocumentiArticolati(): unknown {
  return getAldoOnlineTestsLaunchersBridge().testDocumentiArticolati();
}

export function testDocumentiTabelleImportate(): unknown {
  return getAldoOnlineTestsLaunchersBridge().testDocumentiTabelleImportate();
}

export function testDuplicazioneDocumenti(): unknown {
  return getAldoOnlineTestsLaunchersBridge().testDuplicazioneDocumenti();
}

export function testInvioEmail(): unknown {
  return getAldoOnlineTestsLaunchersBridge().testInvioEmail();
}

export function testEmailSicurezza(): unknown {
  return getAldoOnlineTestsLaunchersBridge().testEmailSicurezza();
}

export function testJobRunnerDocGen(): unknown {
  return getAldoOnlineTestsLaunchersBridge().testJobRunnerDocGen();
}

export function testJobRunnerEmail(): unknown {
  return getAldoOnlineTestsLaunchersBridge().testJobRunnerEmail();
}

export function testJobRunnerTriggerReale(): unknown {
  return getAldoOnlineTestsLaunchersBridge().testJobRunnerTriggerReale();
}

export function testImportFileSingolo(): unknown {
  return getAldoOnlineTestsLaunchersBridge().testImportFileSingolo();
}

export function testImportCartelleClasse(): unknown {
  return getAldoOnlineTestsLaunchersBridge().testImportCartelleClasse();
}

export function testImportCercaDocumenti(): unknown {
  return getAldoOnlineTestsLaunchersBridge().testImportCercaDocumenti();
}

export function testImportChunked(): unknown {
  return getAldoOnlineTestsLaunchersBridge().testImportChunked();
}

export function testRecuperoStoricoAlunno(): unknown {
  return getAldoOnlineTestsLaunchersBridge().testRecuperoStoricoAlunno();
}

export function testRecuperoStoricoClasse(): unknown {
  return getAldoOnlineTestsLaunchersBridge().testRecuperoStoricoClasse();
}

export function testRecuperoStoricoDocumenti(): unknown {
  return getAldoOnlineTestsLaunchersBridge().testRecuperoStoricoDocumenti();
}

export function testArticolazione(): unknown {
  return getAldoOnlineTestsLaunchersBridge().testArticolazione();
}

export function testITPeMateriePuntate(): unknown {
  return getAldoOnlineTestsLaunchersBridge().testITPeMateriePuntate();
}

export function testSupplenzeERuoli(): unknown {
  return getAldoOnlineTestsLaunchersBridge().testSupplenzeERuoli();
}

export function testACLReali(): unknown {
  return getAldoOnlineTestsLaunchersBridge().testACLReali();
}

export function testCacheIsolamento(): unknown {
  return getAldoOnlineTestsLaunchersBridge().testCacheIsolamento();
}

export function testPermessiAttivi(): unknown {
  return getAldoOnlineTestsLaunchersBridge().testPermessiAttivi();
}

export function runFullOnlineTests(): unknown {
  return getAldoOnlineTestsLaunchersBridge().runFullOnlineTests();
}

export function dumpOnlineCoverage(): void {
  return getAldoOnlineTestsLaunchersBridge().dumpOnlineCoverage();
}
