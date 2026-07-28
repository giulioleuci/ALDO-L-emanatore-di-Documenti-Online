import {
  mapCarenzeFormatoB,
  escapeHtml,
  safeColor,
  safeUrl,
  createBoxComposer,
  renderBoxes,
  wrapBox
} from '../../../src/application/email/boxes';
import { ConfigurazioneEmail } from '../../../src/domain/entities/ConfigurazioneEmail';
import { MateriaRepository } from '../../../src/infrastructure/repositories/MateriaRepository';
import { FakeDatabase } from '../../../test/fakes/FakeDatabase';
import { fixtureTables } from '../../../test/fixtures/tables';
import { FakeTemplateEngine } from '../../../test/fakes/FakeTemplateEngine';
import { LazyRef } from '../../../src/application/storico/LazyRef';
import { AggregatoreDati } from '../../../src/application/services/AggregatoreDati';

const logger = new LoggerService();

function materie(): MateriaRepository {
  return new MateriaRepository(new FakeDatabase(fixtureTables()));
}

function materieConNomeDistintoDaSintesi(): MateriaRepository {
  const tables = {
    ...fixtureTables(),
    MATERIE: [
      {
        ID: 'MATE',
        NOME: 'Matematica e Informatica',
        SINTESI: 'MAT',
        COLORE_1: '#c0392b',
        COLORE_2: '#fdecea',
        SIMBOLO: '📐',
        ESAME_CFG: null
      }
    ]
  };
  return new MateriaRepository(new FakeDatabase(tables));
}

function cduRecord(): Record<string, unknown> {
  return {
    meta: { date: { oggi: { breve: '05/07/2026' } } },
    focus: {
      classe: { anagrafica: { nome: '5A' } },
      alunno: {
        anagrafica: { nomeCompleto: 'VERDI ANNA', email: 'a1@school.it' },
        didattica: {
          carenze: { dettaglio: [{ materia: 'MATE', voto: '4' }], numero: 1, hasCarenze: true },
          documenti: {
            items: [
              {
                nome: 'PDP Anna',
                link: 'https://drive/x',
                tipo: 'PDP',
                stato: 'GENERATO',
                dataCreazione: '01/06/2026'
              }
            ],
            hasDocumenti: true
          }
        }
      },
      carenza: {
        studente: 'a1@school.it',
        progressivo: 1,
        data: '2026-02-15',
        classe: '5A',
        hasAssenze: true,
        note: 'Studio discontinuo'
      }
    }
  };
}

function confMail(boxCfg: unknown): ConfigurazioneEmail {
  return ConfigurazioneEmail.fromData({
    ID: 'P1',
    OGGETTO: 'Oggetto',
    PROCESSO: 'PER_GENITORI_ALUNNO',
    BOX_CFG: JSON.stringify(boxCfg),
    TESTO: '',
    SUPPLENTI: 'SOLO_TITOLARI',
    NOREPLY: false,
    COLORE_HEADER: '',
    CONDIZIONE: null,
    POST_PROCESSO: null
  });
}

function render(boxCfg: unknown) {
  const templates = new FakeTemplateEngine();
  const composer = createBoxComposer(logger, templates);
  return renderBoxes(composer, confMail(boxCfg), cduRecord(), materie(), templates);
}

test('mapCarenzeFormatoB enriches with MATERIE colours/symbol, default #ddd for unknown', () => {
  const rows = mapCarenzeFormatoB(
    [
      { materia: 'MATE', voto: '4' },
      { materia: 'XXX', voto: '5' }
    ],
    materie()
  );
  expect(rows[0]).toMatchObject({
    sigla: 'MATE',
    colore: '#c0392b',
    colore2: '#fdecea',
    simbolo: '📐',
    nomeSintesi: 'Matematica'
  });
  expect(rows[0]!.descrizione).toBe('Voto 4');
  expect(rows[1]).toMatchObject({ sigla: 'XXX', colore: '#ddd', nomeSintesi: 'XXX' });
});

test('carenze box renders one coloured sub-box per materia (11 §11)', () => {
  const out = render([{ TIPO_BOX: 'carenze', TITOLO: 'Carenze rilevate' }]);
  const box = out.boxes['carenze']!;
  expect(box.visibile).toBe(true);
  expect(box.isEmpty).toBe(false);
  expect(box.html).toContain('border-left:4px solid #c0392b');
  expect(box.html).toContain('📐 Matematica');
  expect(box.html).toContain('Voto 4');
  expect(box.html).toContain('Carenze rilevate'); // wrapBox container title
});

test('carenze box title uses MATERIE.NOME (full name), not SINTESI, and has no background fill (item 2)', () => {
  const templates = new FakeTemplateEngine();
  const composer = createBoxComposer(logger, templates);
  const out = renderBoxes(
    composer,
    confMail([{ TIPO_BOX: 'carenze', TITOLO: 'Carenze rilevate' }]),
    cduRecord(),
    materieConNomeDistintoDaSintesi(),
    templates
  );
  const box = out.boxes['carenze']!;
  expect(box.html).toContain('📐 Matematica e Informatica');
  expect(box.html).not.toContain('📐 MAT<'); // not the short SINTESI form
  expect(box.html).not.toContain('background-color:#fdecea');
  expect(box.html).toContain('border-left:4px solid #c0392b');
});

test('documenti box lists links; cartelle box empty ⇒ hidden', () => {
  const out = render([
    { TIPO_BOX: 'documenti', TITOLO: 'Documenti' },
    { TIPO_BOX: 'cartelle', TITOLO: 'Cartelle' }
  ]);
  expect(out.boxes['documenti']!.html).toContain('<a href="https://drive/x"');
  expect(out.boxes['documenti']!.html).toContain('PDP Anna');
  expect(out.boxes['cartelle']!.visibile).toBe(false);
  expect(out.boxes['cartelle']!.html).toBe('');
});

test('renderBoxes returns the IDs of document and personalized-plan links rendered in the email body', () => {
  const templates = new FakeTemplateEngine();
  const composer = createBoxComposer(logger, templates);
  const cdu = cduRecord();
  const focus = cdu['focus'] as Record<string, unknown>;
  const alunno = focus['alunno'] as Record<string, unknown>;
  const didattica = alunno['didattica'] as Record<string, unknown>;
  didattica['documenti'] = {
    items: [
      {
        id: 'work-plan-1',
        nome: 'Piano di lavoro 5A',
        link: 'https://drive/work-plan-1',
        tipo: 'PIANO_LAVORO',
        idGen: 'PIANO_LAVORO',
        stato: 'GENERATO',
        dataCreazione: '01/07/2026'
      }
    ]
  };
  didattica['pianiPersonalizzati'] = {
    items: [
      {
        id: 'personal-plan-1',
        nome: 'PDP Anna',
        link: 'https://drive/personal-plan-1',
        sottotipo: 'PDP_BES',
        idGen: 'PIANI_PERSONALIZZATI',
        notificato: false
      }
    ]
  };

  const out = renderBoxes(
    composer,
    confMail([{ TIPO_BOX: 'documenti' }, { TIPO_BOX: 'piani_pers_da_inviare' }]),
    cdu,
    materie(),
    templates
  ) as ReturnType<typeof renderBoxes> & { documentIds?: string[] };

  expect(out.documentIds).toEqual(['work-plan-1', 'personal-plan-1']);
});

test('documenti/cartelle boxes fall back to focus.classe.didattica.documenti when focus.alunno is absent (coordinatore/CdC emails, 11 §11 new)', () => {
  const templates = new FakeTemplateEngine();
  const composer = createBoxComposer(logger, templates);
  const cdu: Record<string, unknown> = {
    meta: { date: { oggi: { breve: '05/07/2026' } } },
    focus: {
      classe: {
        anagrafica: { nome: '5A' },
        didattica: {
          documenti: {
            items: [
              { nome: 'Verbale 5A', link: 'https://drive/verbale', tipo: 'VERBALE', idGen: 'VERBALE_CDC', stato: 'GENERATO', dataCreazione: '01/07/2026' },
              { nome: 'Cartella 5A', link: 'https://drive/cartella', tipo: 'CARTELLA', idGen: 'CARTELLA_5A', stato: 'GENERATO', dataCreazione: '01/07/2026' }
            ],
            hasDocumenti: true
          }
        }
      }
    }
  };
  const out = renderBoxes(
    composer,
    confMail([{ TIPO_BOX: 'documenti' }, { TIPO_BOX: 'cartelle' }]),
    cdu,
    materie(),
    templates
  );
  expect(out.boxes['documenti']!.html).toContain('Verbale 5A');
  expect(out.boxes['documenti']!.html).not.toContain('Cartella 5A');
  expect(out.boxes['cartelle']!.visibile).toBe(true);
  expect(out.boxes['cartelle']!.html).toContain('Cartella 5A');
});

test('note + assenze boxes read focus.carenza (11 §11)', () => {
  const out = render([{ TIPO_BOX: 'note' }, { TIPO_BOX: 'assenze' }]);
  expect(out.boxes['note']!.html).toContain('Studio discontinuo');
  expect(out.boxes['assenze']!.html).toContain('assenze');
});

test('testo_dinamico always visible, resolves CONTENUTO placeholders', () => {
  const out = render([
    { TIPO_BOX: 'testo_dinamico', CONTENUTO: '<p>Classe {{focus.classe.anagrafica.nome}}</p>' }
  ]);
  const box = out.boxes['testo_dinamico']!;
  expect(box.visibile).toBe(true);
  expect(box.html).toContain('Classe 5A');
});

test('testo_dinamico HTML-escapes raw CDU string values (REVIEW_ALDO.md #2)', () => {
  const templates = new FakeTemplateEngine();
  const composer = createBoxComposer(logger, templates);
  const cdu = cduRecord();
  (cdu['focus'] as { alunno: { anagrafica: { nomeCompleto: string } } }).alunno.anagrafica.nomeCompleto =
    '<script>alert(1)</script>';
  const out = renderBoxes(
    composer,
    confMail([
      {
        TIPO_BOX: 'testo_dinamico',
        CONTENUTO: '<p>Ciao {{focus.alunno.anagrafica.nomeCompleto}}</p>'
      }
    ]),
    cdu,
    materie(),
    templates
  );
  const html = out.boxes['testo_dinamico']!.html;
  expect(html).not.toContain('<script>');
  expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
});

test('boxes ordered by ORDINE; MOSTRA_SE_VUOTO falls back to TESTO_VUOTO', () => {
  const out = render([
    { TIPO_BOX: 'note', ORDINE: 2 },
    { TIPO_BOX: 'carenze', ORDINE: 1 },
    {
      TIPO_BOX: 'cartelle',
      ORDINE: 3,
      MOSTRA_SE_VUOTO: true,
      TESTO_VUOTO: 'Nessuna cartella per {{focus.classe.anagrafica.nome}}'
    }
  ]);
  expect(out.ordered).toHaveLength(3);
  expect(out.ordered[0]).toContain('Voto 4'); // carenze first
  expect(out.ordered[1]).toContain('Studio discontinuo');
  expect(out.ordered[2]).toContain('Nessuna cartella per 5A'); // fallback
  const cartelle = out.boxes['cartelle']!;
  expect(cartelle.isEmpty).toBe(true); // renderer output was empty
  expect(cartelle.visibile).toBe(true); // but fallback made it visible
});

test('TESTO_VUOTO fallback HTML-escapes raw CDU string values (REVIEW_ALDO.md #2)', () => {
  const templates = new FakeTemplateEngine();
  const composer = createBoxComposer(logger, templates);
  const cdu = cduRecord();
  (cdu['focus'] as { classe: { anagrafica: { nome: string } } }).classe.anagrafica.nome =
    '<b>5A</b>';
  const out = renderBoxes(
    composer,
    confMail([
      {
        TIPO_BOX: 'cartelle',
        MOSTRA_SE_VUOTO: true,
        TESTO_VUOTO: 'Nessuna cartella per {{focus.classe.anagrafica.nome}}'
      }
    ]),
    cdu,
    materie(),
    templates
  );
  const html = out.boxes['cartelle']!.html;
  expect(html).not.toContain('<b>5A</b>');
  expect(html).toContain('&lt;b&gt;5A&lt;/b&gt;');
});

test('unknown TIPO_BOX is skipped with empty html (11 §5)', () => {
  const out = render([{ TIPO_BOX: 'inesistente' }, { TIPO_BOX: 'note' }]);
  expect(out.boxes['inesistente']).toBeUndefined();
  expect(out.boxes['note']!.visibile).toBe(true);
});

test('wrapBox produces the standard container (11 §11)', () => {
  const html = wrapBox('Titolo', '#123456', '<p>x</p>');
  expect(html).toContain('border-left:4px solid #123456');
  expect(html).toContain('<h3 style="margin:0 0 10px 0; color:#333; font-size:16px;">Titolo</h3>');
  expect(html).toContain('<p>x</p>');
});

// Detailed escapeHtml/safeColor/safeUrl case-by-case coverage now lives in
// GasLibraryFactory/CoreUtilsLib/src/__tests__/HtmlSanitizer.test.js (Task C2:
// boxes.ts delegates to the library's HtmlSanitizer). Cases faithfully ported
// there: the <img onerror> markup case, the full &<>"' character set, the
// <script> tag case, hex/keyword safeColor acceptance, the malicious-colour
// rejection case, http(s) safeUrl acceptance, and the javascript: rejection
// case. Kept here: thin delegation assertions proving boxes.ts's exported
// functions produce the same output as the library, plus the box-level
// integration tests below (unchanged) which exercise real template rendering.
test('escapeHtml/safeColor/safeUrl delegate to the library HtmlSanitizer', () => {
  expect(escapeHtml('<img src=x onerror=alert(1)>')).toBe('&lt;img src=x onerror=alert(1)&gt;');
  expect(safeColor('#c0392b', '#ddd')).toBe('#c0392b');
  expect(safeColor('red;"><script>', '#ddd')).toBe('#ddd');
  expect(safeUrl('https://drive.google.com/x')).toBe('https://drive.google.com/x');
  expect(safeUrl('javascript:alert(1)')).toBe('#');
});

test('note box escapes free-text HTML from CARENZE.NOTE', () => {
  const templates = new FakeTemplateEngine();
  const composer = createBoxComposer(logger, templates);
  const cdu = cduRecord();
  (cdu['focus'] as { carenza: { note: string } }).carenza.note = '<script>alert(1)</script>';
  const out = renderBoxes(composer, confMail([{ TIPO_BOX: 'note' }]), cdu, materie(), templates);
  expect(out.boxes['note']!.html).toContain('&lt;script&gt;');
  expect(out.boxes['note']!.html).not.toContain('<script>');
});

test('documenti box neutralises javascript: links and hostile colours', () => {
  const templates = new FakeTemplateEngine();
  const composer = createBoxComposer(logger, templates);
  const cdu = cduRecord();
  const didattica = (cdu['focus'] as { alunno: { didattica: { documenti: { items: unknown[] } } } })
    .alunno.didattica;
  didattica.documenti.items = [
    { nome: 'Doc', link: 'javascript:alert(1)', tipo: 'PDP', stato: 'GENERATO', dataCreazione: '' }
  ];
  const out = renderBoxes(
    composer,
    confMail([{ TIPO_BOX: 'documenti' }]),
    cdu,
    materie(),
    templates
  );
  expect(out.boxes['documenti']!.html).toContain('href="#"');
  expect(out.boxes['documenti']!.html).not.toContain('javascript:');
});

function cduWithStorico(
  storico: Array<{ anno: string; nome: string; link: string; tipo: string; sottotipo: string; idGen: string }>
) {
  const cdu = cduRecord();
  const didattica = (
    cdu['focus'] as {
      alunno: { didattica: { documenti: { items: Array<Record<string, unknown>>; storico?: unknown } } };
    }
  ).alunno.didattica;
  didattica.documenti.items[0]!['idGen'] = 'CD_PDP';
  didattica.documenti.storico = { get: () => storico, isResolved: () => true };
  return cdu;
}

test('documenti box in arricchisciConStorico mode renders templateRiga, matching storico by idGen (11 §11)', () => {
  const templates = new FakeTemplateEngine();
  const composer = createBoxComposer(logger, templates);
  const cdu = cduWithStorico([
    {
      anno: '2025-2026', nome: 'PDP Anna (vecchio)', link: 'https://drive/old',
      tipo: 'PIANO_PERS', sottotipo: 'PDP_DSA', idGen: 'CD_PDP'
    },
    {
      anno: '2025-2026', nome: 'Altro doc', link: 'https://drive/altro',
      tipo: 'VERBALE', sottotipo: '', idGen: 'ALTRO_TIPO'
    }
  ]);
  const out = renderBoxes(
    composer,
    confMail([
      {
        TIPO_BOX: 'documenti',
        arricchisciConStorico: true,
        configArricchimento: {
          templateRiga: '<li>{{corrente.nome}} — storico: {{#storico}}{{nome}} ({{anno}}){{/storico}}</li>'
        }
      }
    ]),
    cdu,
    materie(),
    templates
  );
  const html = out.boxes['documenti']!.html;
  expect(html).toContain('PDP Anna — storico: PDP Anna (vecchio) (2025-2026)');
  expect(html).not.toContain('Altro doc'); // different idGen, must not match
});

test('documenti box falls back to standard rendering when templateRiga is empty (safety net)', () => {
  const templates = new FakeTemplateEngine();
  const composer = createBoxComposer(logger, templates);
  const cdu = cduWithStorico([{
    anno: '2025-2026', nome: 'x', link: 'https://drive/x',
    tipo: 'PIANO_PERS', sottotipo: 'PDP_DSA', idGen: 'CD_PDP'
  }]);
  const out = renderBoxes(
    composer,
    confMail([{ TIPO_BOX: 'documenti', arricchisciConStorico: true }]),
    cdu,
    materie(),
    templates
  );
  expect(out.boxes['documenti']!.html).toContain('<a href="https://drive/x"');
  expect(out.boxes['documenti']!.html).toContain('PDP Anna'); // current item's plain markup, unchanged
});

test('documenti box falls back to standard rendering when includiStorico was false (no LazyRef attached)', () => {
  const templates = new FakeTemplateEngine();
  const composer = createBoxComposer(logger, templates);
  const out = renderBoxes(
    composer,
    confMail([
      {
        TIPO_BOX: 'documenti',
        arricchisciConStorico: true,
        configArricchimento: { templateRiga: '<li>{{corrente.nome}}</li>' }
      }
    ]),
    cduRecord(), // no .storico attached
    materie(),
    templates
  );
  expect(out.boxes['documenti']!.html).toContain('<a href="https://drive/x"');
});

test('documenti box arricchisciConStorico templateRiga escapes hostile storico nome (security parity with standard mode)', () => {
  const templates = new FakeTemplateEngine();
  const composer = createBoxComposer(logger, templates);
  const cdu = cduWithStorico([
    {
      anno: '2025-2026', nome: '<script>alert(1)</script>', link: 'https://drive/old',
      tipo: 'PIANO_PERS', sottotipo: 'PDP_DSA', idGen: 'CD_PDP'
    }
  ]);
  const out = renderBoxes(
    composer,
    confMail([
      {
        TIPO_BOX: 'documenti',
        arricchisciConStorico: true,
        configArricchimento: { templateRiga: '<li>{{#storico}}{{nome}}{{/storico}}</li>' }
      }
    ]),
    cdu,
    materie(),
    templates
  );
  expect(out.boxes['documenti']!.html).toContain('&lt;script&gt;');
  expect(out.boxes['documenti']!.html).not.toContain('<script>alert(1)</script>');
});

test('documenti box displayMode "link" shows the URL as link text', () => {
  const out = render([{ TIPO_BOX: 'documenti', displayMode: 'link' }]);
  const html = out.boxes['documenti']!.html;
  expect(html).toContain('<a href="https://drive/x" target="_blank">https://drive/x</a>');
  expect(html).not.toContain('PDP Anna');
});

test('documenti box displayMode "nome+link" shows both nome and the link', () => {
  const out = render([{ TIPO_BOX: 'documenti', displayMode: 'nome+link' }]);
  const html = out.boxes['documenti']!.html;
  expect(html).toContain('PDP Anna');
  expect(html).toContain('<a href="https://drive/x" target="_blank">https://drive/x</a>');
});

test('documenti box displayMode "sololink" shows a generic "Apri" label', () => {
  const out = render([{ TIPO_BOX: 'documenti', displayMode: 'sololink' }]);
  const html = out.boxes['documenti']!.html;
  expect(html).toContain('<a href="https://drive/x" target="_blank">Apri</a>');
  expect(html).not.toContain('PDP Anna');
});

test('documenti box with no displayMode keeps the current default markup ("nome")', () => {
  const out = render([{ TIPO_BOX: 'documenti' }]);
  expect(out.boxes['documenti']!.html).toContain(
    '<a href="https://drive/x" target="_blank">PDP Anna</a>'
  );
});

function pianiPersCduRecord(items: unknown[], storico?: unknown): Record<string, unknown> {
  return {
    meta: { date: { oggi: { breve: '05/07/2026' } } },
    focus: {
      classe: {
        anagrafica: { nome: '5A' },
        didattica: {
          pianiPersonalizzati: storico !== undefined ? { items, storico } : { items }
        }
      }
    }
  };
}

test('piani_pers_da_inviare: shows only unnotified plans and each plan receives history from its own subtype', () => {
  const templates = new FakeTemplateEngine();
  const composer = createBoxComposer(logger, templates);
  const cdu = pianiPersCduRecord(
    [
      {
        nome: 'PEI a1', link: 'http://d/1', tipo: 'PIANO_PERS', sottotipo: 'PEI',
        idGen: 'PIANI_PERSONALIZZATI', stato: 'GENERATO', dataCreazione: '2026-03-01', notificato: false,
        studente: { nomeCompleto: 'VERDI ANNA', email: 'a1@school.it' }
      },
      {
        nome: 'PDP a1', link: 'http://d/2', tipo: 'PIANO_PERS', sottotipo: 'PDP_BES',
        idGen: 'PIANI_PERSONALIZZATI', stato: 'GENERATO', dataCreazione: '2026-03-02', notificato: true,
        studente: { nomeCompleto: 'VERDI ANNA', email: 'a1@school.it' }
      },
      {
        nome: 'PDP a2', link: 'http://d/3', tipo: 'PIANO_PERS', sottotipo: 'PDP_BES',
        idGen: 'PIANI_PERSONALIZZATI', stato: 'GENERATO', dataCreazione: '2026-03-03', notificato: false,
        studente: { nomeCompleto: 'NERI PAOLO', email: 'a2@school.it' }
      }
    ],
    new LazyRef(() => [
      {
        anno: '2025-2026', nome: 'PEI a1 anno scorso', link: 'http://d/old-pei',
        tipo: 'PIANO_PERS', sottotipo: 'PEI', idGen: 'PIANI_PERSONALIZZATI', studenteEmail: 'a1@school.it'
      },
      {
        anno: '2025-2026', nome: 'PDP a1 anno scorso', link: 'http://d/old-pdp',
        tipo: 'PIANO_PERS', sottotipo: 'PDP_BES', idGen: 'PIANI_PERSONALIZZATI', studenteEmail: 'a1@school.it'
      }
    ])
  );
  const out = renderBoxes(
    composer,
    confMail([{ TIPO_BOX: 'piani_pers_da_inviare' }]),
    cdu,
    materie(),
    templates
  );
  const html = out.boxes['piani_pers_da_inviare']!.html;
  expect((html.match(/Piani personalizzati da notificare/g) ?? [])).toHaveLength(1);
  const [peiRow, pdpRow] = html.split('</li>');
  expect(html).toContain('PEI a1');
  expect(html).toContain('PDP a2');
  expect(html).not.toContain('<li>PDP_BES — VERDI ANNA:'); // NOTIFICATO, excluded
  expect(out.boxes['piani_pers_da_inviare']!.html).toContain('Si invia anche il link al piano dell\'anno precedente');
  expect(peiRow).toContain('http://d/old-pei');
  expect(peiRow).not.toContain('http://d/old-pdp'); // same ID_GEN, wrong subtype
  expect(pdpRow).not.toContain('http://d/old-pdp'); // same subtype, different student
});

test('piani_pers_da_inviare: escapes hostile sottotipo/studente.nomeCompleto in the default-template (historical) path', () => {
  const templates = new FakeTemplateEngine();
  const composer = createBoxComposer(logger, templates);
  const cdu = pianiPersCduRecord(
    [
      {
        nome: 'PDP a1', link: 'http://d/1', tipo: 'PIANO_PERS', sottotipo: '<script>alert(1)</script>',
        idGen: 'PDP_BES', stato: 'GENERATO', dataCreazione: '2026-03-01', notificato: false,
        studente: { nomeCompleto: '<img src=x onerror=alert(1)>', email: 'a1@school.it' }
      }
    ],
    new LazyRef(() => [])
  );
  const out = renderBoxes(
    composer,
    confMail([{ TIPO_BOX: 'piani_pers_da_inviare' }]),
    cdu,
    materie(),
    templates
  );
  const html = out.boxes['piani_pers_da_inviare']!.html;
  expect(html).not.toContain('<script>alert(1)</script>');
  expect(html).not.toContain('<img src=x onerror=alert(1)>');
  expect(html).toContain('&lt;script&gt;');
  expect(html).toContain('&lt;img');
});

test('piani_pers_inviati: lists only NOTIFICATO items across students and subtypes', () => {
  const templates = new FakeTemplateEngine();
  const composer = createBoxComposer(logger, templates);
  const cdu = pianiPersCduRecord(
    [
      {
        nome: 'PEI a1', link: 'http://d/1', tipo: 'PIANO_PERS', sottotipo: 'PEI',
        idGen: 'PIANI_PERSONALIZZATI', stato: 'GENERATO', dataCreazione: '2026-03-01', notificato: false,
        studente: { nomeCompleto: 'VERDI ANNA', email: 'a1@school.it' }
      },
      {
        nome: 'PDP a1', link: 'http://d/2', tipo: 'PIANO_PERS', sottotipo: 'PDP_BES',
        idGen: 'PIANI_PERSONALIZZATI', stato: 'GENERATO', dataCreazione: '2026-03-02', notificato: true,
        studente: { nomeCompleto: 'VERDI ANNA', email: 'a1@school.it' }
      },
      {
        nome: 'PEI a2', link: 'http://d/3', tipo: 'PIANO_PERS', sottotipo: 'PEI',
        idGen: 'PIANI_PERSONALIZZATI', stato: 'GENERATO', dataCreazione: '2026-03-03', notificato: true,
        studente: { nomeCompleto: 'NERI PAOLO', email: 'a2@school.it' }
      }
    ]
  );
  const out = renderBoxes(
    composer,
    confMail([{ TIPO_BOX: 'piani_pers_inviati' }]),
    cdu,
    materie(),
    templates
  );
  const html = out.boxes['piani_pers_inviati']!.html;
  expect(html).toContain('PDP a1');
  expect(html).toContain('PEI a2');
  expect(html).not.toContain('PEI a1'); // NOTIFICATO absent, excluded
  expect(html).not.toContain('Si invia anche');
});

test('piani_pers_da_inviare: empty when items list is empty', () => {
  const templates = new FakeTemplateEngine();
  const composer = createBoxComposer(logger, templates);
  const cdu = pianiPersCduRecord([]);
  const out = renderBoxes(
    composer,
    confMail([{ TIPO_BOX: 'piani_pers_da_inviare' }]),
    cdu,
    materie(),
    templates
  );
  // Deviation from the task-11 brief's verbatim assertion (toBeUndefined()):
  // a *known* TIPO_BOX with an empty dataset is NOT dropped from `boxes` —
  // it gets a `visibile:false, html:''` entry, exactly like the pre-existing
  // 'documenti box lists links; cartelle box empty ⇒ hidden' test above
  // demonstrates for `cartelle`. Only genuinely *unknown* TIPO_BOX values
  // (see 'unknown TIPO_BOX is skipped...' test) are absent from `boxes`.
  expect(out.boxes['piani_pers_da_inviare']!.visibile).toBe(false);
  expect(out.boxes['piani_pers_da_inviare']!.html).toBe('');
});

test('cartelle box with DATI_SORGENTE.metodo=cartellePerClasse renders real LOG_FOLD folders, not CDU-embedded items', () => {
  const tables = fixtureTables();
  (tables['LOG_FOLD'] as Record<string, unknown>[]) = [
    {
      ID: 'folder1',
      TIPO: 'E2E_VERBALE',
      NOME: 'Verbali 5A',
      PATH: '_ALDO_E2E_OUTPUT/5A',
      LINK: 'https://drive.google.com/drive/folders/folder1',
      CLASSI: '5A',
      UTENTI: '',
      MATERIE: 'MATE,FISI'
    }
  ];
  const db = new FakeDatabase(tables);
  const aggregatoreDati = new AggregatoreDati(db);
  const templates = new FakeTemplateEngine();
  const composer = createBoxComposer(logger, templates);

  const out = renderBoxes(
    composer,
    confMail([{ TIPO_BOX: 'cartelle', DATI_SORGENTE: { metodo: 'cartellePerClasse' } }]),
    cduRecord(),
    materie(),
    templates,
    aggregatoreDati,
    '5A'
  );

  expect(out.boxes['cartelle']!.html).toContain('https://drive.google.com/drive/folders/folder1');
  expect(out.boxes['cartelle']!.html).toContain('Verbali 5A');
  expect(out.folderIds).toEqual(['folder1']);
});

test('cartelle box without DATI_SORGENTE falls back to CDU-embedded items and reports empty folderIds', () => {
  const out = render([{ TIPO_BOX: 'cartelle' }]);
  expect(out.folderIds).toEqual([]);
});
