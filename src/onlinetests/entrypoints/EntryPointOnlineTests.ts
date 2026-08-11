/**
 * EntryPointOnlineTests — launcher GAS leggibili per gli online test (design
 * 2026-08-10). Chiamano SOLO globals ambient esposti da OnlineTests.js; nessun
 * import: webpack manterrebbe duplicati i moduli nei due bundle GAS.
 */
const gasGlobal = globalThis as typeof globalThis & {
  creaDatiMockDrive: () => unknown;
  runFullOnlineTests: () => unknown;
  dumpOnlineCoverage: () => void;
};

export function creaDatiMockDrive(): unknown {
  return gasGlobal.creaDatiMockDrive();
}

export function runFullOnlineTests(): unknown {
  return gasGlobal.runFullOnlineTests();
}

export function dumpOnlineCoverage(): void {
  return gasGlobal.dumpOnlineCoverage();
}
