import {
  costruisciMenu,
  menuGenerazioneDocumenti,
  menuComunicazioniEmail,
  MENU_TITOLO
} from '../../../src/presentation/Menu';
import { FakeUiFacade } from '../../../test/fakes/FakeUiFacade';

test('costruisciMenu builds AVVIA PROCESSI with the three launchers (15 §3)', () => {
  const ui = new FakeUiFacade();
  costruisciMenu(ui);
  expect(ui.menus).toHaveLength(1);
  expect(ui.menus[0]!.titolo).toBe(MENU_TITOLO);
  expect(ui.menus[0]!.voci.map((v) => v.funzione)).toEqual([
    'menu_avvioGenerazioneDocumenti',
    'menu_avvioComunicazioniEmail',
    'menu_avvioImportazioni'
  ]);
});

test('wrapper: input → sidebar → delegate (15 §4)', () => {
  const ui = new FakeUiFacade();
  ui.risposteInput.push('CD1');
  const avviati: string[] = [];
  menuGenerazioneDocumenti(ui, (id) => avviati.push(id));
  expect(avviati).toEqual(['CD1']);
  expect(ui.sidebars).toEqual([
    { jobId: 'gen_CD1', titolo: 'Monitoraggio — GENERAZIONE DOCUMENTI' }
  ]);
  expect(ui.messaggi).toHaveLength(0);
});

test('wrapper: cancelled/empty input aborts with a message and never delegates (15 §4)', () => {
  const ui = new FakeUiFacade(); // no scripted answer → ''
  const avviati: string[] = [];
  menuComunicazioniEmail(ui, (id) => avviati.push(id));
  expect(avviati).toEqual([]);
  expect(ui.sidebars).toEqual([]);
  expect(ui.messaggi[0]!.messaggio).toContain('annullata');
});

test('wrapper: launcher errors surface as msgBox, not as an uncaught throw (15 §4)', () => {
  const ui = new FakeUiFacade();
  ui.risposteInput.push('X1');
  menuComunicazioniEmail(ui, () => {
    throw new Error('CONF_MAIL X1 non trovato');
  });
  expect(ui.messaggi[0]!.messaggio).toContain('CONF_MAIL X1 non trovato');
});
