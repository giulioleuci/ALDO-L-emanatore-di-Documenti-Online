// User-editable examples — azioni standalone (CONF_AZIONI) e validazione
// database. Remains readable in production as EntryPoints_User_3_Azioni.gs
// (see EntryPoints_User_1_Doc.ts for the filename-ordinal note). CONF_AZIONI
// rows referenced below are documented in SPECS_ALDO/00_AZIONI.md.

declare function initAldo(now?: Date, props?: unknown): unknown;
declare function avviaValidazioneDatabase(container: unknown): {
  violazioni: unknown[];
  spreadsheetId: string;
  nome: string;
};
declare function elencoAzioniAttive(container: unknown): Array<{ id: string; tipo: string }>;
declare function avviaAzioniDataDriven(
  container: unknown,
  azioneIds: string[],
  runner: unknown,
  maxDurationMs?: number
): unknown;
declare function creaJobRunner(): JobRunnerService;

// ── VALIDAZIONE DATABASE ────────────────────────────────────────────

/** Manual, UI-free launch of the current-year database validation. */
function validazioneDatabase(): void {
  const esito = avviaValidazioneDatabase(initAldo());
  Logger.log(
    esito.violazioni.length === 0
      ? `Validazione database: nessun errore rilevato. Report: ${esito.nome}`
      : `Validazione database: ${esito.violazioni.length} violazioni. Report: ${esito.nome}`
  );
}

// ── AZIONI ───────────────────────────────────────────────────────────

/** UI-free launch of one CONF_AZIONI action by id. Future scheduled triggers point here. */
function avviaAzione(id: string): void {
  avviaAzioniDataDriven(initAldo(), [id], creaJobRunner());
}

/** UI-free launch of every enabled CONF_AZIONI action. */
function avviaTutteAzioni(): void {
  const container = initAldo();
  const ids = elencoAzioniAttive(container).map((azione) => azione.id);
  if (ids.length === 0) {
    Logger.log('Esecuzione azioni: nessuna azione attiva in CONF_AZIONI.');
    return;
  }
  avviaAzioniDataDriven(container, ids, creaJobRunner());
}

/** Example: realigns PIANI_PERS ACLs (COORDINATORI) to the live cattedra roster — CONF_AZIONI "ALLINEA_PERMESSI_DOC_PERS". */
function azioneAggiornaPermessiDocPers(): void {
  avviaAzione('ALLINEA_PERMESSI_DOC_PERS');
}

/** Example: realigns PIANO_LAVORO ACLs (COORDINATORI) to the live cattedra roster — CONF_AZIONI "ALLINEA_PERMESSI_PIANO_LAVORO". */
function azioneAggiornaPermessiPianoLavoro(): void {
  avviaAzione('ALLINEA_PERMESSI_PIANO_LAVORO');
}

/** Example: realigns VERBALE ACLs (CDC), on both documents and folder, to the live cattedra roster — CONF_AZIONI "ALLINEA_PERMESSI_VERBALI". */
function azioneAggiornaPermessiVerbali(): void {
  avviaAzione('ALLINEA_PERMESSI_VERBALI');
}

/** Example: caps every document ACL at LETTURA, across the whole archive — CONF_AZIONI "RIDUCI_LETTURA_TUTTI_DOCUMENTI". */
function azioneRiduciASolaLetturaTuttiDocumenti(): void {
  avviaAzione('RIDUCI_LETTURA_TUTTI_DOCUMENTI');
}

/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access */
(globalThis as any).validazioneDatabase = validazioneDatabase;
(globalThis as any).avviaAzione = avviaAzione;
(globalThis as any).avviaTutteAzioni = avviaTutteAzioni;
(globalThis as any).azioneAggiornaPermessiDocPers = azioneAggiornaPermessiDocPers;
(globalThis as any).azioneAggiornaPermessiPianoLavoro = azioneAggiornaPermessiPianoLavoro;
(globalThis as any).azioneAggiornaPermessiVerbali = azioneAggiornaPermessiVerbali;
(globalThis as any).azioneRiduciASolaLetturaTuttiDocumenti = azioneRiduciASolaLetturaTuttiDocumenti;
/* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access */
