import { regoleValidazione, messaggioErrore, VALIDATION_TABLES } from '../../../src/config/validationRules';
import { TABLE } from '../../../src/config/schema';

test('every rule targets a table the service will load', () => {
  for (const rule of regoleValidazione()) {
    expect(VALIDATION_TABLES).toContain(rule.table);
  }
});

test('rule ids are unique', () => {
  const ids = regoleValidazione().map((r) => r.id);
  expect(new Set(ids).size).toBe(ids.length);
});

test('the spec FK map is covered', () => {
  const fks = regoleValidazione().filter((r) => r.type === 'foreignKey');
  const pairs = fks.map((r) => `${r.table}.${r.column}->${r.targetTable}.${r.targetColumn}`);
  expect(pairs).toContain('ALUNNI.CLASSE->CLASSI.ID');
  expect(pairs).toContain('CLASSI.INDIRIZZO->INDIRIZZI.ID');
  expect(pairs).toContain('DIPART.MATERIE->MATERIE.ID');
  expect(pairs).toContain('SUPPLENZE.SUPPLENTE->DOCENTI.EMAIL');
  expect(pairs).toContain('LOG_MAIL.PATTERN->CONF_MAIL.ID');
  expect(pairs).toContain('LOG_FOLD.TIPO->CONF_DOC.ID');
  expect(fks.length).toBeGreaterThanOrEqual(28);
});

test('SUPPLENZE/VARIAZIONI class and subject lists accept the * wildcard', () => {
  const wildcarded = regoleValidazione().filter(
    (r) => r.type === 'foreignKey' && r.allowWildcard === true
  );
  expect(wildcarded.map((r) => `${r.table}.${r.column}`)).toEqual(
    expect.arrayContaining([
      'SUPPLENZE.CLASSI',
      'SUPPLENZE.MATERIE',
      'VARIAZIONI_CATTEDRA.CLASSI',
      'VARIAZIONI_CATTEDRA.MATERIE'
    ])
  );
});

test('ENUM rules use the domain enums', () => {
  const genere = regoleValidazione().find((r) => r.id === 'ENUM_DOCENTI_GENERE');
  expect(genere).toMatchObject({ type: 'enum', table: TABLE.DOCENTI, column: 'GENERE', values: ['M', 'F'] });
});

test('messaggioErrore renders Italian text per violation type', () => {
  expect(
    messaggioErrore({
      ruleId: 'FK', type: 'foreignKey', table: 'ALUNNI', rowIndex: 3, column: 'CLASSE', value: '99X',
      details: { targetTable: 'CLASSI', targetColumn: 'ID' }
    })
  ).toBe('FK violata: CLASSE "99X" non esiste in CLASSI.ID');

  expect(
    messaggioErrore({ ruleId: 'J', type: 'json', table: 'CONF_DOC', rowIndex: 0, column: 'MODELLI', value: '{', details: {} })
  ).toBe('JSON non valido nel campo MODELLI');

  expect(
    messaggioErrore({ ruleId: 'R', type: 'required', table: 'DOCENTI', rowIndex: 0, column: 'NOME', value: '', details: {} })
  ).toBe('Campo obbligatorio vuoto: NOME');

  expect(
    messaggioErrore({ ruleId: 'E', type: 'enum', table: 'DOCENTI', rowIndex: 0, column: 'GENERE', value: 'X', details: { values: ['M', 'F'] } })
  ).toBe('Valore non ammesso per GENERE: "X" (ammessi: M, F)');

  expect(
    messaggioErrore({ ruleId: 'ITP_CLASSI', type: 'rowPredicate', table: 'CLASSI', rowIndex: 0, column: 'INF.itp', value: 'x@y.it', details: {} })
  ).toBe('Colonna ITP INF.itp: il docente "x@y.it" non ha DOCENTI.ITP = true');
});
