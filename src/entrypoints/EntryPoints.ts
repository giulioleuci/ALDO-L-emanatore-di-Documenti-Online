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
  function avviaGenerazioneDataDriven(c: ServiceContainer, configId: string, runner: JobRunnerService): unknown;
  function avviaInvioNotificheDataDriven(c: ServiceContainer, patternId: string, runner: JobRunnerService): unknown;
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

/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access */
(globalThis as any).menu_avvioGenerazioneDocumenti = menu_avvioGenerazioneDocumenti;
(globalThis as any).menu_avvioComunicazioniEmail = menu_avvioComunicazioniEmail;
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
