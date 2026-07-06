// ALDO entry points (15 §2-§5). GAS calls top-level global functions by name;
// gas-webpack-plugin hoists the `(globalThis as any).<name> = ...` assignments
// to true globals. Everything below is delegation: onOpen builds the menu only
// (no DI init, 15 §2); menu wrappers collect input and delegate to the
// data-driven launchers of Bootstrap; `resumeJob` is the JobRunnerLib timed
// trigger target (the library resolves the suspended job from the trigger id).
import {
  initAldo,
  creaJobRunner,
  avviaGenerazioneDataDriven,
  avviaInvioNotificheDataDriven,
  avviaImportazioneDataDriven,
  riprendiJobSospeso
} from './config/Bootstrap';
import { costruisciMenu, menuGenerazioneDocumenti, menuComunicazioniEmail, menuImportazioni } from './presentation/Menu';
import { GasUiFacade } from './infrastructure/facades/UiFacade';

export function aldoPing(): string {
  return 'ALDO OK';
}

export function onOpen(): void {
  costruisciMenu(new GasUiFacade());
}

export function menu_avvioGenerazioneDocumenti(): void {
  menuGenerazioneDocumenti(new GasUiFacade(), (configId) =>
    avviaGenerazioneDataDriven(initAldo(), configId, creaJobRunner())
  );
}

export function menu_avvioComunicazioniEmail(): void {
  menuComunicazioniEmail(new GasUiFacade(), (patternId) =>
    avviaInvioNotificheDataDriven(initAldo(), patternId, creaJobRunner())
  );
}

export function menu_avvioImportazioni(): void {
  menuImportazioni(new GasUiFacade(), (configId) => avviaImportazioneDataDriven(initAldo(), configId));
}

/** JobRunnerLib resume trigger target (15 §5): the job name is resolved from the trigger context. */
export function resumeJob(): void {
  riprendiJobSospeso(initAldo(), creaJobRunner());
}

/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access */
(globalThis as any).aldoPing = aldoPing;
(globalThis as any).onOpen = onOpen;
(globalThis as any).menu_avvioGenerazioneDocumenti = menu_avvioGenerazioneDocumenti;
(globalThis as any).menu_avvioComunicazioniEmail = menu_avvioComunicazioniEmail;
(globalThis as any).menu_avvioImportazioni = menu_avvioImportazioni;
(globalThis as any).resumeJob = resumeJob;
/* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access */
