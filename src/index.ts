// ALDO entry points (15 §2-§5). GAS calls top-level global functions by name;
// gas-webpack-plugin hoists the `(globalThis as any).<name> = ...` assignments
// to true globals. Everything below is delegation: onOpen builds the menu only
// (no DI init, 15 §2); menu_avvioImportazioni is a data-driven launcher wrapper;
// `resumeJob` is the JobRunnerLib timed trigger target (the library resolves the
// suspended job from the trigger id). The document-generation and email-sending
// launchers live in src/entrypoints/EntryPoints.ts, a separate, human-readable
// GAS script file — this file exposes the identifiers that file calls as true
// globals (GAS shares one global namespace across every script file).
import {
  initAldo,
  creaJobRunner,
  avviaGenerazioneDataDriven,
  avviaInvioNotificheDataDriven,
  avviaRetryEmailDataDriven,
  avviaImportazioneDataDriven,
  riprendiJobSospeso,
  PROP_MASTER_SPREADSHEET_ID
} from './config/Bootstrap';
import {
  costruisciMenu,
  menuGenerazioneDocumenti,
  menuComunicazioniEmail,
  menuImportazioni
} from './presentation/Menu';
import { GasUiFacade } from './infrastructure/facades/UiFacade';
import { ScriptPropertiesFacade } from './infrastructure/facades/PropertiesFacade';

export function aldoPing(): string {
  return 'ALDO OK';
}

/**
 * One-time manual bootstrap (setup script, spec 3): run once from the Apps Script editor's
 * Run dropdown after the first push to a MASTER-bound project. Reads this script's own bound
 * container id via the vendored SpreadsheetService escape hatch (never SpreadsheetApp
 * directly) and writes it to ScriptProperties — the value initAldo() requires on every
 * subsequent execution (Bootstrap.ts:275-280).
 */
export function impostaMasterSpreadsheetId(): void {
  const id = ServiceFactory.getSpreadsheetService().getActiveStandard().getId();
  new ScriptPropertiesFacade().set(PROP_MASTER_SPREADSHEET_ID, id);
}

export function onOpen(): void {
  costruisciMenu(new GasUiFacade());
}

export function menu_avvioImportazioni(): void {
  menuImportazioni(new GasUiFacade(), (configId) =>
    avviaImportazioneDataDriven(initAldo(), configId)
  );
}

/**
 * JobRunnerLib resume trigger target (15 §5): the job name is resolved from the trigger
 * context. Runs unattended (no UI, no operator watching) — unlike the interactive launchers
 * in Menu.ts, a thrown ConfigurationError here must be logged rather than vanish into the
 * trigger's execution log, mirroring Menu.ts's avvioPersonalizzato error-surfacing (ref
 * analysis_3_structural_errors.md Finding 2).
 */
export function resumeJob(): void {
  try {
    riprendiJobSospeso(initAldo(), creaJobRunner());
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`resumeJob: ripresa job fallita — ${message}`);
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access */
(globalThis as any).aldoPing = aldoPing;
(globalThis as any).impostaMasterSpreadsheetId = impostaMasterSpreadsheetId;
(globalThis as any).onOpen = onOpen;
(globalThis as any).menu_avvioImportazioni = menu_avvioImportazioni;
(globalThis as any).resumeJob = resumeJob;

// Exposed for src/entrypoints/EntryPoints.ts (production split build, docs/superpowers/specs/2026-07-11-production-split-build-design.md):
// that file calls these by name as ambient globals instead of importing them,
// so it stays a small, standalone, human-readable GAS script file.
(globalThis as any).initAldo = initAldo;
(globalThis as any).creaJobRunner = creaJobRunner;
(globalThis as any).avviaGenerazioneDataDriven = avviaGenerazioneDataDriven;
(globalThis as any).avviaInvioNotificheDataDriven = avviaInvioNotificheDataDriven;
(globalThis as any).avviaRetryEmailDataDriven = avviaRetryEmailDataDriven;
(globalThis as any).menuGenerazioneDocumenti = menuGenerazioneDocumenti;
(globalThis as any).menuComunicazioniEmail = menuComunicazioniEmail;
(globalThis as any).GasUiFacade = GasUiFacade;
/* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access */
