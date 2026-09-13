// User-editable examples. This file remains readable in production as
// EntryPoints_User.gs.

declare function menu_avvioGenerazioneChunked(configId: string): void;
declare function menu_avvioComunicazioniChunked(patternId: string): void;
declare function menu_avvioImportazioneChunked(configId: string): void;
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

// ── GENERAZIONE DOCUMENTI ────────────────────────────────────────────

/** Example: start resumable CONF_DOC recipe "PIANI_PERSONALIZZATI". */
function generaPianiPersonalizzati(): void {
  menu_avvioGenerazioneChunked('PIANI_PERSONALIZZATI');
}

/** Example: start resumable CONF_DOC recipe "PIANO_LAVORO". */
function generaPianoLavoro(): void {
  menu_avvioGenerazioneChunked('PIANO_LAVORO');
}

/** Example: start resumable CONF_DOC recipe "VERBALE_CDC_OTTOBRE". */
function generaVerbaleCdcOttobre(): void {
  menu_avvioGenerazioneChunked('VERBALE_CDC_OTTOBRE');
}

/** Example: start resumable CONF_DOC recipe "VERBALE_CDC_NOVEMBRE". */
function generaVerbaleCdcNovembre(): void {
  menu_avvioGenerazioneChunked('VERBALE_CDC_NOVEMBRE');
}

/** Example: start resumable CONF_DOC recipe "VERBALE_CDC_FEBBRAIO". */
function generaVerbaleCdcFebbraio(): void {
  menu_avvioGenerazioneChunked('VERBALE_CDC_FEBBRAIO');
}

/** Example: start resumable CONF_DOC recipe "VERBALE_CDC_APRILE". */
function generaVerbaleCdcAprile(): void {
  menu_avvioGenerazioneChunked('VERBALE_CDC_APRILE');
}

/** Example: start resumable CONF_DOC recipe "VERBALE_CDC_MAGGIO". */
function generaVerbaleCdcMaggio(): void {
  menu_avvioGenerazioneChunked('VERBALE_CDC_MAGGIO');
}

/** Example: start resumable CONF_DOC recipe "FSL". */
function generaFsl(): void {
  menu_avvioGenerazioneChunked('FSL');
}

/** Example: start resumable CONF_DOC recipe "CONDOTTA". */
function generaCondotta(): void {
  menu_avvioGenerazioneChunked('CONDOTTA');
}

/** Example: start resumable CONF_DOC recipe "COMPETENZE". */
function generaCompetenze(): void {
  menu_avvioGenerazioneChunked('COMPETENZE');
}

/** Example: start resumable CONF_DOC recipe "CARENZE_SEGNALATORE_NOVEMBRE". */
function generaCarenzeSegnalatoreNovembre(): void {
  menu_avvioGenerazioneChunked('CARENZE_SEGNALATORE_NOVEMBRE');
}

/** Example: start resumable CONF_DOC recipe "CARENZE_SEGNALATORE_FEBBRAIO". */
function generaCarenzeSegnalatoreFebbraio(): void {
  menu_avvioGenerazioneChunked('CARENZE_SEGNALATORE_FEBBRAIO');
}

/** Example: start resumable CONF_DOC recipe "CARENZE_SEGNALATORE_APRILE". */
function generaCarenzeSegnalatoreAprile(): void {
  menu_avvioGenerazioneChunked('CARENZE_SEGNALATORE_APRILE');
}

/** Example: start resumable CONF_DOC recipe "RELAZIONE_FINALE". */
function generaRelazioneFinale(): void {
  menu_avvioGenerazioneChunked('RELAZIONE_FINALE');
}

/** Example: start resumable CONF_DOC recipe "PROGRAMMA". */
function generaProgramma(): void {
  menu_avvioGenerazioneChunked('PROGRAMMA');
}

/** Example: start resumable CONF_DOC recipe "PROGRAMMA_RELAZIONE_QUINTE". */
function generaProgrammaRelazioneQuinte(): void {
  menu_avvioGenerazioneChunked('PROGRAMMA_RELAZIONE_QUINTE');
}

/** Example: start resumable CONF_DOC recipe "DOC15MAGGIO". */
function generaDoc15Maggio(): void {
  menu_avvioGenerazioneChunked('DOC15MAGGIO');
}

// ── INVIO EMAIL ──────────────────────────────────────────────────────

/** Example: start resumable CONF_MAIL recipe "CDC_OTTOBRE_COORDINATORI". */
function inviaCdcOttobreCoordinatori(): void {
  menu_avvioComunicazioniChunked('CDC_OTTOBRE_COORDINATORI');
}

/** Example: start resumable CONF_MAIL recipe "CDC_NOVEMBRE_COORDINATORI". */
function inviaCdcNovembreCoordinatori(): void {
  menu_avvioComunicazioniChunked('CDC_NOVEMBRE_COORDINATORI');
}

/** Example: start resumable CONF_MAIL recipe "CDC_FEBBRAIO_COORDINATORI". */
function inviaCdcFebbraioCoordinatori(): void {
  menu_avvioComunicazioniChunked('CDC_FEBBRAIO_COORDINATORI');
}

/** Example: start resumable CONF_MAIL recipe "CDC_APRILE_COORDINATORI". */
function inviaCdcAprileCoordinatori(): void {
  menu_avvioComunicazioniChunked('CDC_APRILE_COORDINATORI');
}

/** Example: start resumable CONF_MAIL recipe "CDC_MAGGIO_COORDINATORI". */
function inviaCdcMaggioCoordinatori(): void {
  menu_avvioComunicazioniChunked('CDC_MAGGIO_COORDINATORI');
}

/** Example: start resumable CONF_MAIL recipe "DOC_PERSONALIZZATI_COORDINATORI". */
function inviaDocPersonalizzatiCoordinatori(): void {
  menu_avvioComunicazioniChunked('DOC_PERSONALIZZATI_COORDINATORI');
}

/** Example: start resumable CONF_MAIL recipe "FSL_DOCENTI_ELENCO_VALUTATORI". */
function inviaFslDocentiElencoValutatori(): void {
  menu_avvioComunicazioniChunked('FSL_DOCENTI_ELENCO_VALUTATORI');
}

/** Example: start resumable CONF_MAIL recipe "RIEPILOGO_FSL_ALUNNO". */
function inviaRiepilogoFslAlunno(): void {
  menu_avvioComunicazioniChunked('RIEPILOGO_FSL_ALUNNO');
}

/** Example: start resumable CONF_MAIL recipe "INVIO_CARENZE_NOVEMBRE". */
function inviaCarenzeNovembre(): void {
  menu_avvioComunicazioniChunked('INVIO_CARENZE_NOVEMBRE');
}

/** Example: start resumable CONF_MAIL recipe "INVIO_CARENZE_FEBBRAIO". */
function inviaCarenzeFebbraio(): void {
  menu_avvioComunicazioniChunked('INVIO_CARENZE_FEBBRAIO');
}

/** Example: start resumable CONF_MAIL recipe "NOTIFICA_CARENZE_FAMIGLIE_FEBBRAIO". */
function notificaCarenzeFamiglieFebbraio(): void {
  menu_avvioComunicazioniChunked('NOTIFICA_CARENZE_FAMIGLIE_FEBBRAIO');
}

/** Example: start resumable CONF_MAIL recipe "NOTIFICA_CARENZE_FAMIGLIE_MARZO". */
function notificaCarenzeFamiglieMarzo(): void {
  menu_avvioComunicazioniChunked('NOTIFICA_CARENZE_FAMIGLIE_MARZO');
}

/** Example: start resumable CONF_MAIL recipe "INVIO_CARTELLE_15_MAG". */
function inviaCartelle15Mag(): void {
  menu_avvioComunicazioniChunked('INVIO_CARTELLE_15_MAG');
}

/** Example: start resumable CONF_MAIL recipe "INVIO_DOCS_FINE_ANNO". */
function inviaDocsFineAnno(): void {
  menu_avvioComunicazioniChunked('INVIO_DOCS_FINE_ANNO');
}

/** Example: start resumable CONF_MAIL recipe "COMPOSIZIONE_CATTEDRE_DOCENTI". */
function inviaComposizioneCattedreDocenti(): void {
  menu_avvioComunicazioniChunked('COMPOSIZIONE_CATTEDRE_DOCENTI');
}

// ── IMPORTAZIONI ─────────────────────────────────────────────────────

/** Example: start resumable CONF_IMP recipe "IMPORT_CARENZE_FEBBRAIO". */
function importaCarenzeFebbraioChunked(): void {
  menu_avvioImportazioneChunked('IMPORT_CARENZE_FEBBRAIO');
}

/** Example: start resumable CONF_IMP recipe "IMPORT_CARENZE_MARZO". */
function importaCarenzeMarzoChunked(): void {
  menu_avvioImportazioneChunked('IMPORT_CARENZE_MARZO');
}

/** Example: start resumable CONF_IMP recipe "IMPORT_FSL_FINEANNO". */
function importaFslFineAnnoChunked(): void {
  menu_avvioImportazioneChunked('IMPORT_FSL_FINEANNO');
}

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

/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access */
// ── GENERAZIONE DOCUMENTI
(globalThis as any).generaPianiPersonalizzati = generaPianiPersonalizzati;
(globalThis as any).generaPianoLavoro = generaPianoLavoro;
(globalThis as any).generaVerbaleCdcOttobre = generaVerbaleCdcOttobre;
(globalThis as any).generaVerbaleCdcNovembre = generaVerbaleCdcNovembre;
(globalThis as any).generaVerbaleCdcFebbraio = generaVerbaleCdcFebbraio;
(globalThis as any).generaVerbaleCdcAprile = generaVerbaleCdcAprile;
(globalThis as any).generaVerbaleCdcMaggio = generaVerbaleCdcMaggio;
(globalThis as any).generaFsl = generaFsl;
(globalThis as any).generaCondotta = generaCondotta;
(globalThis as any).generaCompetenze = generaCompetenze;
(globalThis as any).generaCarenzeSegnalatoreNovembre = generaCarenzeSegnalatoreNovembre;
(globalThis as any).generaCarenzeSegnalatoreFebbraio = generaCarenzeSegnalatoreFebbraio;
(globalThis as any).generaCarenzeSegnalatoreAprile = generaCarenzeSegnalatoreAprile;
(globalThis as any).generaRelazioneFinale = generaRelazioneFinale;
(globalThis as any).generaProgramma = generaProgramma;
(globalThis as any).generaProgrammaRelazioneQuinte = generaProgrammaRelazioneQuinte;
(globalThis as any).generaDoc15Maggio = generaDoc15Maggio;
// ── INVIO EMAIL
(globalThis as any).inviaCdcOttobreCoordinatori = inviaCdcOttobreCoordinatori;
(globalThis as any).inviaCdcNovembreCoordinatori = inviaCdcNovembreCoordinatori;
(globalThis as any).inviaCdcFebbraioCoordinatori = inviaCdcFebbraioCoordinatori;
(globalThis as any).inviaCdcAprileCoordinatori = inviaCdcAprileCoordinatori;
(globalThis as any).inviaCdcMaggioCoordinatori = inviaCdcMaggioCoordinatori;
(globalThis as any).inviaDocPersonalizzatiCoordinatori = inviaDocPersonalizzatiCoordinatori;
(globalThis as any).inviaFslDocentiElencoValutatori = inviaFslDocentiElencoValutatori;
(globalThis as any).inviaRiepilogoFslAlunno = inviaRiepilogoFslAlunno;
(globalThis as any).inviaCarenzeNovembre = inviaCarenzeNovembre;
(globalThis as any).inviaCarenzeFebbraio = inviaCarenzeFebbraio;
(globalThis as any).notificaCarenzeFamiglieFebbraio = notificaCarenzeFamiglieFebbraio;
(globalThis as any).notificaCarenzeFamiglieMarzo = notificaCarenzeFamiglieMarzo;
(globalThis as any).inviaCartelle15Mag = inviaCartelle15Mag;
(globalThis as any).inviaDocsFineAnno = inviaDocsFineAnno;
(globalThis as any).inviaComposizioneCattedreDocenti = inviaComposizioneCattedreDocenti;
// ── IMPORTAZIONI
(globalThis as any).importaCarenzeFebbraioChunked = importaCarenzeFebbraioChunked;
(globalThis as any).importaCarenzeMarzoChunked = importaCarenzeMarzoChunked;
(globalThis as any).importaFslFineAnnoChunked = importaFslFineAnnoChunked;
// ── VALIDAZIONE DATABASE
(globalThis as any).validazioneDatabase = validazioneDatabase;
// ── AZIONI
(globalThis as any).avviaAzione = avviaAzione;
(globalThis as any).avviaTutteAzioni = avviaTutteAzioni;
/* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access */
