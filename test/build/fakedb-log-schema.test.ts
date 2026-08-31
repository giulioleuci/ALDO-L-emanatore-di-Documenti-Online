import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function header(file: string): string[] {
  return readFileSync(resolve(__dirname, '../../FAKEDB', file), 'utf8')
    .trim()
    .split('\n')[0]!
    .split(',');
}

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i]!;
    if (char === '"') {
      if (quoted && line[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === ',' && !quoted) {
      cells.push(cell);
      cell = '';
    } else {
      cell += char;
    }
  }
  cells.push(cell);
  return cells;
}

function csvRecords(file: string): Array<Record<string, string>> {
  const lines = readFileSync(resolve(__dirname, '../../FAKEDB', file), 'utf8')
    .trim()
    .split('\n');
  const columns = parseCsvLine(lines[0]!);
  return lines
    .slice(1)
    .map((line) =>
      Object.fromEntries(columns.map((column, index) => [column, parseCsvLine(line)[index] ?? '']))
    );
}

test('FAKEDB log tables use the plural MATERIE column', () => {
  const logDocs = header('LOG_DOCS.csv');
  const logFold = header('LOG_FOLD.csv');

  expect(logDocs).toContain('MATERIE');
  expect(logFold).toContain('MATERIE');
  expect(logDocs).not.toContain('MATERIA');
  expect(logFold).not.toContain('MATERIA');
});

test('FAKEDB represents all personalized plans with one conditional PIANI_PERSONALIZZATI recipe', () => {
  const piani = csvRecords('CONF_DOC.csv').filter((row) => row['TIPO'] === 'PIANO_PERS');

  expect(piani).toHaveLength(1);
  expect(piani[0]!['ID']).toBe('PIANI_PERSONALIZZATI');
  expect(piani[0]!['GENERATORE']).toBe('DOC_PERSONALIZZATO');
  expect(piani[0]!['PARAMETRI']).not.toContain('tipoPiano');
  expect(JSON.parse(piani[0]!['MODELLI']!)).toEqual([
    {
      condizione: '{{focus.piano.tipo}} == "PDP_DSA"',
      templateId: '1TEMPLATE_PDP_DSA_00000000000000000000'
    },
    {
      condizione: '{{focus.piano.tipo}} == "PDP_BES"',
      templateId: '1TEMPLATE_PDP_BES_00000000000000000000'
    },
    {
      condizione: '{{focus.piano.tipo}} == "PDP_STRANIERI"',
      templateId: '1TEMPLATE_PDP_STRANIERI_000000000000000'
    },
    {
      condizione: '{{focus.piano.tipo}} == "PEI"',
      templateId: '1TEMPLATE_PEI_00000000000000000000000'
    },
    {
      condizione: '{{focus.piano.tipo}} == "PFP"',
      templateId: '1TEMPLATE_PFP_00000000000000000000000'
    }
  ]);
  expect(JSON.parse(piani[0]!['REGISTRA_DOC']!)).toMatchObject({
    utenti: '{{focus.alunno.email}}'
  });
});

test('FAKEDB CONF_MAIL rows expose the complete deployment schema with safe duplicate defaults', () => {
  expect(header('CONF_MAIL.csv')).toEqual([
    'ID',
    'OGGETTO',
    'PROCESSO',
    'BOX_CFG',
    'TESTO_START',
    'TESTO_END',
    'SUPPLENTI',
    'NOREPLY',
    'COLORE_HEADER',
    'CONDIZIONE',
    'POST_PROCESSO',
    'ALLEGATI',
    'GESTIONE_ARTICOLAZIONE',
    'DUPLICAZIONE',
    'RISPONDI_A'
  ]);

  for (const row of csvRecords('CONF_MAIL.csv')) {
    expect(JSON.parse(row['ALLEGATI']!)).toEqual([]);
    expect(row['GESTIONE_ARTICOLAZIONE']).toBe('COMPLETA');
    expect(row['DUPLICAZIONE']).toBe('NEGATA');
  }
});
