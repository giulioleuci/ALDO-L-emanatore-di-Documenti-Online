// User-editable examples. This file remains readable in production as
// EntryPoints_User.gs.

declare function initAldo(now?: Date, props?: unknown): unknown;
declare function creaJobRunner(): JobRunnerService;
declare function avviaGenerazioneDataDriven(
  container: unknown,
  configId: string,
  runner: JobRunnerService,
  maxDurationMs?: number
): unknown;
declare function avviaInvioNotificheDataDriven(
  container: unknown,
  patternId: string,
  runner: JobRunnerService,
  maxDurationMs?: number
): unknown;
declare function menu_avvioImportazioneChunked(configId: string): void;



/** Example: launch document generation for CONF_DOC row "PIANI_PERSONALIZZATI". */
function generaPianiPersonalizzati(): void {
  avviaGenerazioneDataDriven(
    initAldo(),
    'PIANI_PERSONALIZZATI',
    creaJobRunner(),
    (globalThis as { MAX_JOB_EXECUTION_TIME_MS?: number }).MAX_JOB_EXECUTION_TIME_MS
  );
}

/** Example: launch document generation for CONF_DOC row "PIANO_LAVORO". */
function generaPianoLavoro(): void {
  avviaGenerazioneDataDriven(
    initAldo(),
    'PIANO_LAVORO',
    creaJobRunner(),
    (globalThis as { MAX_JOB_EXECUTION_TIME_MS?: number }).MAX_JOB_EXECUTION_TIME_MS
  );
}

/** Example: launch document generation for CONF_DOC row "VERBALE_CDC_OTTOBRE". */
function generaVerbaleCdcOttobre(): void {
  avviaGenerazioneDataDriven(
    initAldo(),
    'VERBALE_CDC_OTTOBRE',
    creaJobRunner(),
    (globalThis as { MAX_JOB_EXECUTION_TIME_MS?: number }).MAX_JOB_EXECUTION_TIME_MS
  );
}

/** Example: launch document generation for CONF_DOC row "VERBALE_CDC_NOVEMBRE". */
function generaVerbaleCdcNovembre(): void {
  avviaGenerazioneDataDriven(
    initAldo(),
    'VERBALE_CDC_NOVEMBRE',
    creaJobRunner(),
    (globalThis as { MAX_JOB_EXECUTION_TIME_MS?: number }).MAX_JOB_EXECUTION_TIME_MS
  );
}

/** Example: launch document generation for CONF_DOC row "VERBALE_CDC_FEBBRAIO". */
function generaVerbaleCdcFebbraio(): void {
  avviaGenerazioneDataDriven(
    initAldo(),
    'VERBALE_CDC_FEBBRAIO',
    creaJobRunner(),
    (globalThis as { MAX_JOB_EXECUTION_TIME_MS?: number }).MAX_JOB_EXECUTION_TIME_MS
  );
}

/** Example: launch document generation for CONF_DOC row "VERBALE_CDC_APRILE". */
function generaVerbaleCdcAprile(): void {
  avviaGenerazioneDataDriven(
    initAldo(),
    'VERBALE_CDC_APRILE',
    creaJobRunner(),
    (globalThis as { MAX_JOB_EXECUTION_TIME_MS?: number }).MAX_JOB_EXECUTION_TIME_MS
  );
}

/** Example: launch document generation for CONF_DOC row "VERBALE_CDC_MAGGIO". */
function generaVerbaleCdcMaggio(): void {
  avviaGenerazioneDataDriven(
    initAldo(),
    'VERBALE_CDC_MAGGIO',
    creaJobRunner(),
    (globalThis as { MAX_JOB_EXECUTION_TIME_MS?: number }).MAX_JOB_EXECUTION_TIME_MS
  );
}

/** Example: launch document generation for CONF_DOC row "FSL". */
function generaFsl(): void {
  avviaGenerazioneDataDriven(
    initAldo(),
    'FSL',
    creaJobRunner(),
    (globalThis as { MAX_JOB_EXECUTION_TIME_MS?: number }).MAX_JOB_EXECUTION_TIME_MS
  );
}

/** Example: launch document generation for CONF_DOC row "CONDOTTA". */
function generaCondotta(): void {
  avviaGenerazioneDataDriven(
    initAldo(),
    'CONDOTTA',
    creaJobRunner(),
    (globalThis as { MAX_JOB_EXECUTION_TIME_MS?: number }).MAX_JOB_EXECUTION_TIME_MS
  );
}

/** Example: launch document generation for CONF_DOC row "COMPETENZE". */
function generaCompetenze(): void {
  avviaGenerazioneDataDriven(
    initAldo(),
    'COMPETENZE',
    creaJobRunner(),
    (globalThis as { MAX_JOB_EXECUTION_TIME_MS?: number }).MAX_JOB_EXECUTION_TIME_MS
  );
}

/** Example: launch document generation for CONF_DOC row "CARENZE_SEGNALATORE_NOVEMBRE". */
function generaCarenzeSegnalatoreNovembre(): void {
  avviaGenerazioneDataDriven(
    initAldo(),
    'CARENZE_SEGNALATORE_NOVEMBRE',
    creaJobRunner(),
    (globalThis as { MAX_JOB_EXECUTION_TIME_MS?: number }).MAX_JOB_EXECUTION_TIME_MS
  );
}

/** Example: launch document generation for CONF_DOC row "CARENZE_SEGNALATORE_FEBBRAIO". */
function generaCarenzeSegnalatoreFebbraio(): void {
  avviaGenerazioneDataDriven(
    initAldo(),
    'CARENZE_SEGNALATORE_FEBBRAIO',
    creaJobRunner(),
    (globalThis as { MAX_JOB_EXECUTION_TIME_MS?: number }).MAX_JOB_EXECUTION_TIME_MS
  );
}

/** Example: launch document generation for CONF_DOC row "CARENZE_SEGNALATORE_APRILE". */
function generaCarenzeSegnalatoreAprile(): void {
  avviaGenerazioneDataDriven(
    initAldo(),
    'CARENZE_SEGNALATORE_APRILE',
    creaJobRunner(),
    (globalThis as { MAX_JOB_EXECUTION_TIME_MS?: number }).MAX_JOB_EXECUTION_TIME_MS
  );
}

/** Example: launch document generation for CONF_DOC row "RELAZIONE_FINALE". */
function generaRelazioneFinale(): void {
  avviaGenerazioneDataDriven(
    initAldo(),
    'RELAZIONE_FINALE',
    creaJobRunner(),
    (globalThis as { MAX_JOB_EXECUTION_TIME_MS?: number }).MAX_JOB_EXECUTION_TIME_MS
  );
}

/** Example: launch document generation for CONF_DOC row "PROGRAMMA". */
function generaProgramma(): void {
  avviaGenerazioneDataDriven(
    initAldo(),
    'PROGRAMMA',
    creaJobRunner(),
    (globalThis as { MAX_JOB_EXECUTION_TIME_MS?: number }).MAX_JOB_EXECUTION_TIME_MS
  );
}

/** Example: launch document generation for CONF_DOC row "PROGRAMMA_RELAZIONE_QUINTE". */
function generaProgrammaRelazioneQuinte(): void {
  avviaGenerazioneDataDriven(
    initAldo(),
    'PROGRAMMA_RELAZIONE_QUINTE',
    creaJobRunner(),
    (globalThis as { MAX_JOB_EXECUTION_TIME_MS?: number }).MAX_JOB_EXECUTION_TIME_MS
  );
}

/** Example: launch document generation for CONF_DOC row "DOC15MAGGIO". */
function generaDoc15Maggio(): void {
  avviaGenerazioneDataDriven(
    initAldo(),
    'DOC15MAGGIO',
    creaJobRunner(),
    (globalThis as { MAX_JOB_EXECUTION_TIME_MS?: number }).MAX_JOB_EXECUTION_TIME_MS
  );
}

/** Example: send CONF_MAIL pattern "CDC_OTTOBRE_COORDINATORI". */
function inviaCdcOttobreCoordinatori(): void {
  avviaInvioNotificheDataDriven(
    initAldo(),
    'CDC_OTTOBRE_COORDINATORI',
    creaJobRunner(),
    (globalThis as { MAX_JOB_EXECUTION_TIME_MS?: number }).MAX_JOB_EXECUTION_TIME_MS
  );
}

/** Example: send CONF_MAIL pattern "CDC_NOVEMBRE_COORDINATORI". */
function inviaCdcNovembreCoordinatori(): void {
  avviaInvioNotificheDataDriven(
    initAldo(),
    'CDC_NOVEMBRE_COORDINATORI',
    creaJobRunner(),
    (globalThis as { MAX_JOB_EXECUTION_TIME_MS?: number }).MAX_JOB_EXECUTION_TIME_MS
  );
}

/** Example: send CONF_MAIL pattern "CDC_FEBBRAIO_COORDINATORI". */
function inviaCdcFebbraioCoordinatori(): void {
  avviaInvioNotificheDataDriven(
    initAldo(),
    'CDC_FEBBRAIO_COORDINATORI',
    creaJobRunner(),
    (globalThis as { MAX_JOB_EXECUTION_TIME_MS?: number }).MAX_JOB_EXECUTION_TIME_MS
  );
}

/** Example: send CONF_MAIL pattern "CDC_APRILE_COORDINATORI". */
function inviaCdcAprileCoordinatori(): void {
  avviaInvioNotificheDataDriven(
    initAldo(),
    'CDC_APRILE_COORDINATORI',
    creaJobRunner(),
    (globalThis as { MAX_JOB_EXECUTION_TIME_MS?: number }).MAX_JOB_EXECUTION_TIME_MS
  );
}

/** Example: send CONF_MAIL pattern "CDC_MAGGIO_COORDINATORI". */
function inviaCdcMaggioCoordinatori(): void {
  avviaInvioNotificheDataDriven(
    initAldo(),
    'CDC_MAGGIO_COORDINATORI',
    creaJobRunner(),
    (globalThis as { MAX_JOB_EXECUTION_TIME_MS?: number }).MAX_JOB_EXECUTION_TIME_MS
  );
}

/** Example: send CONF_MAIL pattern "DOC_PERSONALIZZATI_COORDINATORI". */
function inviaDocPersonalizzatiCoordinatori(): void {
  avviaInvioNotificheDataDriven(
    initAldo(),
    'DOC_PERSONALIZZATI_COORDINATORI',
    creaJobRunner(),
    (globalThis as { MAX_JOB_EXECUTION_TIME_MS?: number }).MAX_JOB_EXECUTION_TIME_MS
  );
}

/** Example: send CONF_MAIL pattern "FSL_DOCENTI_ELENCO_VALUTATORI". */
function inviaFslDocentiElencoValutatori(): void {
  avviaInvioNotificheDataDriven(
    initAldo(),
    'FSL_DOCENTI_ELENCO_VALUTATORI',
    creaJobRunner(),
    (globalThis as { MAX_JOB_EXECUTION_TIME_MS?: number }).MAX_JOB_EXECUTION_TIME_MS
  );
}

/** Example: send CONF_MAIL pattern "RIEPILOGO_FSL_ALUNNO". */
function inviaRiepilogoFslAlunno(): void {
  avviaInvioNotificheDataDriven(
    initAldo(),
    'RIEPILOGO_FSL_ALUNNO',
    creaJobRunner(),
    (globalThis as { MAX_JOB_EXECUTION_TIME_MS?: number }).MAX_JOB_EXECUTION_TIME_MS
  );
}

/** Example: send CONF_MAIL pattern "INVIO_CARENZE_NOVEMBRE". */
function inviaCarenzeNovembre(): void {
  avviaInvioNotificheDataDriven(
    initAldo(),
    'INVIO_CARENZE_NOVEMBRE',
    creaJobRunner(),
    (globalThis as { MAX_JOB_EXECUTION_TIME_MS?: number }).MAX_JOB_EXECUTION_TIME_MS
  );
}

/** Example: send CONF_MAIL pattern "INVIO_CARENZE_FEBBRAIO". */
function inviaCarenzeFebbraio(): void {
  avviaInvioNotificheDataDriven(
    initAldo(),
    'INVIO_CARENZE_FEBBRAIO',
    creaJobRunner(),
    (globalThis as { MAX_JOB_EXECUTION_TIME_MS?: number }).MAX_JOB_EXECUTION_TIME_MS
  );
}

/** Example: send CONF_MAIL pattern "NOTIFICA_CARENZE_FAMIGLIE_FEBBRAIO". */
function inviaNotificaCarenzeFamiglieFebbraio(): void {
  avviaInvioNotificheDataDriven(
    initAldo(),
    'NOTIFICA_CARENZE_FAMIGLIE_FEBBRAIO',
    creaJobRunner(),
    (globalThis as { MAX_JOB_EXECUTION_TIME_MS?: number }).MAX_JOB_EXECUTION_TIME_MS
  );
}

/** Example: send CONF_MAIL pattern "NOTIFICA_CARENZE_FAMIGLIE_MARZO". */
function inviaNotificaCarenzeFamiglieMarzo(): void {
  avviaInvioNotificheDataDriven(
    initAldo(),
    'NOTIFICA_CARENZE_FAMIGLIE_MARZO',
    creaJobRunner(),
    (globalThis as { MAX_JOB_EXECUTION_TIME_MS?: number }).MAX_JOB_EXECUTION_TIME_MS
  );
}

/** Example: send CONF_MAIL pattern "INVIO_CARTELLE_15_MAG". */
function inviaCartelle15Mag(): void {
  avviaInvioNotificheDataDriven(
    initAldo(),
    'INVIO_CARTELLE_15_MAG',
    creaJobRunner(),
    (globalThis as { MAX_JOB_EXECUTION_TIME_MS?: number }).MAX_JOB_EXECUTION_TIME_MS
  );
}

/** Example: send CONF_MAIL pattern "INVIO_DOCS_FINE_ANNO". */
function inviaDocsFineAnno(): void {
  avviaInvioNotificheDataDriven(
    initAldo(),
    'INVIO_DOCS_FINE_ANNO',
    creaJobRunner(),
    (globalThis as { MAX_JOB_EXECUTION_TIME_MS?: number }).MAX_JOB_EXECUTION_TIME_MS
  );
}

/** Example: send CONF_MAIL pattern "COMPOSIZIONE_CATTEDRE_DOCENTI". */
function inviaComposizioneCattedreDocenti(): void {
  avviaInvioNotificheDataDriven(
    initAldo(),
    'COMPOSIZIONE_CATTEDRE_DOCENTI',
    creaJobRunner(),
    (globalThis as { MAX_JOB_EXECUTION_TIME_MS?: number }).MAX_JOB_EXECUTION_TIME_MS
  );
}

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

/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access */
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
(globalThis as any).inviaNotificaCarenzeFamiglieFebbraio = inviaNotificaCarenzeFamiglieFebbraio;
(globalThis as any).inviaNotificaCarenzeFamiglieMarzo = inviaNotificaCarenzeFamiglieMarzo;
(globalThis as any).inviaCartelle15Mag = inviaCartelle15Mag;
(globalThis as any).inviaDocsFineAnno = inviaDocsFineAnno;
(globalThis as any).inviaComposizioneCattedreDocenti = inviaComposizioneCattedreDocenti;
(globalThis as any).importaCarenzeFebbraioChunked = importaCarenzeFebbraioChunked;
(globalThis as any).importaCarenzeMarzoChunked = importaCarenzeMarzoChunked;
(globalThis as any).importaFslFineAnnoChunked = importaFslFineAnnoChunked;
/* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access */
