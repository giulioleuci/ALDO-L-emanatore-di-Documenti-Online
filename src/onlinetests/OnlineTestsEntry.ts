import {
  creaDatiMockDrive,
  dumpOnlineCoverage,
  runFullOnlineTests,
  testACLReali,
  testArticolazione,
  testCacheIsolamento,
  testDocumentiArticolati,
  testDocumentiStandard,
  testDocumentiTabelleImportate,
  testDuplicazioneDocumenti,
  testEmailSicurezza,
  testImportCartelleClasse,
  testImportCercaDocumenti,
  testImportChunked,
  testImportFileSingolo,
  testInvioEmail,
  testITPeMateriePuntate,
  testJobRunnerDocGen,
  testJobRunnerEmail,
  testJobRunnerTriggerReale,
  testPermessiAttivi,
  testRecuperoStoricoAlunno,
  testRecuperoStoricoClasse,
  testRecuperoStoricoDocumenti,
  testSupplenzeERuoli
} from './index';

/**
 * Captures implementation references before EntryPointOnlineTests.gs replaces
 * their shared GAS global names with readable zero-argument wrappers.
 */
const aldoOnlineTestsLaunchers = {
  creaDatiMockDrive,
  testDocumentiStandard,
  testDocumentiArticolati,
  testDocumentiTabelleImportate,
  testDuplicazioneDocumenti,
  testInvioEmail,
  testEmailSicurezza,
  testJobRunnerDocGen,
  testJobRunnerEmail,
  testJobRunnerTriggerReale,
  testImportFileSingolo,
  testImportCartelleClasse,
  testImportCercaDocumenti,
  testImportChunked,
  testRecuperoStoricoAlunno,
  testRecuperoStoricoClasse,
  testRecuperoStoricoDocumenti,
  testArticolazione,
  testITPeMateriePuntate,
  testSupplenzeERuoli,
  testACLReali,
  testCacheIsolamento,
  testPermessiAttivi,
  runFullOnlineTests,
  dumpOnlineCoverage
};

/** Espone solo launcher zero-arg GAS. Vedi design 2026-08-10 Sez. 2. */
const gasGlobal = globalThis as typeof globalThis & {
  __ALDO_ONLINE_TESTS_LAUNCHERS__: typeof aldoOnlineTestsLaunchers;
  creaDatiMockDrive: typeof creaDatiMockDrive;
  testDocumentiStandard: typeof testDocumentiStandard;
  testDocumentiArticolati: typeof testDocumentiArticolati;
  testDocumentiTabelleImportate: typeof testDocumentiTabelleImportate;
  testDuplicazioneDocumenti: typeof testDuplicazioneDocumenti;
  testInvioEmail: typeof testInvioEmail;
  testEmailSicurezza: typeof testEmailSicurezza;
  testJobRunnerDocGen: typeof testJobRunnerDocGen;
  testJobRunnerEmail: typeof testJobRunnerEmail;
  testJobRunnerTriggerReale: typeof testJobRunnerTriggerReale;
  testImportFileSingolo: typeof testImportFileSingolo;
  testImportCartelleClasse: typeof testImportCartelleClasse;
  testImportCercaDocumenti: typeof testImportCercaDocumenti;
  testImportChunked: typeof testImportChunked;
  testRecuperoStoricoAlunno: typeof testRecuperoStoricoAlunno;
  testRecuperoStoricoClasse: typeof testRecuperoStoricoClasse;
  testRecuperoStoricoDocumenti: typeof testRecuperoStoricoDocumenti;
  testArticolazione: typeof testArticolazione;
  testITPeMateriePuntate: typeof testITPeMateriePuntate;
  testSupplenzeERuoli: typeof testSupplenzeERuoli;
  testACLReali: typeof testACLReali;
  testCacheIsolamento: typeof testCacheIsolamento;
  testPermessiAttivi: typeof testPermessiAttivi;
  runFullOnlineTests: typeof runFullOnlineTests;
  dumpOnlineCoverage: typeof dumpOnlineCoverage;
};

gasGlobal.__ALDO_ONLINE_TESTS_LAUNCHERS__ = aldoOnlineTestsLaunchers;
gasGlobal.creaDatiMockDrive = () => creaDatiMockDrive();
gasGlobal.testDocumentiStandard = testDocumentiStandard;
gasGlobal.testDocumentiArticolati = testDocumentiArticolati;
gasGlobal.testDocumentiTabelleImportate = testDocumentiTabelleImportate;
gasGlobal.testDuplicazioneDocumenti = testDuplicazioneDocumenti;
gasGlobal.testInvioEmail = testInvioEmail;
gasGlobal.testEmailSicurezza = testEmailSicurezza;
gasGlobal.testJobRunnerDocGen = testJobRunnerDocGen;
gasGlobal.testJobRunnerEmail = testJobRunnerEmail;
gasGlobal.testJobRunnerTriggerReale = testJobRunnerTriggerReale;
gasGlobal.testImportFileSingolo = testImportFileSingolo;
gasGlobal.testImportCartelleClasse = testImportCartelleClasse;
gasGlobal.testImportCercaDocumenti = testImportCercaDocumenti;
gasGlobal.testImportChunked = testImportChunked;
gasGlobal.testRecuperoStoricoAlunno = testRecuperoStoricoAlunno;
gasGlobal.testRecuperoStoricoClasse = testRecuperoStoricoClasse;
gasGlobal.testRecuperoStoricoDocumenti = testRecuperoStoricoDocumenti;
gasGlobal.testArticolazione = testArticolazione;
gasGlobal.testITPeMateriePuntate = testITPeMateriePuntate;
gasGlobal.testSupplenzeERuoli = testSupplenzeERuoli;
gasGlobal.testACLReali = testACLReali;
gasGlobal.testCacheIsolamento = testCacheIsolamento;
gasGlobal.testPermessiAttivi = testPermessiAttivi;
gasGlobal.runFullOnlineTests = runFullOnlineTests;
gasGlobal.dumpOnlineCoverage = dumpOnlineCoverage;
