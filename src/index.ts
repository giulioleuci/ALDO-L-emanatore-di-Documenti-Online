// ALDO core globals. Readable GAS entry points are compiled separately in
// production: Base, Menu and User. GAS shares one global namespace across all
// script files, so those small scripts call the values exposed below by name.
import {
  initAldo,
  creaJobRunner,
  avviaGenerazioneDataDriven,
  avviaInvioNotificheDataDriven,
  avviaRetryEmailDataDriven,
  avviaImportazioneDataDriven,
  avviaImportazioneChunkedDataDriven,
  avviaValidazioneDatabase,
  avviaBloccoDocumenti,
  riprendiJobSospeso,
  avviaAzioniDataDriven,
  elencoAzioniAttive
} from './config/Bootstrap';
import {
  costruisciMenu,
  menuGenerazioneDocumenti,
  menuComunicazioniEmail,
  menuImportazioni,
  menuValidazioneDatabase,
  menuBloccaDocumenti,
  menuEsecuzioneAzioni
} from './presentation/Menu';
import { GasUiFacade } from './infrastructure/facades/UiFacade';

/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access */
(globalThis as any).initAldo = initAldo;
(globalThis as any).creaJobRunner = creaJobRunner;
(globalThis as any).avviaGenerazioneDataDriven = avviaGenerazioneDataDriven;
(globalThis as any).avviaInvioNotificheDataDriven = avviaInvioNotificheDataDriven;
(globalThis as any).avviaRetryEmailDataDriven = avviaRetryEmailDataDriven;
(globalThis as any).avviaImportazioneDataDriven = avviaImportazioneDataDriven;
(globalThis as any).avviaImportazioneChunkedDataDriven = avviaImportazioneChunkedDataDriven;
(globalThis as any).riprendiJobSospeso = riprendiJobSospeso;
(globalThis as any).costruisciMenu = costruisciMenu;
(globalThis as any).menuGenerazioneDocumenti = menuGenerazioneDocumenti;
(globalThis as any).menuComunicazioniEmail = menuComunicazioniEmail;
(globalThis as any).menuImportazioni = menuImportazioni;
(globalThis as any).avviaValidazioneDatabase = avviaValidazioneDatabase;
(globalThis as any).menuValidazioneDatabase = menuValidazioneDatabase;
(globalThis as any).avviaBloccoDocumenti = avviaBloccoDocumenti;
(globalThis as any).menuBloccaDocumenti = menuBloccaDocumenti;
(globalThis as any).avviaAzioniDataDriven = avviaAzioniDataDriven;
(globalThis as any).elencoAzioniAttive = elencoAzioniAttive;
(globalThis as any).menuEsecuzioneAzioni = menuEsecuzioneAzioni;
(globalThis as any).GasUiFacade = GasUiFacade;
/* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access */
