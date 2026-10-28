import {
  costruisciMenu,
  menuGenerazioneDocumenti,
  menuComunicazioniEmail,
  MENU_TITOLO,
  avvioConConferma,
  menuValidazioneDatabase,
  vociMenu,
  menuBloccaDocumenti,
  menuEsecuzioneAzioni,
  PAROLA_TUTTE
} from '../../../src/presentation/Menu';
import { FakeUiFacade } from '../../../test/fakes/FakeUiFacade';

test('costruisciMenu builds AVVIA PROCESSI with the six launchers (15 §3)', () => {
  const ui = new FakeUiFacade();
  costruisciMenu(ui);
  expect(ui.menus).toHaveLength(1);
  expect(ui.menus[0]!.titolo).toBe(MENU_TITOLO);
  expect(ui.menus[0]!.voci.map((v) => v.funzione)).toEqual([
    'menu_avvioGenerazioneDocumenti',
    'menu_avvioComunicazioniEmail',
    'menu_avvioImportazioni',
    'menu_validazioneDatabase',
    'menu_bloccaDocumenti',
    'menu_esecuzioneAzioni'
  ]);
});

test('wrapper: input → delegate (15 §4)', () => {
  const ui = new FakeUiFacade();
  ui.risposteInput.push('CD1');
  const avviati: string[] = [];
  menuGenerazioneDocumenti(ui, (id) => avviati.push(id));
  expect(avviati).toEqual(['CD1']);
  expect(ui.messaggi.map((m) => m.messaggio)).toEqual(['Job avviato.']);
});

test('wrapper: cancelled/empty input aborts with a message and never delegates (15 §4)', () => {
  const ui = new FakeUiFacade(); // no scripted answer → ''
  const avviati: string[] = [];
  menuComunicazioniEmail(ui, (id) => avviati.push(id));
  expect(avviati).toEqual([]);
  expect(ui.messaggi[0]!.messaggio).toContain('annullata');
});

test('wrapper: launcher errors surface as msgBox, not as an uncaught throw (15 §4)', () => {
  const ui = new FakeUiFacade();
  ui.risposteInput.push('X1');
  menuComunicazioniEmail(ui, () => {
    throw new Error('CONF_MAIL X1 non trovato');
  });
  expect(ui.messaggi[ui.messaggi.length - 1]!.messaggio).toContain('CONF_MAIL X1 non trovato');
});

test('vociMenu exposes the six launchers', () => {
  expect(vociMenu().map((v) => v.funzione)).toEqual([
    'menu_avvioGenerazioneDocumenti',
    'menu_avvioComunicazioniEmail',
    'menu_avvioImportazioni',
    'menu_validazioneDatabase',
    'menu_bloccaDocumenti',
    'menu_esecuzioneAzioni'
  ]);
});

test('avvioConConferma runs only when the user types CONFERMA', () => {
  const ui = new FakeUiFacade();
  ui.risposteInput.push('CONFERMA');
  let eseguito = 0;
  avvioConConferma(ui, 'TITOLO', 'Domanda?', () => {
    eseguito += 1;
    return 'Fatto: 3 elementi';
  });
  expect(eseguito).toBe(1);
  expect(ui.messaggi[ui.messaggi.length - 1]!.messaggio).toBe('Fatto: 3 elementi');
});

test('avvioConConferma aborts on anything else', () => {
  const ui = new FakeUiFacade();
  ui.risposteInput.push('no');
  let eseguito = 0;
  avvioConConferma(ui, 'TITOLO', 'Domanda?', () => {
    eseguito += 1;
    return '';
  });
  expect(eseguito).toBe(0);
  expect(ui.messaggi[0]!.messaggio).toContain('annullata');
});

test('avvioConConferma surfaces errors as a message instead of throwing', () => {
  const ui = new FakeUiFacade();
  ui.risposteInput.push('CONFERMA');
  expect(() =>
    avvioConConferma(ui, 'TITOLO', 'Domanda?', () => {
      throw new Error('boom');
    })
  ).not.toThrow();
  expect(ui.messaggi[ui.messaggi.length - 1]!.messaggio).toBe('Errore: boom');
});

test('menuValidazioneDatabase confirms then delegates', () => {
  const ui = new FakeUiFacade();
  ui.risposteInput.push('CONFERMA');
  let chiamate = 0;
  menuValidazioneDatabase(ui, () => {
    chiamate += 1;
    return 'Report creato';
  });
  expect(chiamate).toBe(1);
});

test('menuBloccaDocumenti warns about irreversibility and requires CONFERMA', () => {
  const ui = new FakeUiFacade();
  ui.risposteInput.push('CONFERMA');
  let chiamate = 0;
  menuBloccaDocumenti(ui, () => {
    chiamate += 1;
    return 'Bloccati 10 documenti';
  });
  expect(chiamate).toBe(1);
  expect(ui.messaggi[ui.messaggi.length - 1]!.messaggio).toBe('Bloccati 10 documenti');
});

test('menuBloccaDocumenti does nothing without confirmation', () => {
  const ui = new FakeUiFacade();
  let chiamate = 0;
  menuBloccaDocumenti(ui, () => {
    chiamate += 1;
    return '';
  });
  expect(chiamate).toBe(0);
});

test('menuEsecuzioneAzioni lists the active actions and delegates the chosen id', () => {
  const ui = new FakeUiFacade();
  ui.risposteInput.push('SANIFICA_TRIM');
  const avviati: string[][] = [];
  menuEsecuzioneAzioni(ui, [{ id: 'SANIFICA_TRIM', tipo: 'MANUTENZIONE' }], (ids) =>
    avviati.push(ids)
  );
  expect(avviati).toEqual([['SANIFICA_TRIM']]);
  expect(ui.messaggi.map((m) => m.messaggio)).toEqual(['Job avviato.']);
});

test('menuEsecuzioneAzioni runs every active action when TUTTE is typed', () => {
  const ui = new FakeUiFacade();
  ui.risposteInput.push(PAROLA_TUTTE);
  const avviati: string[][] = [];
  menuEsecuzioneAzioni(
    ui,
    [
      { id: 'A', tipo: 'T' },
      { id: 'B', tipo: 'T' }
    ],
    (ids) => avviati.push(ids)
  );
  expect(avviati).toEqual([['A', 'B']]);
});

test('menuEsecuzioneAzioni refuses an unknown id without delegating', () => {
  const ui = new FakeUiFacade();
  ui.risposteInput.push('NON_ESISTE');
  const avviati: string[][] = [];
  menuEsecuzioneAzioni(ui, [{ id: 'A', tipo: 'T' }], (ids) => avviati.push(ids));
  expect(avviati).toEqual([]);
  expect(ui.messaggi[0]!.messaggio).toContain('NON_ESISTE');
});

test('menuEsecuzioneAzioni reports when there is nothing to run', () => {
  const ui = new FakeUiFacade();
  const avviati: string[][] = [];
  menuEsecuzioneAzioni(ui, [], (ids) => avviati.push(ids));
  expect(avviati).toEqual([]);
  expect(ui.messaggi[0]!.messaggio).toContain('nessuna azione');
});
