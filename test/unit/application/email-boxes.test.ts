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

const logger = new LoggerService();

function materie(): MateriaRepository {
  return new MateriaRepository(new FakeDatabase(fixtureTables()));
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
          documenti: { items: [{ nome: 'PDP Anna', link: 'https://drive/x', tipo: 'PDP', stato: 'GENERATO', dataCreazione: '01/06/2026' }], hasDocumenti: true }
        }
      },
      carenza: { studente: 'a1@school.it', progressivo: 1, data: '2026-02-15', classe: '5A', hasAssenze: true, note: 'Studio discontinuo' }
    }
  };
}

function confMail(boxCfg: unknown): ConfigurazioneEmail {
  return ConfigurazioneEmail.fromData({
    ID: 'P1', OGGETTO: 'Oggetto', PROCESSO: 'PER_GENITORI_ALUNNO', BOX_CFG: JSON.stringify(boxCfg),
    TESTO: '', SUPPLENTI: 'SOLO_TITOLARI', NOREPLY: false, COLORE_HEADER: '', CONDIZIONE: null, POST_PROCESSO: null
  });
}

function render(boxCfg: unknown) {
  const templates = new FakeTemplateEngine();
  const composer = createBoxComposer(logger, templates);
  return renderBoxes(composer, confMail(boxCfg), cduRecord(), materie(), templates);
}

test('mapCarenzeFormatoB enriches with MATERIE colours/symbol, default #ddd for unknown', () => {
  const rows = mapCarenzeFormatoB([{ materia: 'MATE', voto: '4' }, { materia: 'XXX', voto: '5' }], materie());
  expect(rows[0]).toMatchObject({ sigla: 'MATE', colore: '#c0392b', colore2: '#fdecea', simbolo: '📐', nomeSintesi: 'Matematica' });
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

test('note + assenze boxes read focus.carenza (11 §11)', () => {
  const out = render([{ TIPO_BOX: 'note' }, { TIPO_BOX: 'assenze' }]);
  expect(out.boxes['note']!.html).toContain('Studio discontinuo');
  expect(out.boxes['assenze']!.html).toContain('assenze');
});

test('testo_dinamico always visible, resolves CONTENUTO placeholders', () => {
  const out = render([{ TIPO_BOX: 'testo_dinamico', CONTENUTO: '<p>Classe {{focus.classe.anagrafica.nome}}</p>' }]);
  const box = out.boxes['testo_dinamico']!;
  expect(box.visibile).toBe(true);
  expect(box.html).toContain('Classe 5A');
});

test('boxes ordered by ORDINE; MOSTRA_SE_VUOTO falls back to TESTO_VUOTO', () => {
  const out = render([
    { TIPO_BOX: 'note', ORDINE: 2 },
    { TIPO_BOX: 'carenze', ORDINE: 1 },
    { TIPO_BOX: 'cartelle', ORDINE: 3, MOSTRA_SE_VUOTO: true, TESTO_VUOTO: 'Nessuna cartella per {{focus.classe.anagrafica.nome}}' }
  ]);
  expect(out.ordered).toHaveLength(3);
  expect(out.ordered[0]).toContain('Voto 4'); // carenze first
  expect(out.ordered[1]).toContain('Studio discontinuo');
  expect(out.ordered[2]).toContain('Nessuna cartella per 5A'); // fallback
  const cartelle = out.boxes['cartelle']!;
  expect(cartelle.isEmpty).toBe(true); // renderer output was empty
  expect(cartelle.visibile).toBe(true); // but fallback made it visible
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
  const didattica = (cdu['focus'] as { alunno: { didattica: { documenti: { items: unknown[] } } } }).alunno.didattica;
  didattica.documenti.items = [{ nome: 'Doc', link: 'javascript:alert(1)', tipo: 'PDP', stato: 'GENERATO', dataCreazione: '' }];
  const out = renderBoxes(composer, confMail([{ TIPO_BOX: 'documenti' }]), cdu, materie(), templates);
  expect(out.boxes['documenti']!.html).toContain('href="#"');
  expect(out.boxes['documenti']!.html).not.toContain('javascript:');
});
