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
import { AggregatoreDati } from '../../../src/application/services/AggregatoreDati';
import { COL_CONF_MAIL } from '../../../src/config/schema';

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
    meta: { oggi: { breve: '05/07/2026' } },
    focus: {
      classe: { nome: '5A' },
      alunno: {
        nomeCompleto: 'VERDI ANNA', email: 'a1@school.it',
        carenze: { elenco: [{ materiaSigla: 'MATE', voto: '4' }], numero: 1, hasElenco: true },
        documenti: {
            elenco: [
              {
                nome: 'PDP Anna',
                link: 'https://drive/x',
                tipo: 'PDP',
                stato: 'GENERATO',
                dataCreazione: '01/06/2026'
              }
            ],
            hasElenco: true, numero: 1,
            storico: { get: () => [] }
          }
      },
      carenza: {
        studente: { nomeCompleto: 'VERDI ANNA', email: 'a1@school.it' },
        progressivo: 1,
        data: '2026-02-15',
        classe: { nome: '5A' },
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
    TESTO_START: '',
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
  const box = out.boxes.perId['carenze_0']!;
  expect(box.isVisibile).toBe(true);
  expect(box.isVuoto).toBe(false);
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
  const box = out.boxes.perId['carenze_0']!;
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
  expect(out.boxes.perId['documenti_0']!.html).toContain('<a href="https://drive/x"');
  expect(out.boxes.perId['documenti_0']!.html).toContain('PDP Anna');
  expect(out.boxes.perId['cartelle_1']!.isVisibile).toBe(false);
  expect(out.boxes.perId['cartelle_1']!.html).toBe('');
});

test('boxes keeps every same-type instance under its stable instance key', () => {
  const out = render([
    { TIPO_BOX: 'note', TITOLO: 'Prima nota' },
    { TIPO_BOX: 'note', TITOLO: 'Seconda nota' }
  ]);

  expect(out.boxes.perId['note_0']!.titolo).toBe('Prima nota');
  expect(out.boxes.perId['note_1']!.titolo).toBe('Seconda nota');
});

test('renderBoxes returns the IDs of document and personalized-plan links rendered in the email body', () => {
  const templates = new FakeTemplateEngine();
  const composer = createBoxComposer(logger, templates);
  const cdu = cduRecord();
  const focus = cdu['focus'] as Record<string, unknown>;
  const alunno = focus['alunno'] as Record<string, unknown>;
  alunno['documenti'] = {
    elenco: [
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
  (focus['classe'] as Record<string, unknown>)['pianiPersonalizzati'] = {
    elenco: [
      {
        id: 'personal-plan-1',
        hasId: true,
        nome: 'PDP Anna',
        link: 'https://drive/personal-plan-1',
        sottotipo: 'PDP_BES',
        idGen: 'PIANI_PERSONALIZZATI',
        isNotificato: false
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

test('documenti/cartelle boxes fall back to focus.classe.documenti when focus.alunno is absent (coordinatore/CdC emails, 11 §11 new)', () => {
  const templates = new FakeTemplateEngine();
  const composer = createBoxComposer(logger, templates);
  const cdu: Record<string, unknown> = {
    meta: { oggi: { breve: '05/07/2026' } },
    focus: {
      classe: {
        nome: '5A',
        documenti: {
            elenco: [
              { nome: 'Verbale 5A', link: 'https://drive/verbale', tipo: 'VERBALE', idGen: 'VERBALE_CDC', stato: 'GENERATO', dataCreazione: '01/07/2026' },
              { nome: 'Cartella 5A', link: 'https://drive/cartella', tipo: 'CARTELLA', idGen: 'CARTELLA_5A', stato: 'GENERATO', dataCreazione: '01/07/2026' }
            ],
            hasElenco: true, numero: 2, storico: { get: () => [] }
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
  expect(out.boxes.perId['documenti_0']!.html).toContain('Verbale 5A');
  expect(out.boxes.perId['documenti_0']!.html).not.toContain('Cartella 5A');
  expect(out.boxes.perId['cartelle_1']!.isVisibile).toBe(true);
  expect(out.boxes.perId['cartelle_1']!.html).toContain('Cartella 5A');
});

test('documenti_dipartimento box is hidden when focus.dipartimento has no documents', () => {
  const templates = new FakeTemplateEngine();
  const composer = createBoxComposer(logger, templates);
  const cdu: Record<string, unknown> = {
    meta: { oggi: { breve: '05/07/2026' } },
    focus: {
      dipartimento: {
        documenti: { elenco: [], hasElenco: false, numero: 0, storico: { get: () => [] } }
      }
    }
  };
  const out = renderBoxes(
    composer,
    confMail([{ TIPO_BOX: 'documenti_dipartimento' }]),
    cdu,
    materie(),
    templates
  );
  expect(out.boxes.perId['documenti_dipartimento_0']!.isVuoto).toBe(true);
  expect(out.boxes.perId['documenti_dipartimento_0']!.isVisibile).toBe(false);
});

test('documenti_dipartimento box shows items from focus.dipartimento.documenti', () => {
  const templates = new FakeTemplateEngine();
  const composer = createBoxComposer(logger, templates);
  const cdu: Record<string, unknown> = {
    meta: { oggi: { breve: '05/07/2026' } },
    focus: {
      dipartimento: {
        documenti: {
            elenco: [
              {
                nome: 'Verbale',
                link: 'https://drive/verbale-dip',
                tipo: 'VERBALE_DIPARTIMENTO',
                idGen: 'VD',
                stato: 'GENERATO',
                dataCreazione: '01/01/2026'
              }
            ], hasElenco: true, numero: 1, storico: { get: () => [] }
        }
      }
    }
  };
  const out = renderBoxes(
    composer,
    confMail([{ TIPO_BOX: 'documenti_dipartimento' }]),
    cdu,
    materie(),
    templates
  );
  expect(out.boxes.perId['documenti_dipartimento_0']!.isVuoto).toBe(false);
  expect(out.boxes.perId['documenti_dipartimento_0']!.html).toContain('Verbale');
});

test('note + assenze boxes read focus.carenza (11 §11)', () => {
  const out = render([{ TIPO_BOX: 'note' }, { TIPO_BOX: 'assenze' }]);
  expect(out.boxes.perId['note_0']!.html).toContain('Studio discontinuo');
  expect(out.boxes.perId['assenze_1']!.html).toContain('assenze');
});

function cattedraVm(overrides: Partial<{ nome: string; sigla: string; isITP: boolean }> = {}) {
  return {
    sigla: overrides.sigla ?? 'MATE',
    nome: overrides.nome ?? 'Matematica',
    nomeSintetico: 'Matematica',
    colore1: '#c0392b',
    colore2: '#fdecea',
    isMateriaPrimaProva: false,
    isMateriaSecondaProva: false,
    principale: null,
    specificita: null,
    isITP: overrides.isItp ?? false,
    evoluzione: null
  };
}

function cattedreCdu(orePot?: unknown): Record<string, unknown> {
  const cdu = cduRecord();
  cdu['destinatario'] = {
    cattedre: {
      elenco: [
        {
          classe: { nome: '5A', anno: 5, sezione: 'A' },
          sezioneEstesa: 'A',
          materie: [cattedraVm({ nome: 'Matematica' })],
          hasMaterie: true,
          numeroMaterie: 1,
          materieDescrizione: 'Matematica',
          materieSigle: 'MATE'
        }
      ],
      hasElenco: true,
      numero: 1,
      elencoDescrizione: '5A',
      ...(orePot === undefined ? {} : { orePot })
    }
  };
  return cdu;
}

test('cattedre box renders one row per classe with its materie (design 2026-08-22)', () => {
  const templates = new FakeTemplateEngine();
  const composer = createBoxComposer(logger, templates);
  const cdu = cduRecord();
  cdu['destinatario'] = {
      cattedre: { elenco: [
        {
          classe: { nome: '5A', anno: 5, sezione: 'A' }, sezioneEstesa: 'A',
          materie: [cattedraVm({ nome: 'Matematica' }), cattedraVm({ nome: 'Fisica', sigla: 'FISI', isITP: true })], hasMaterie: true, numeroMaterie: 2, materieDescrizione: 'Matematica, Fisica', materieSigle: 'MATE, FISI'
        }
      ], hasElenco: true, numero: 1, elencoDescrizione: '5A' }
  };
  const out = renderBoxes(composer, confMail([{ TIPO_BOX: 'cattedre' }]), cdu, materie(), templates);
  expect(out.boxes.perId['cattedre_0']!.isVisibile).toBe(true);
  expect(out.boxes.perId['cattedre_0']!.html).toContain('5A');
  expect(out.boxes.perId['cattedre_0']!.html).toContain('Matematica');
  expect(out.boxes.perId['cattedre_0']!.html).toContain('Fisica');
});

test('cattedre box is hidden when destinatario.contesto.cattedre is absent/empty (design 2026-08-22)', () => {
  const out = render([{ TIPO_BOX: 'cattedre' }]);
  expect(out.boxes.perId['cattedre_0']!.isVisibile).toBe(false);
  expect(out.boxes.perId['cattedre_0']!.html).toBe('');
});

test('cattedre box HTML-escapes a hostile materia nome (design 2026-08-22)', () => {
  const templates = new FakeTemplateEngine();
  const composer = createBoxComposer(logger, templates);
  const cdu = cduRecord();
  cdu['destinatario'] = {
      cattedre: { elenco: [
        {
          classe: { nome: '5A', anno: 5, sezione: 'A' }, sezioneEstesa: 'A',
          materie: [cattedraVm({ nome: '<script>alert(1)</script>' })], hasMaterie: true, numeroMaterie: 1, materieDescrizione: '', materieSigle: 'MATE'
        }
      ], hasElenco: true, numero: 1, elencoDescrizione: '5A' }
  };
  const out = renderBoxes(composer, confMail([{ TIPO_BOX: 'cattedre' }]), cdu, materie(), templates);
  expect(out.boxes.perId['cattedre_0']!.html).not.toContain('<script>');
  expect(out.boxes.perId['cattedre_0']!.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
});

test('cattedre box appends plural Ore di potenziamento as the last item', () => {
  const templates = new FakeTemplateEngine();
  const out = renderBoxes(
    createBoxComposer(logger, templates),
    confMail([{ TIPO_BOX: 'cattedre' }]),
    cattedreCdu(3),
    materie(),
    templates
  );
  expect(out.boxes.perId['cattedre_0']!.html).toContain('Ore di potenziamento: 3 ore');
});

test('cattedre box uses singular ora for one Ore di potenziamento', () => {
  const templates = new FakeTemplateEngine();
  const out = renderBoxes(
    createBoxComposer(logger, templates),
    confMail([{ TIPO_BOX: 'cattedre' }]),
    cattedreCdu(1),
    materie(),
    templates
  );
  expect(out.boxes.perId['cattedre_0']!.html).toContain('Ore di potenziamento: 1 ora');
});

test.each([undefined, 0, -1, NaN, Infinity])(
  'cattedre box omits Ore di potenziamento for invalid value %p',
  (orePot) => {
    const templates = new FakeTemplateEngine();
    const out = renderBoxes(
      createBoxComposer(logger, templates),
      confMail([{ TIPO_BOX: 'cattedre' }]),
      cattedreCdu(orePot),
      materie(),
      templates
    );
    expect(out.boxes.perId['cattedre_0']!.html).not.toContain('Ore di potenziamento');
  }
);

test('testo_dinamico always visible, resolves CONTENUTO placeholders', () => {
  const out = render([
    { TIPO_BOX: 'testo_dinamico', CONTENUTO: '<p>Classe {{focus.classe.nome}}</p>' }
  ]);
  const box = out.boxes.perId['testo_dinamico_0']!;
  expect(box.isVisibile).toBe(true);
  expect(box.html).toContain('Classe 5A');
});

test('testo_dinamico HTML-escapes raw CDU string values (REVIEW_ALDO.md #2)', () => {
  const templates = new FakeTemplateEngine();
  const composer = createBoxComposer(logger, templates);
  const cdu = cduRecord();
  (cdu['focus'] as { alunno: { anagrafica: { nomeCompleto: string } } }).alunno.nomeCompleto =
    '<script>alert(1)</script>';
  const out = renderBoxes(
    composer,
    confMail([
      {
        TIPO_BOX: 'testo_dinamico',
        CONTENUTO: '<p>Ciao {{focus.alunno.nomeCompleto}}</p>'
      }
    ]),
    cdu,
    materie(),
    templates
  );
  const html = out.boxes.perId['testo_dinamico_0']!.html;
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
      TESTO_VUOTO: 'Nessuna cartella per {{focus.classe.nome}}'
    }
  ]);
  expect(out.ordered).toHaveLength(3);
  expect(out.ordered[0]).toContain('Voto 4'); // carenze first
  expect(out.ordered[1]).toContain('Studio discontinuo');
  expect(out.ordered[2]).toContain('Nessuna cartella per 5A'); // fallback
  const cartelle = out.boxes.perId['cartelle_2']!;
  expect(cartelle.isVuoto).toBe(true); // renderer output was empty
  expect(cartelle.isVisibile).toBe(true); // but fallback made it visible
});

test('TESTO_VUOTO fallback HTML-escapes raw CDU string values (REVIEW_ALDO.md #2)', () => {
  const templates = new FakeTemplateEngine();
  const composer = createBoxComposer(logger, templates);
  const cdu = cduRecord();
  (cdu['focus'] as { classe: { anagrafica: { nome: string } } }).classe.nome =
    '<b>5A</b>';
  const out = renderBoxes(
    composer,
    confMail([
      {
        TIPO_BOX: 'cartelle',
        MOSTRA_SE_VUOTO: true,
        TESTO_VUOTO: 'Nessuna cartella per {{focus.classe.nome}}'
      }
    ]),
    cdu,
    materie(),
    templates
  );
  const html = out.boxes.perId['cartelle_0']!.html;
  expect(html).not.toContain('<b>5A</b>');
  expect(html).toContain('&lt;b&gt;5A&lt;/b&gt;');
});

test('unknown TIPO_BOX is skipped with empty html (11 §5)', () => {
  const out = render([{ TIPO_BOX: 'inesistente' }, { TIPO_BOX: 'note' }]);
  expect(out.boxes.perId['inesistente']).toBeUndefined();
  expect(out.boxes.perId['note_1']!.isVisibile).toBe(true);
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
  expect(out.boxes.perId['note_0']!.html).toContain('&lt;script&gt;');
  expect(out.boxes.perId['note_0']!.html).not.toContain('<script>');
});

test('documenti box neutralises javascript: links and hostile colours', () => {
  const templates = new FakeTemplateEngine();
  const composer = createBoxComposer(logger, templates);
  const cdu = cduRecord();
  const alunno = (cdu['focus'] as { alunno: { documenti: { elenco: unknown[] } } }).alunno;
  alunno.documenti.elenco = [
    { nome: 'Doc', link: 'javascript:alert(1)', tipo: 'PDP', stato: 'GENERATO', dataCreazione: '' }
  ];
  const out = renderBoxes(
    composer,
    confMail([{ TIPO_BOX: 'documenti' }]),
    cdu,
    materie(),
    templates
  );
  expect(out.boxes.perId['documenti_0']!.html).toContain('href="#"');
  expect(out.boxes.perId['documenti_0']!.html).not.toContain('javascript:');
});

function cduWithStorico(
  storico: Array<{ anno: string; nome: string; link: string; tipo: string; sottotipo: string; idGen: string }>
) {
  const cdu = cduRecord();
  const alunno = (
    cdu['focus'] as {
      alunno: { documenti: { elenco: Array<Record<string, unknown>>; storico?: unknown } };
    }
  ).alunno;
  alunno.documenti.elenco[0]!['idGen'] = 'CD_PDP';
  alunno.documenti.storico = { get: () => storico, isResolved: () => true };
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
        ARRICCHISCI_CON_STORICO: true,
        CONFIG_ARRICCHIMENTO: {
          TEMPLATE_RIGA: '<li>{{corrente.nome}} — storico: {{#storico}}{{nome}} ({{anno}}){{/storico}}</li>'
        }
      }
    ]),
    cdu,
    materie(),
    templates
  );
  const html = out.boxes.perId['documenti_0']!.html;
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
    confMail([{ TIPO_BOX: 'documenti', ARRICCHISCI_CON_STORICO: true }]),
    cdu,
    materie(),
    templates
  );
  expect(out.boxes.perId['documenti_0']!.html).toContain('<a href="https://drive/x"');
  expect(out.boxes.perId['documenti_0']!.html).toContain('PDP Anna'); // current item's plain markup, unchanged
});

test('documenti box falls back to standard rendering when includiStorico was false (no LazyRef attached)', () => {
  const templates = new FakeTemplateEngine();
  const composer = createBoxComposer(logger, templates);
  const out = renderBoxes(
    composer,
    confMail([
      {
        TIPO_BOX: 'documenti',
        ARRICCHISCI_CON_STORICO: true,
        CONFIG_ARRICCHIMENTO: { TEMPLATE_RIGA: '<li>{{corrente.nome}}</li>' }
      }
    ]),
    cduRecord(), // no .storico attached
    materie(),
    templates
  );
  expect(out.boxes.perId['documenti_0']!.html).toContain('<li>PDP Anna</li>');
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
        ARRICCHISCI_CON_STORICO: true,
        CONFIG_ARRICCHIMENTO: { TEMPLATE_RIGA: '<li>{{#storico}}{{nome}}{{/storico}}</li>' }
      }
    ]),
    cdu,
    materie(),
    templates
  );
  expect(out.boxes.perId['documenti_0']!.html).toContain('&lt;script&gt;');
  expect(out.boxes.perId['documenti_0']!.html).not.toContain('<script>alert(1)</script>');
});

test('documenti box displayMode "link" shows the URL as link text', () => {
  const out = render([{ TIPO_BOX: 'documenti', DISPLAY_MODE: 'link' }]);
  const html = out.boxes.perId['documenti_0']!.html;
  expect(html).toContain('<a href="https://drive/x" target="_blank">https://drive/x</a>');
  expect(html).not.toContain('PDP Anna');
});

test('documenti box displayMode "nome+link" shows both nome and the link', () => {
  const out = render([{ TIPO_BOX: 'documenti', DISPLAY_MODE: 'nome+link' }]);
  const html = out.boxes.perId['documenti_0']!.html;
  expect(html).toContain('PDP Anna');
  expect(html).toContain('<a href="https://drive/x" target="_blank">https://drive/x</a>');
});

test('documenti box displayMode "sololink" shows a generic "Apri" label', () => {
  const out = render([{ TIPO_BOX: 'documenti', DISPLAY_MODE: 'sololink' }]);
  const html = out.boxes.perId['documenti_0']!.html;
  expect(html).toContain('<a href="https://drive/x" target="_blank">Apri</a>');
  expect(html).not.toContain('PDP Anna');
});

test('documenti box with no displayMode keeps the current default markup ("nome")', () => {
  const out = render([{ TIPO_BOX: 'documenti' }]);
  expect(out.boxes.perId['documenti_0']!.html).toContain(
    '<a href="https://drive/x" target="_blank">PDP Anna</a>'
  );
});

function pianiPersCduRecord(elenco: unknown[], storico?: unknown): Record<string, unknown> {
  return {
    meta: { oggi: { breve: '05/07/2026' } },
    focus: {
      classe: {
        nome: '5A',
        pianiPersonalizzati: {
          elenco: elenco.map((item) => ({ hasId: true, ...(item as object) })),
          hasElenco: elenco.length > 0,
          numero: elenco.length,
          ...(storico !== undefined ? { storico } : {})
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
        nome: 'PEI a1', link: 'http://d/1', tipo: 'PIANO_PERS', sottotipo: 'PEI', sottotipoLabel: 'PEI',
        generatoreId: 'PIANI_PERSONALIZZATI', stato: 'GENERATO', dataCreazione: '2026-03-01', isNotificato: false,
        studente: { nomeCompleto: 'VERDI ANNA', email: 'a1@school.it' }, classe: { nome: '5A' }
      },
      {
        nome: 'PDP a1', link: 'http://d/2', tipo: 'PIANO_PERS', sottotipo: 'PDP_BES', sottotipoLabel: 'PDP (BES)',
        generatoreId: 'PIANI_PERSONALIZZATI', stato: 'GENERATO', dataCreazione: '2026-03-02', isNotificato: true,
        studente: { nomeCompleto: 'VERDI ANNA', email: 'a1@school.it' }, classe: { nome: '5A' }
      },
      {
        nome: 'PDP a2', link: 'http://d/3', tipo: 'PIANO_PERS', sottotipo: 'PDP_BES', sottotipoLabel: 'PDP (BES)',
        generatoreId: 'PIANI_PERSONALIZZATI', stato: 'GENERATO', dataCreazione: '2026-03-03', isNotificato: false,
        studente: { nomeCompleto: 'NERI PAOLO', email: 'a2@school.it' }, classe: { nome: '5A' }
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
  const html = out.boxes.perId['piani_pers_da_inviare_0']!.html;
  expect((html.match(/Piani personalizzati da notificare/g) ?? [])).toHaveLength(1);
  const [peiRow, pdpRow] = html.split('</li>');
  expect(html).toContain('VERDI ANNA - 5A - PEI');
  expect(html).toContain('NERI PAOLO - 5A - PDP (BES)');
  expect(html).not.toContain('VERDI ANNA - 5A - PDP (BES)'); // NOTIFICATO, excluded
  expect(out.boxes.perId['piani_pers_da_inviare_0']!.html).toContain('piano dell\'anno precedente');
  expect(peiRow).toContain('http://d/old-pei');
  expect(peiRow).not.toContain('http://d/old-pdp'); // same ID_GEN, wrong subtype
  expect(pdpRow).not.toContain('http://d/old-pdp'); // same subtype, different student
});

test('piani_pers_da_inviare: always uses its built-in row and dark-red border, ignoring row-template configuration', () => {
  const templates = new FakeTemplateEngine();
  const composer = createBoxComposer(logger, templates);
  const cdu = pianiPersCduRecord(
    [
      {
        nome: 'PDP a1', link: 'http://d/1', tipo: 'PIANO_PERS', sottotipo: 'PDP_BES',
        sottotipoLabel: 'PDP (BES)', generatoreId: 'PIANI_PERSONALIZZATI', stato: 'GENERATO', dataCreazione: '2026-03-01', isNotificato: false,
        studente: { nomeCompleto: 'VERDI ANNA', email: 'a1@school.it' }, classe: { nome: '5A' }
      }
    ],
    new LazyRef(() => [
      {
        anno: '2025-2026', nome: 'PDP a1 anno scorso', link: 'http://d/old-pdp',
        tipo: 'PIANO_PERS', sottotipo: 'PDP_BES', idGen: 'PIANI_PERSONALIZZATI', studenteEmail: 'a1@school.it'
      },
      {
        anno: '2025-2026', nome: 'PEI a1 anno scorso', link: 'http://d/old-pei',
        tipo: 'PIANO_PERS', sottotipo: 'PEI', idGen: 'PIANI_PERSONALIZZATI', studenteEmail: 'a1@school.it'
      }
    ])
  );
  const out = renderBoxes(
    composer,
    confMail([
      {
        TIPO_BOX: 'piani_pers_da_inviare',
        ARRICCHISCI_CON_STORICO: true,
        CONFIG_ARRICCHIMENTO: { TEMPLATE_RIGA: '<li>{{tipoLabel}}</li>' }
      }
    ]),
    cdu,
    materie(),
    templates
  );
  const html = out.boxes.perId['piani_pers_da_inviare_0']!.html;
  expect(html).toContain('VERDI ANNA - 5A - PDP (BES)');
  expect(html).toContain('href="http://d/1"');
  expect(html).toContain('href="http://d/old-pdp"');
  expect(html).toContain('piano dell\'anno precedente');
  expect(html).not.toContain('http://d/old-pei');
  expect(html).toContain('border-left:4px solid #C62828');
});

test('piani_pers_da_inviare: keeps current plans visible when historical lookup fails', () => {
  const templates = new FakeTemplateEngine();
  const composer = createBoxComposer(logger, templates);
  const warn = jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
  const cdu = pianiPersCduRecord(
    [
      {
        nome: 'PDP corrente', link: 'http://d/1', tipo: 'PIANO_PERS', sottotipo: 'PDP_BES',
        sottotipoLabel: 'PDP (BES)', generatoreId: 'PIANI_PERSONALIZZATI', stato: 'GENERATO', dataCreazione: '2026-03-01', isNotificato: false,
        studente: { nomeCompleto: 'VERDI ANNA', email: 'a1@school.it' }, classe: { nome: '5A' }
      }
    ],
    new LazyRef(() => {
      throw new Error('storico non disponibile');
    })
  );

  const out = renderBoxes(
    composer,
    confMail([{ TIPO_BOX: 'piani_pers_da_inviare', ARRICCHISCI_CON_STORICO: true }]),
    cdu,
    materie(),
    templates
  );

  expect(out.boxes.perId['piani_pers_da_inviare_0']!.html).toContain('VERDI ANNA - 5A - PDP (BES)');
  expect(warn).toHaveBeenCalledWith(
    expect.stringContaining('Piani personalizzati: storico non disponibile')
  );
  warn.mockRestore();
});

test('piani_pers_da_inviare: escapes hostile tipoLabel/studente.nomeCompleto in the default-template (historical) path', () => {
  const templates = new FakeTemplateEngine();
  const composer = createBoxComposer(logger, templates);
  const cdu = pianiPersCduRecord(
    [
      {
        nome: 'PDP a1', link: 'http://d/1', tipo: 'PIANO_PERS', sottotipo: 'PDP_BES', sottotipoLabel: '<script>alert(1)</script>',
        generatoreId: 'PDP_BES', stato: 'GENERATO', dataCreazione: '2026-03-01', isNotificato: false,
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
  const html = out.boxes.perId['piani_pers_da_inviare_0']!.html;
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
        nome: 'PEI a1', link: 'http://d/1', tipo: 'PIANO_PERS', sottotipo: 'PEI', sottotipoLabel: 'PEI',
        generatoreId: 'PIANI_PERSONALIZZATI', stato: 'GENERATO', dataCreazione: '2026-03-01', isNotificato: false,
        studente: { nomeCompleto: 'VERDI ANNA', email: 'a1@school.it' }, classe: { nome: '5A' }
      },
      {
        nome: 'PDP a1', link: 'http://d/2', tipo: 'PIANO_PERS', sottotipo: 'PDP_BES', sottotipoLabel: 'PDP (BES)',
        generatoreId: 'PIANI_PERSONALIZZATI', stato: 'GENERATO', dataCreazione: '2026-03-02', isNotificato: true,
        studente: { nomeCompleto: 'VERDI ANNA', email: 'a1@school.it' }, classe: { nome: '5A' }
      },
      {
        nome: 'PEI a2', link: 'http://d/3', tipo: 'PIANO_PERS', sottotipo: 'PEI', sottotipoLabel: 'PEI',
        generatoreId: 'PIANI_PERSONALIZZATI', stato: 'GENERATO', dataCreazione: '2026-03-03', isNotificato: true,
        studente: { nomeCompleto: 'NERI PAOLO', email: 'a2@school.it' }, classe: { nome: '5A' }
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
  const html = out.boxes.perId['piani_pers_inviati_0']!.html;
  expect(html).toContain('VERDI ANNA - 5A - PDP (BES)');
  expect(html).toContain('NERI PAOLO - 5A - PEI');
  expect(html).not.toContain('VERDI ANNA - 5A - PEI'); // NOTIFICATO absent, excluded
  expect(html).not.toContain('Si invia anche');
});

test('piani_pers_inviati: never shows historical plans, even when the box config explicitly asks for enrichment (11 §11: historical plans belong only to the not-yet-notified box)', () => {
  const templates = new FakeTemplateEngine();
  const composer = createBoxComposer(logger, templates);
  const cdu = pianiPersCduRecord(
    [
      {
        nome: 'PDP a1', link: 'http://d/1', tipo: 'PIANO_PERS', sottotipo: 'PDP_BES', sottotipoLabel: 'PDP (BES)',
        generatoreId: 'PIANI_PERSONALIZZATI', stato: 'GENERATO', dataCreazione: '2026-03-01', isNotificato: true,
        studente: { nomeCompleto: 'VERDI ANNA', email: 'a1@school.it' }, classe: { nome: '5A' }
      }
    ],
    new LazyRef(() => [
      {
        anno: '2025-2026', nome: 'PDP a1 anno scorso', link: 'http://d/old-pdp',
        tipo: 'PIANO_PERS', sottotipo: 'PDP_BES', idGen: 'PIANI_PERSONALIZZATI', studenteEmail: 'a1@school.it'
      }
    ])
  );
  const out = renderBoxes(
    composer,
    confMail([
      {
        TIPO_BOX: 'piani_pers_inviati',
        ARRICCHISCI_CON_STORICO: true,
        CONFIG_ARRICCHIMENTO: {
          TEMPLATE_RIGA:
            '<li>{{corrente.studente.nomeCompleto}} - {{corrente.sottotipoLabel}}{{#storico}} - {{nome}}{{/storico}}</li>'
        }
      }
    ]),
    cdu,
    materie(),
    templates
  );
  const html = out.boxes.perId['piani_pers_inviati_0']!.html;
  expect(html).toContain('VERDI ANNA - PDP (BES)');
  expect(html).not.toContain('PDP a1 anno scorso');
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
  expect(out.boxes.perId['piani_pers_da_inviare_0']!.isVisibile).toBe(false);
  expect(out.boxes.perId['piani_pers_da_inviare_0']!.html).toBe('');
});

test('documenti box renders only the valid DATI_SORGENTE.filtri result and returns its rendered ID', () => {
  const tables = fixtureTables();
  (tables['LOG_DOCS'] as Record<string, unknown>[]) = [
    {
      ID: 'doc-ammesso', ID_GEN: 'VERBALE_CDC', TIPO: 'VERBALE', SOTTOTIPO: 'CDC',
      NOME: 'Verbale CDC', STATO: 'GENERATO', LINK: 'https://drive/doc-ammesso',
      CLASSI: '5A', UTENTI: '', MATERIE: 'MATE', DATA_CREAZ: '2026-07-01'
    },
    {
      ID: 'doc-archiviato', ID_GEN: 'VERBALE_CDC', TIPO: 'VERBALE', SOTTOTIPO: 'CDC',
      NOME: 'Verbale archiviato', STATO: 'ARCHIVIATO', LINK: 'https://drive/doc-archiviato',
      CLASSI: '5A', UTENTI: '', MATERIE: 'MATE', DATA_CREAZ: '2026-07-02'
    },
    {
      ID: 'doc-altro', ID_GEN: 'VERBALE_ALTRO', TIPO: 'VERBALE', SOTTOTIPO: 'ALTRO',
      NOME: 'Verbale altra tipologia', STATO: 'GENERATO', LINK: 'https://drive/doc-altro',
      CLASSI: '5A', UTENTI: '', MATERIE: 'MATE', DATA_CREAZ: '2026-07-03'
    }
  ];
  const templates = new FakeTemplateEngine();
  const composer = createBoxComposer(logger, templates);
  const out = renderBoxes(
    composer,
    confMail([
      {
        TIPO_BOX: 'documenti',
        DATI_SORGENTE: {
          metodo: 'documentiPerClasse',
          filtri: { tipo: 'VERBALE', sottotipo: 'CDC', not: { stato: 'ARCHIVIATO' } }
        }
      }
    ]),
    cduRecord(),
    materie(),
    templates,
    new AggregatoreDati(new FakeDatabase(tables)),
    { classiCompetenza: ['5A'] },
    logger
  );

  expect(out.boxes.perId['documenti_0']!.html).toContain('Verbale CDC');
  expect(out.boxes.perId['documenti_0']!.html).not.toContain('Verbale archiviato');
  expect(out.boxes.perId['documenti_0']!.html).not.toContain('Verbale altra tipologia');
  expect(out.documentIds).toEqual(['doc-ammesso']);
});

test('documenti box with DATI_SORGENTE and no filtri keeps every item in its scope', () => {
  const tables = fixtureTables();
  (tables['LOG_DOCS'] as Record<string, unknown>[]) = [
    {
      ID: 'doc-a', ID_GEN: 'A', TIPO: 'VERBALE', NOME: 'Verbale A', STATO: 'GENERATO',
      LINK: 'https://drive/doc-a', CLASSI: '5A', UTENTI: '', MATERIE: 'MATE', DATA_CREAZ: '2026-07-01'
    },
    {
      ID: 'doc-b', ID_GEN: 'B', TIPO: 'PIANO_LAVORO', NOME: 'Piano B', STATO: 'ARCHIVIATO',
      LINK: 'https://drive/doc-b', CLASSI: '5A', UTENTI: '', MATERIE: 'MATE', DATA_CREAZ: '2026-07-02'
    }
  ];
  const templates = new FakeTemplateEngine();
  const composer = createBoxComposer(logger, templates);
  const out = renderBoxes(
    composer,
    confMail([{ TIPO_BOX: 'documenti', DATI_SORGENTE: { metodo: 'documentiPerClasse' } }]),
    cduRecord(),
    materie(),
    templates,
    new AggregatoreDati(new FakeDatabase(tables)),
    { classiCompetenza: ['5A'] },
    logger
  );

  expect(out.boxes.perId['documenti_0']!.html).toContain('Verbale A');
  expect(out.boxes.perId['documenti_0']!.html).toContain('Piano B');
  expect(out.documentIds).toEqual(['doc-a', 'doc-b']);
});

test('source IDs are not recorded when a prerequisite hides source content and TESTO_VUOTO is shown', () => {
  const tables = fixtureTables();
  (tables['LOG_DOCS'] as Record<string, unknown>[]) = [
    {
      ID: 'doc-nascosto', ID_GEN: 'VERBALE', TIPO: 'VERBALE', NOME: 'Documento nascosto',
      STATO: 'GENERATO', LINK: 'https://drive/doc-nascosto', CLASSI: '5A', UTENTI: '',
      MATERIE: 'MATE', DATA_CREAZ: '2026-07-01'
    }
  ];
  (tables['LOG_FOLD'] as Record<string, unknown>[]) = [
    {
      ID: 'folder-nascosta', TIPO: 'VERBALI', NOME: 'Cartella nascosta', PATH: '_ALDO/5A',
      LINK: 'https://drive/folder-nascosta', CLASSI: '5A', UTENTI: '', MATERIE: 'MATE'
    }
  ];
  const templates = new FakeTemplateEngine();
  const out = renderBoxes(
    createBoxComposer(logger, templates),
    confMail([
      {
        TIPO_BOX: 'documenti', PREREQUISITI: 'never', MOSTRA_SE_VUOTO: true,
        TESTO_VUOTO: 'Documenti non disponibili',
        DATI_SORGENTE: { metodo: 'documentiPerClasse' }
      },
      {
        TIPO_BOX: 'cartelle', PREREQUISITI: 'never', MOSTRA_SE_VUOTO: true,
        TESTO_VUOTO: 'Cartelle non disponibili',
        DATI_SORGENTE: { metodo: 'cartellePerClasse' }
      }
    ]),
    cduRecord(), materie(), templates, new AggregatoreDati(new FakeDatabase(tables)),
    { classiCompetenza: ['5A'] }, logger
  );

  expect(out.boxes.perId['documenti_0']!.html).toContain('Documenti non disponibili');
  expect(out.boxes.perId['cartelle_1']!.html).toContain('Cartelle non disponibili');
  expect(out.documentIds).toEqual([]);
  expect(out.folderIds).toEqual([]);
});

test('a per-classe source without competence or focus class warns and skips its box', () => {
  const warn = jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
  const templates = new FakeTemplateEngine();
  const out = renderBoxes(
    createBoxComposer(logger, templates),
    confMail([{ TIPO_BOX: 'documenti', DATI_SORGENTE: { metodo: 'documentiPerClasse' } }]),
    cduRecord(), materie(), templates, new AggregatoreDati(new FakeDatabase(fixtureTables())),
    {}, logger
  );

  expect(out.boxes.perId['documenti_0']).toBeUndefined();
  expect(warn).toHaveBeenCalledWith(
    expect.stringContaining('classeId mancante o non risolvibile')
  );
  warn.mockRestore();
});

test('legacy document filters make only that box invisible and log a CONF_MAIL configuration error', () => {
  const error = jest.spyOn(logger, 'error').mockImplementation(() => undefined);
  const out = renderBoxes(
    createBoxComposer(logger, new FakeTemplateEngine()),
    confMail([{ TIPO_BOX: 'documenti', FILTRO_TIPO: 'VERBALE', FILTRO_STATO: 'GENERATO' }]),
    cduRecord(),
    materie(),
    new FakeTemplateEngine(),
    undefined,
    undefined,
    logger
  );

  expect(out.boxes.perId['documenti_0']).toBeUndefined();
  expect(out.documentIds).toEqual([]);
  expect(error).toHaveBeenCalledWith(
    expect.stringContaining('CONF_MAIL P1')
  );
  expect(error).toHaveBeenCalledWith(
    expect.stringContaining('FILTRO_TIPO')
  );
  expect(error).toHaveBeenCalledWith(
    expect.stringContaining('FILTRO_STATO')
  );
  error.mockRestore();
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
    { classiCompetenza: ['5A'] }
  );

  expect(out.boxes.perId['cartelle_0']!.html).toContain('https://drive.google.com/drive/folders/folder1');
  expect(out.boxes.perId['cartelle_0']!.html).toContain('Verbali 5A');
  expect(out.folderIds).toEqual(['folder1']);
});

test('cartellePerClasse includes folders for all competent classes and deduplicates them by ID', () => {
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
    },
    {
      ID: 'folder2',
      TIPO: 'E2E_VERBALE',
      NOME: 'Verbali 3B',
      PATH: '_ALDO_E2E_OUTPUT/3B',
      LINK: 'https://drive.google.com/drive/folders/folder2',
      CLASSI: '3B',
      UTENTI: '',
      MATERIE: 'MATE,FISI'
    },
    {
      ID: 'folder1',
      TIPO: 'E2E_VERBALE',
      NOME: 'Verbali 5A',
      PATH: '_ALDO_E2E_OUTPUT/5A',
      LINK: 'https://drive.google.com/drive/folders/folder1',
      CLASSI: '5A,3B',
      UTENTI: '',
      MATERIE: 'MATE,FISI'
    }
  ];
  const aggregatoreDati = new AggregatoreDati(new FakeDatabase(tables));
  const templates = new FakeTemplateEngine();
  const composer = createBoxComposer(logger, templates);

  const out = renderBoxes(
    composer,
    confMail([{ TIPO_BOX: 'cartelle', DATI_SORGENTE: { metodo: 'cartellePerClasse' } }]),
    cduRecord(),
    materie(),
    templates,
    aggregatoreDati,
    { classiCompetenza: ['5A', '3B'] }
  );

  expect(out.folderIds.sort()).toEqual(['folder1', 'folder2']);
  expect(out.boxes.perId['cartelle_0']!.html).toContain('Verbali 5A');
  expect(out.boxes.perId['cartelle_0']!.html).toContain('Verbali 3B');
});

test('cartelle boxes use validated class, user, and department sources with filters and deduplicate rendered folder IDs', () => {
  const tables = fixtureTables();
  (tables['LOG_FOLD'] as Record<string, unknown>[]) = [
    {
      ID: 'folder-classe', TIPO: 'VERBALI', NOME: 'Verbali consiglio', PATH: '_ALDO/5A',
      LINK: 'https://drive/folder-classe', CLASSI: '5A,3B', UTENTI: '', MATERIE: 'MATE,FISI'
    },
    {
      ID: 'folder-archivio', TIPO: 'VERBALI', NOME: 'Verbali archivio', PATH: '_ALDO/archivio',
      LINK: 'https://drive/folder-archivio', CLASSI: '5A', UTENTI: '', MATERIE: 'MATE'
    },
    {
      ID: 'folder-utente', TIPO: 'AREA', NOME: 'Area studente', PATH: '_ALDO/studenti/a1',
      LINK: 'https://drive/folder-utente', CLASSI: '', UTENTI: 'a1@school.it', MATERIE: ''
    },
    {
      ID: 'folder-dipartimento', TIPO: 'DIPART', NOME: 'Materiali scientifici', PATH: '_ALDO/dipartimenti/scienze',
      LINK: 'https://drive/folder-dipartimento', CLASSI: '', UTENTI: '', MATERIE: 'MATE'
    }
  ];
  const templates = new FakeTemplateEngine();
  const composer = createBoxComposer(logger, templates);
  const perClasse = renderBoxes(
    composer,
    confMail([
      {
        TIPO_BOX: 'cartelle',
        DATI_SORGENTE: {
          metodo: 'cartellePerClasse',
          filtri: { nome: 'Verbali', path: '_ALDO', materie: 'MATE', not: { path: 'archivio' } }
        }
      }
    ]),
    cduRecord(), materie(), templates, new AggregatoreDati(new FakeDatabase(tables)),
    { classiCompetenza: ['5A', '3B'] }, logger
  );
  const perUtente = renderBoxes(
    composer,
    confMail([{ TIPO_BOX: 'cartelle', DATI_SORGENTE: { metodo: 'cartellePerUtente', filtri: { nome: 'Area' } } }]),
    cduRecord(), materie(), templates, new AggregatoreDati(new FakeDatabase(tables)),
    { utenteEmail: 'a1@school.it' }, logger
  );
  const perDipartimento = renderBoxes(
    composer,
    confMail([{ TIPO_BOX: 'cartelle', DATI_SORGENTE: { metodo: 'cartellePerDipartimento', filtri: { nome: 'Materiali', materie: ['MATE'] } } }]),
    cduRecord(), materie(), templates, new AggregatoreDati(new FakeDatabase(tables)),
    { dipartimentoId: 'SCIENTIFICO_DIP' }, logger
  );

  expect(perClasse.boxes.perId['cartelle_0']!.html).toContain('Verbali consiglio');
  expect(perClasse.boxes.perId['cartelle_0']!.html).not.toContain('Verbali archivio');
  expect(perClasse.folderIds).toEqual(['folder-classe']);
  expect(perUtente.folderIds).toEqual(['folder-utente']);
  expect(perDipartimento.folderIds).toEqual(['folder-dipartimento']);
});

test('a cartelle box with a document-only filter is skipped without suppressing other boxes', () => {
  const error = jest.spyOn(logger, 'error').mockImplementation(() => undefined);
  const templates = new FakeTemplateEngine();
  const out = renderBoxes(
    createBoxComposer(logger, templates),
    confMail([
      { TIPO_BOX: 'carenze' },
      { TIPO_BOX: 'cartelle', DATI_SORGENTE: { metodo: 'cartellePerClasse', filtri: { sottotipo: 'CDC' } } }
    ]),
    cduRecord(), materie(), templates, new AggregatoreDati(new FakeDatabase(fixtureTables())),
    { classiCompetenza: ['5A'] }, logger
  );

  expect(out.boxes.perId['carenze_0']!.isVisibile).toBe(true);
  expect(out.boxes.perId['cartelle_0']).toBeUndefined();
  expect(out.folderIds).toEqual([]);
  expect(error).toHaveBeenCalledWith(expect.stringContaining('CONF_MAIL P1'));
  error.mockRestore();
});

test('cartelle box without DATI_SORGENTE falls back to CDU-embedded items and reports empty folderIds', () => {
  const out = render([{ TIPO_BOX: 'cartelle' }]);
  expect(out.folderIds).toEqual([]);
});

test('BOX_CFG.TITOLO is interpolated against the CDU (11 §5)', () => {
  const templates = new FakeTemplateEngine();
  const composer = createBoxComposer(logger, templates);
  const conf = new ConfigurazioneEmail({
    [COL_CONF_MAIL.ID]: 'T1',
    [COL_CONF_MAIL.PROCESSO]: 'PER_CDC',
    [COL_CONF_MAIL.BOX_CFG]: JSON.stringify([
      { TIPO_BOX: 'note', TITOLO: 'Note per {{focus.classe.nome}}' }
    ])
  });
  const cdu = cduRecord();
  (cdu['focus'] as Record<string, unknown>)['carenza'] = { note: 'Testo libero' };

  const { boxes: { perId: boxes } } = renderBoxes(composer, conf, cdu, materie(), templates);

  expect(boxes['note_0']!.titolo).toBe('Note per 5A');
  expect(boxes['note_0']!.html).toContain('Note per 5A');
});
