// User-editable examples — importazioni dati (CONF_IMP). Remains readable in
// production as EntryPoints_User_4_Import.gs (see EntryPoints_User_1_Doc.ts
// for the filename-ordinal note).

declare function menu_avvioImportazioneChunked(configId: string): void;

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
(globalThis as any).importaCarenzeFebbraioChunked = importaCarenzeFebbraioChunked;
(globalThis as any).importaCarenzeMarzoChunked = importaCarenzeMarzoChunked;
(globalThis as any).importaFslFineAnnoChunked = importaFslFineAnnoChunked;
/* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access */
