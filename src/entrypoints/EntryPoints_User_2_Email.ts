// User-editable examples — invio email (CONF_MAIL). Remains readable in
// production as EntryPoints_User_2_Email.gs (see EntryPoints_User_1_Doc.ts
// for the filename-ordinal note).

declare function menu_avvioComunicazioniChunked(patternId: string): void;

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

/** Example: start resumable CONF_MAIL recipe "CDC_MARZO_COORDINATORI". */
function inviaCdcMarzoCoordinatori(): void {
  menu_avvioComunicazioniChunked('CDC_MARZO_COORDINATORI');
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

/** Example: start resumable CONF_MAIL recipe "INVIO_CARENZE_SEGNALATORE_NOVEMBRE". */
function inviaCarenzeSegnalatoreNovembre(): void {
  menu_avvioComunicazioniChunked('INVIO_CARENZE_SEGNALATORE_NOVEMBRE');
}

/** Example: start resumable CONF_MAIL recipe "INVIO_CARENZE_SEGNALATORE_FEBBRAIO". */
function inviaCarenzeSegnalatoreFebbraio(): void {
  menu_avvioComunicazioniChunked('INVIO_CARENZE_SEGNALATORE_FEBBRAIO');
}

/** Example: start resumable CONF_MAIL recipe "INVIO_CARENZE_SEGNALATORE_APRILE". */
function inviaCarenzeSegnalatoreAprile(): void {
  menu_avvioComunicazioniChunked('INVIO_CARENZE_SEGNALATORE_APRILE');
}

/** Example: start resumable CONF_MAIL recipe "NOTIFICA_CARENZE_FAMIGLIE_FEBBRAIO". */
function notificaCarenzeFamiglieFebbraio(): void {
  menu_avvioComunicazioniChunked('NOTIFICA_CARENZE_FAMIGLIE_FEBBRAIO');
}

/** Example: start resumable CONF_MAIL recipe "NOTIFICA_CARENZE_FAMIGLIE_MARZO". */
function notificaCarenzeFamiglieMarzo(): void {
  menu_avvioComunicazioniChunked('NOTIFICA_CARENZE_FAMIGLIE_MARZO');
}

/** Example: start resumable CONF_MAIL recipe "NOTIFICA_CARENZE_FAMIGLIE_APRILE". */
function notificaCarenzeFamiglieAprile(): void {
  menu_avvioComunicazioniChunked('NOTIFICA_CARENZE_FAMIGLIE_APRILE');
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

/** Example: start resumable CONF_MAIL recipe "DATI_INIZIO_ANNO". */
function inviaDatiInizioAnno(): void {
  menu_avvioComunicazioniChunked('DATI_INIZIO_ANNO');
}

/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access */
(globalThis as any).inviaCdcOttobreCoordinatori = inviaCdcOttobreCoordinatori;
(globalThis as any).inviaCdcNovembreCoordinatori = inviaCdcNovembreCoordinatori;
(globalThis as any).inviaCdcFebbraioCoordinatori = inviaCdcFebbraioCoordinatori;
(globalThis as any).inviaCdcMarzoCoordinatori = inviaCdcMarzoCoordinatori;
(globalThis as any).inviaCdcAprileCoordinatori = inviaCdcAprileCoordinatori;
(globalThis as any).inviaCdcMaggioCoordinatori = inviaCdcMaggioCoordinatori;
(globalThis as any).inviaDocPersonalizzatiCoordinatori = inviaDocPersonalizzatiCoordinatori;
(globalThis as any).inviaFslDocentiElencoValutatori = inviaFslDocentiElencoValutatori;
(globalThis as any).inviaRiepilogoFslAlunno = inviaRiepilogoFslAlunno;
(globalThis as any).inviaCarenzeNovembre = inviaCarenzeNovembre;
(globalThis as any).inviaCarenzeFebbraio = inviaCarenzeFebbraio;
(globalThis as any).inviaCarenzeSegnalatoreNovembre = inviaCarenzeSegnalatoreNovembre;
(globalThis as any).inviaCarenzeSegnalatoreFebbraio = inviaCarenzeSegnalatoreFebbraio;
(globalThis as any).inviaCarenzeSegnalatoreAprile = inviaCarenzeSegnalatoreAprile;
(globalThis as any).notificaCarenzeFamiglieFebbraio = notificaCarenzeFamiglieFebbraio;
(globalThis as any).notificaCarenzeFamiglieMarzo = notificaCarenzeFamiglieMarzo;
(globalThis as any).notificaCarenzeFamiglieAprile = notificaCarenzeFamiglieAprile;
(globalThis as any).inviaCartelle15Mag = inviaCartelle15Mag;
(globalThis as any).inviaDocsFineAnno = inviaDocsFineAnno;
(globalThis as any).inviaComposizioneCattedreDocenti = inviaComposizioneCattedreDocenti;
(globalThis as any).inviaDatiInizioAnno = inviaDatiInizioAnno;
/* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access */
