import {
  regoleValidazione,
  messaggioErrore,
  VALIDATION_TABLES
} from '../../../src/config/validationRules';
import { TABLE, COL_CLASSI, COL_DOCENTI, COL_MATERIE } from '../../../src/config/schema';

/** Minimal DatasetRuleContext: the 3 rowPredicate checks in this file only ever read ctx.datasets. */
function makeCtx(datasets: Record<string, Array<Record<string, unknown>>>): DatasetRuleContext {
  return { datasets, index: () => new Set<string>() };
}

/** FK_CLASSI_CATTEDRE reads ctx.index(table, column); this mirrors DatasetValidator's real semantics. */
function makeIndexedCtx(
  datasets: Record<string, Array<Record<string, unknown>>>
): DatasetRuleContext {
  return {
    datasets,
    index: (table, column) =>
      new Set(
        (datasets[table] ?? [])
          .map((row) => (typeof row[column] === 'string' ? row[column] : '').trim())
          .filter((value) => value !== '')
      )
  };
}

function findRowPredicate(
  id: string
): (
  row: Record<string, unknown>,
  ctx: DatasetRuleContext
) => null | { column: string; value: unknown; details?: Record<string, unknown> } {
  const rule = regoleValidazione().find((r) => r.id === id);
  if (!rule || rule.type !== 'rowPredicate') {
    throw new Error(`rule ${id} not found or not a rowPredicate`);
  }
  return rule.check;
}

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
  expect(pairs).toContain('LOG_FOLD.ID_GEN->CONF_DOC.ID');
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
  expect(genere).toMatchObject({
    type: 'enum',
    table: TABLE.DOCENTI,
    column: 'GENERE',
    values: ['M', 'F']
  });
});

test('messaggioErrore renders Italian text per violation type', () => {
  expect(
    messaggioErrore({
      ruleId: 'FK',
      type: 'foreignKey',
      table: 'ALUNNI',
      rowIndex: 3,
      column: 'CLASSE',
      value: '99X',
      details: { targetTable: 'CLASSI', targetColumn: 'ID' }
    })
  ).toBe('FK violata: CLASSE "99X" non esiste in CLASSI.ID');

  expect(
    messaggioErrore({
      ruleId: 'J',
      type: 'json',
      table: 'CONF_DOC',
      rowIndex: 0,
      column: 'MODELLI',
      value: '{',
      details: {}
    })
  ).toBe('JSON non valido nel campo MODELLI');

  expect(
    messaggioErrore({
      ruleId: 'R',
      type: 'required',
      table: 'DOCENTI',
      rowIndex: 0,
      column: 'NOME',
      value: '',
      details: {}
    })
  ).toBe('Campo obbligatorio vuoto: NOME');

  expect(
    messaggioErrore({
      ruleId: 'E',
      type: 'enum',
      table: 'DOCENTI',
      rowIndex: 0,
      column: 'GENERE',
      value: 'X',
      details: { values: ['M', 'F'] }
    })
  ).toBe('Valore non ammesso per GENERE: "X" (ammessi: M, F)');

  expect(
    messaggioErrore({
      ruleId: 'ITP_CLASSI',
      type: 'rowPredicate',
      table: 'CLASSI',
      rowIndex: 0,
      column: 'INF.itp',
      value: 'x@y.it',
      details: {}
    })
  ).toBe('Colonna ITP INF.itp: il docente "x@y.it" non ha DOCENTI.ITP = true');

  expect(
    messaggioErrore({
      ruleId: 'FK_CLASSI_CATTEDRE',
      type: 'rowPredicate',
      table: 'CLASSI',
      rowIndex: 0,
      column: 'MAT',
      value: 'ghost@x.it',
      details: {}
    })
  ).toBe('FK violata: colonna dinamica MAT "ghost@x.it" non esiste in DOCENTI.EMAIL');
});

test('DYN_CLASSI.normalize strips only the .itp suffix, leaving dotted MATERIE ids intact', () => {
  const rule = regoleValidazione().find((r) => r.id === 'DYN_CLASSI');
  if (!rule || rule.type !== 'columnName' || !rule.normalize) {
    throw new Error('DYN_CLASSI rule missing or has no normalize()');
  }
  const normalize = rule.normalize;
  // Real fixture MATERIE.ID primary keys (SharedTestDatabaseBuilder) - must survive unchanged.
  expect(normalize('LAB.GRUPPO_A')).toBe('LAB.GRUPPO_A');
  expect(normalize('LAB.SEMINARIO_POMERIDIANO')).toBe('LAB.SEMINARIO_POMERIDIANO');
  expect(normalize('INTERPRET.CHITARRA')).toBe('INTERPRET.CHITARRA');
  expect(normalize('INTERPRET.FLAUTO')).toBe('INTERPRET.FLAUTO');
  // The one real suffix case: an ITP-assignment column on a composite id.
  expect(normalize('INTERPRET.CHITARRA.itp')).toBe('INTERPRET.CHITARRA');
  expect(normalize('INF.itp')).toBe('INF');
});

test('ITP_CLASSI.check: passes when the assigned docente has DOCENTI.ITP = true, fails otherwise', () => {
  const check = findRowPredicate('ITP_CLASSI');
  const docenti = [
    { [COL_DOCENTI.EMAIL]: 'itp@scuola.it', [COL_DOCENTI.ITP]: true },
    { [COL_DOCENTI.EMAIL]: 'nonitp@scuola.it', [COL_DOCENTI.ITP]: false }
  ];
  const ctx = makeCtx({ [TABLE.DOCENTI]: docenti });

  expect(check({ 'INF.itp': 'itp@scuola.it' }, ctx)).toBeNull();
  expect(check({ 'INF.itp': 'nonitp@scuola.it' }, ctx)).toEqual({
    column: 'INF.itp',
    value: 'nonitp@scuola.it'
  });
});

test('FK_CLASSI_CATTEDRE.check: passes when the dynamic column email exists in DOCENTI, fails otherwise', () => {
  const check = findRowPredicate('FK_CLASSI_CATTEDRE');
  const docenti = [{ [COL_DOCENTI.EMAIL]: 'mat@scuola.it' }];
  const ctx = makeIndexedCtx({ [TABLE.DOCENTI]: docenti });

  expect(check({ [COL_CLASSI.ID]: '1A', MAT: 'mat@scuola.it' }, ctx)).toBeNull();
  expect(check({ [COL_CLASSI.ID]: '1A', MAT: 'ghost@x.it' }, ctx)).toEqual({
    column: 'MAT',
    value: 'ghost@x.it'
  });
});

test('FK_CLASSI_CATTEDRE.check: static columns (COORD/IRC/ALT/etc.) are skipped, only dynamic subject columns are checked', () => {
  const check = findRowPredicate('FK_CLASSI_CATTEDRE');
  const ctx = makeIndexedCtx({ [TABLE.DOCENTI]: [] });

  // COORD/IRC/ALT already have their own fk() rules; FK_CLASSI_CATTEDRE must not
  // also flag them (would double-report the same email).
  expect(check({ [COL_CLASSI.ID]: '1A', [COL_CLASSI.COORD]: 'ghost@x.it' }, ctx)).toBeNull();
});

test('ITP_CLASSI.check: returns null (not a violation) when the .itp email is not in DOCENTI at all', () => {
  const check = findRowPredicate('ITP_CLASSI');
  const ctx = makeCtx({ [TABLE.DOCENTI]: [] });

  // The email is unknown to DOCENTI entirely: that is FK_CLASSI_CATTEDRE's
  // job to report, not ITP_CLASSI's — reporting it here would misleadingly
  // tell the operator to fix an ITP flag on a docente who doesn't exist.
  expect(check({ 'INF.itp': 'ghost@x.it' }, ctx)).toBeNull();
});

test('MATERIE_COMPOSITE_PRINCIPALE.check: composite MATERIE.ID rows require a non-empty PRINCIPALE', () => {
  const check = findRowPredicate('MATERIE_COMPOSITE_PRINCIPALE');
  const ctx = makeCtx({});

  expect(
    check({ [COL_MATERIE.ID]: 'INTERPRET.CHITARRA', [COL_MATERIE.PRINCIPALE]: 'INTERPRET' }, ctx)
  ).toBeNull();
  expect(
    check({ [COL_MATERIE.ID]: 'INTERPRET.CHITARRA', [COL_MATERIE.PRINCIPALE]: '' }, ctx)
  ).toEqual({
    column: COL_MATERIE.PRINCIPALE,
    value: 'INTERPRET.CHITARRA'
  });
});

test('MATERIE_NOME_MANCANTE.check: empty NOME is legal when PRINCIPALE+SPECIFICITA are both set (01 §MATERIE composite-specifica fallback)', () => {
  const check = findRowPredicate('MATERIE_NOME_MANCANTE');
  const ctx = makeCtx({});

  // Composite-specifica row: NOME empty, but PRINCIPALE+SPECIFICITA present
  // -> Materia.nome reconstructs "PRINCIPALE (SPECIFICITA)" at read time.
  expect(
    check(
      {
        [COL_MATERIE.ID]: 'INTERPRET.CHITARRA',
        [COL_MATERIE.NOME]: '',
        [COL_MATERIE.PRINCIPALE]: 'Interpretazione ed esecuzione',
        [COL_MATERIE.SPECIFICITA]: 'Chitarra'
      },
      ctx
    )
  ).toBeNull();

  // NOME set: always fine regardless of PRINCIPALE/SPECIFICITA.
  expect(check({ [COL_MATERIE.ID]: 'ITA', [COL_MATERIE.NOME]: 'Italiano' }, ctx)).toBeNull();

  // Empty NOME with no PRINCIPALE/SPECIFICITA fallback: genuine data error.
  expect(check({ [COL_MATERIE.ID]: 'ITA', [COL_MATERIE.NOME]: '' }, ctx)).toEqual({
    column: COL_MATERIE.NOME,
    value: 'ITA'
  });

  // Empty NOME with only one of PRINCIPALE/SPECIFICITA set: still a data error.
  expect(
    check(
      {
        [COL_MATERIE.ID]: 'INTERPRET.CHITARRA',
        [COL_MATERIE.NOME]: '',
        [COL_MATERIE.PRINCIPALE]: 'Interpretazione ed esecuzione'
      },
      ctx
    )
  ).toEqual({ column: COL_MATERIE.NOME, value: 'INTERPRET.CHITARRA' });
});

test('CURRICULUM_COVERAGE.check: flags a mandated subject missing its CLASSI column, using the MATERIE.<INDIRIZZO_ID> CSV-year-list', () => {
  const check = findRowPredicate('CURRICULUM_COVERAGE');
  const materie = [{ [COL_MATERIE.ID]: 'ITA', [COL_MATERIE.NOME]: 'Italiano', LS: '1,2,3,4,5' }];
  const ctx = makeCtx({ [TABLE.MATERIE]: materie });

  // Passing: CLASSI row for indirizzo LS, anno 1, already has the ITA column.
  expect(
    check({ [COL_CLASSI.INDIRIZZO]: 'LS', [COL_CLASSI.ANNO]: '1', ITA: 'docente@scuola.it' }, ctx)
  ).toBeNull();

  // Failing: same indirizzo/anno, but the ITA column is absent from CLASSI.
  expect(check({ [COL_CLASSI.INDIRIZZO]: 'LS', [COL_CLASSI.ANNO]: '1' }, ctx)).toEqual({
    column: 'ITA',
    value: 'ITA',
    details: { indirizzo: 'LS', anno: '1' }
  });
});
