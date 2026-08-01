// ALDO document-generation / email-sending entry points (15 §2-§5).
//
// This file is deliberately kept separate from the rest of the ALDO bundle
// and shipped UNMINIFIED with comments in production builds (see
// docs/superpowers/specs/2026-07-11-production-split-build-design.md) so a
// human can open it directly in the Apps Script editor, read what each
// function does, and run one manually — either via the "AVVIA PROCESSI" menu
// (the two interactive functions below) or by selecting a specific launcher
// from the editor's "Run" dropdown (the non-interactive examples further
// down).
//
// It does not import any ALDO/library code. Everything it calls is declared
// as an ambient global below and provided at runtime by src/index.ts, which
// is bundled separately and loaded first — GAS shares one global namespace
// across every script file in a project, exactly like this project's other
// vendored-library ambient globals (see types/gaslibs/index.d.ts).

import type { IUiFacade } from '../infrastructure/facades/UiFacade';
import type { ServiceContainer } from '../config/ServiceContainer';

declare global {
  function initAldo(now?: Date, props?: unknown): ServiceContainer;
  function creaJobRunner(): JobRunnerService;
  function avviaGenerazioneDataDriven(
    c: ServiceContainer,
    configId: string,
    runner: JobRunnerService
  ): unknown;
  function avviaInvioNotificheDataDriven(
    c: ServiceContainer,
    patternId: string,
    runner: JobRunnerService
  ): unknown;
  function avviaRetryEmailDataDriven(c: ServiceContainer, runner: JobRunnerService): unknown;
  function avviaImportazioneChunkedDataDriven(
    c: ServiceContainer,
    configId: string,
    runner: JobRunnerService
  ): unknown;
  function menuGenerazioneDocumenti(ui: IUiFacade, avvia: (configId: string) => void): void;
  function menuComunicazioniEmail(ui: IUiFacade, avvia: (patternId: string) => void): void;
  const GasUiFacade: new () => IUiFacade;
}

/** Menu wrapper (15 §4): prompts for a CONF_DOC.ID, then starts batch document generation. */
function menu_avvioGenerazioneDocumenti(): void {
  menuGenerazioneDocumenti(new GasUiFacade(), (configId) =>
    avviaGenerazioneDataDriven(initAldo(), configId, creaJobRunner())
  );
}

/** Menu wrapper (15 §4): prompts for a CONF_MAIL.ID, then starts a mass email send. */
function menu_avvioComunicazioniEmail(): void {
  menuComunicazioniEmail(new GasUiFacade(), (patternId) =>
    avviaInvioNotificheDataDriven(initAldo(), patternId, creaJobRunner())
  );
}

/**
 * Launcher (15 §4, 11 §16): scheduled retry of failed LOG_MAIL sends. Unlike
 * the two wrappers above it takes no configuration id to prompt for, so
 * there is no `avvioPersonalizzato` dialog step and — deliberately — no
 * entry in Menu.ts's AVVIA PROCESSI menu: retry is meant to run unattended
 * from a time-driven trigger calling this function by name, not from the
 * interactive UI.
 */
function menu_avvioRetryEmail(): void {
  avviaRetryEmailDataDriven(initAldo(), creaJobRunner());
}

/**
 * Launcher (15 §4, GasDataImporter.md "Resumable/chunked imports"): chunked,
 * resumable ETL import for one CONF_IMP recipe. Like `menu_avvioRetryEmail`
 * above, this is meant to run unattended from the Apps Script editor's "Run"
 * dropdown (or a trigger) rather than the interactive UI — deliberately no
 * entry in Menu.ts's AVVIA PROCESSI menu. `menu_avvioImportazioni` (the
 * synchronous, dialog-driven launcher) remains the default/primary path;
 * this one is an alternative for recipes whose source can exceed a single
 * GAS execution window, not a replacement — see `ImportService`'s class
 * docstring for the Ghost Record Detection gap this path does not yet cover.
 * Unlike the zero-argument retry launcher, a chunked import always targets
 * one recipe, so this takes `configId` directly (edit the call site below,
 * or copy it, before relying on it against a live recipe).
 */
function menu_avvioImportazioneChunked(configId: string): void {
  avviaImportazioneChunkedDataDriven(initAldo(), configId, creaJobRunner());
}

/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access */
(globalThis as any).menu_avvioGenerazioneDocumenti = menu_avvioGenerazioneDocumenti;
(globalThis as any).menu_avvioComunicazioniEmail = menu_avvioComunicazioniEmail;
(globalThis as any).menu_avvioRetryEmail = menu_avvioRetryEmail;
(globalThis as any).menu_avvioImportazioneChunked = menu_avvioImportazioneChunked;
/* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access */

// ---------------------------------------------------------------------------
// Non-interactive launchers — one per document/email pattern.
//
// The two functions above prompt for a CONF_DOC.ID / CONF_MAIL.ID via a
// dialog. Once a document type or email pattern is stable, copy one of the
// examples below, rename it, and hardcode its id — that gives you a single
// function you can run directly from the Apps Script editor's "Run" dropdown
// (or wire to a time-driven trigger), with no dialog prompt.
//
// Example — replace 'PAGELLE_1Q' / 'ASSENZE_SETTIMANALI' with a real row id
// from CONF_DOC / CONF_MAIL before relying on these two functions; they are
// templates, not verified against live configuration data.
// ---------------------------------------------------------------------------

/** Launches document generation for the CONF_DOC row "PAGELLE_1Q" (example — edit the id before use). */
function generaPagelle(): void {
  avviaGenerazioneDataDriven(initAldo(), 'PAGELLE_1Q', creaJobRunner());
}

/** Sends the CONF_MAIL "ASSENZE_SETTIMANALI" notification pattern (example — edit the id before use). */
function inviaNotificaAssenze(): void {
  avviaInvioNotificheDataDriven(initAldo(), 'ASSENZE_SETTIMANALI', creaJobRunner());
}

/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access */
(globalThis as any).generaPagelle = generaPagelle;
(globalThis as any).inviaNotificaAssenze = inviaNotificaAssenze;
/* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access */
