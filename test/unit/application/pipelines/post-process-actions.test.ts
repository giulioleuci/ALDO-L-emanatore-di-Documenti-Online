import {
  executePostProcess,
  type PostProcessDb
} from '../../../../src/application/pipelines/postProcessActions';
import { FakeDatabase } from '../../../../test/fakes/FakeDatabase';
import { fixtureTables } from '../../../../test/fixtures/tables';
import { FakeTemplateEngine } from '../../../../test/fakes/FakeTemplateEngine';

const logger = new LoggerService();
const NOW = new Date('2026-07-05T10:00:00.000Z');

function cdu(): Record<string, unknown> {
  return {
    focus: {
      alunno: { anagrafica: { email: 'a1@school.it' } },
      carenza: { studente: 'a1@school.it', progressivo: 1, data: '2026-02-15' }
    }
  };
}

test('INSERISCI_TIMESTAMP stamps matching rows via template criteri (11 §10)', () => {
  const db = new FakeDatabase(fixtureTables());
  const actions = JSON.stringify([
    {
      tipo: 'INSERISCI_TIMESTAMP',
      tab: 'CARENZE',
      col: 'NOTIFICATO',
      criteri: { STUDENTE: '{{focus.alunno.anagrafica.email}}', DATA: '{{focus.carenza.data}}' }
    }
  ]);
  const n = executePostProcess(actions, cdu(), db, new FakeTemplateEngine(), NOW, logger);
  expect(n).toBe(1);
  const rows = db.tables['CARENZE']!.getAllRows();
  const hit = rows.find((r) => r['STUDENTE'] === 'a1@school.it' && r['DATA'] === '2026-02-15')!;
  expect(hit['NOTIFICATO']).toBe('2026-07-05T10:00:00.000Z');
  // The other rows are untouched.
  expect(rows.find((r) => r['STUDENTE'] === 'a2@school.it')!['NOTIFICATO']).toBe('');
});

test('INSERISCI_TIMESTAMP does not overwrite an already-stamped row (first send wins)', () => {
  const tables = fixtureTables();
  tables['CARENZE'] = tables['CARENZE']!.map((r) =>
    r['STUDENTE'] === 'a1@school.it' && r['DATA'] === '2026-02-15'
      ? { ...r, NOTIFICATO: '2026-01-01T00:00:00.000Z' }
      : r
  );
  const db = new FakeDatabase(tables);
  const actions = JSON.stringify([
    {
      tipo: 'INSERISCI_TIMESTAMP',
      tab: 'CARENZE',
      col: 'NOTIFICATO',
      criteri: { STUDENTE: '{{focus.alunno.anagrafica.email}}', DATA: '{{focus.carenza.data}}' }
    }
  ]);
  const n = executePostProcess(actions, cdu(), db, new FakeTemplateEngine(), NOW, logger);
  expect(n).toBe(0);
  const hit = db.tables['CARENZE']!
    .getAllRows()
    .find((r) => r['STUDENTE'] === 'a1@school.it' && r['DATA'] === '2026-02-15')!;
  expect(hit['NOTIFICATO']).toBe('2026-01-01T00:00:00.000Z');
});

test('AGGIORNA_CAMPO writes a resolved value', () => {
  const db = new FakeDatabase(fixtureTables());
  const actions = JSON.stringify([
    {
      tipo: 'AGGIORNA_CAMPO',
      tab: 'ALUNNI',
      col: 'NOTE',
      valore: 'Notificato il {{focus.carenza.data}}',
      criteri: { EMAIL: '{{focus.alunno.anagrafica.email}}' }
    }
  ]);
  const n = executePostProcess(actions, cdu(), db, new FakeTemplateEngine(), NOW, logger);
  expect(n).toBe(1);
  expect(db.tables['ALUNNI']!.getByPK('a1@school.it')!['NOTE']).toBe('Notificato il 2026-02-15');
});

test('AGGIORNA_STATO_DOC updates LOG_DOCS.STATO', () => {
  const tables = fixtureTables();
  tables['LOG_DOCS'] = [{ ID: 'file_1', ID_GEN: 'CD1', STATO: 'GENERATO', CLASSI: '5A' }];
  const db = new FakeDatabase(tables);
  const actions = JSON.stringify([
    { tipo: 'AGGIORNA_STATO_DOC', stato: 'NOTIFICATO', criteri: { ID: 'file_1' } }
  ]);
  const n = executePostProcess(actions, cdu(), db, new FakeTemplateEngine(), NOW, logger);
  expect(n).toBe(1);
  expect(db.tables['LOG_DOCS']!.getByPK('file_1')!['STATO']).toBe('NOTIFICATO');
});

test('no matching rows ⇒ 0 updates and no phantom insert', () => {
  const db = new FakeDatabase(fixtureTables());
  const before = db.tables['CARENZE']!.getAllRows().length;
  const actions = JSON.stringify([
    {
      tipo: 'INSERISCI_TIMESTAMP',
      tab: 'CARENZE',
      col: 'NOTIFICATO',
      criteri: { STUDENTE: 'nessuno@x.it' }
    }
  ]);
  expect(executePostProcess(actions, cdu(), db, new FakeTemplateEngine(), NOW, logger)).toBe(0);
  expect(db.tables['CARENZE']!.getAllRows()).toHaveLength(before);
});

test('single-column criteri build an index on first use and reuse it for later actions (ref A3)', () => {
  const tables = fixtureTables();
  tables['LOG_DOCS'] = [
    { ID: 'file_1', ID_GEN: 'CD1', STATO: 'GENERATO', CLASSI: '5A' },
    { ID: 'file_2', ID_GEN: 'CD1', STATO: 'GENERATO', CLASSI: '5A' }
  ];
  const db = new FakeDatabase(tables);
  const logDocs = db.tables['LOG_DOCS']!;
  const createIndexSpy = jest.spyOn(logDocs, 'createIndex');
  const indexedLookupSpy = jest.spyOn(logDocs, 'indexedLookup');
  const getAllRowsSpy = jest.spyOn(logDocs, 'getAllRows');

  const actions = JSON.stringify([
    { tipo: 'AGGIORNA_STATO_DOC', stato: 'NOTIFICATO', criteri: { ID: 'file_1' } },
    { tipo: 'AGGIORNA_STATO_DOC', stato: 'NOTIFICATO', criteri: { ID: 'file_2' } }
  ]);
  const n = executePostProcess(actions, cdu(), db, new FakeTemplateEngine(), NOW, logger);

  expect(n).toBe(2);
  expect(db.tables['LOG_DOCS']!.getByPK('file_1')!['STATO']).toBe('NOTIFICATO');
  expect(db.tables['LOG_DOCS']!.getByPK('file_2')!['STATO']).toBe('NOTIFICATO');
  // Index built once on first action, reused (not rebuilt) on the second.
  expect(createIndexSpy).toHaveBeenCalledTimes(1);
  expect(indexedLookupSpy).toHaveBeenCalledWith('ID', 'file_1');
  expect(indexedLookupSpy).toHaveBeenCalledWith('ID', 'file_2');
  expect(getAllRowsSpy).not.toHaveBeenCalled();
});

test('multi-column criteri still fall back to a full scan', () => {
  const db = new FakeDatabase(fixtureTables());
  const carenze = db.tables['CARENZE']!;
  const getAllRowsSpy = jest.spyOn(carenze, 'getAllRows');
  const actions = JSON.stringify([
    {
      tipo: 'INSERISCI_TIMESTAMP',
      tab: 'CARENZE',
      col: 'NOTIFICATO',
      criteri: { STUDENTE: '{{focus.alunno.anagrafica.email}}', DATA: '{{focus.carenza.data}}' }
    }
  ]);
  executePostProcess(actions, cdu(), db, new FakeTemplateEngine(), NOW, logger);
  expect(getAllRowsSpy).toHaveBeenCalled();
});

test('unknown action type is skipped with a warning, others still run', () => {
  const db = new FakeDatabase(fixtureTables());
  const actions = JSON.stringify([
    { tipo: 'BOOM', tab: 'CARENZE', criteri: {} },
    {
      tipo: 'INSERISCI_TIMESTAMP',
      tab: 'CARENZE',
      col: 'NOTIFICATO',
      criteri: { STUDENTE: 'a2@school.it' }
    }
  ]);
  expect(executePostProcess(actions, cdu(), db, new FakeTemplateEngine(), NOW, logger)).toBe(1);
});

// --- CSV containment matching (multi-class POST_PROCESSO criteria, e.g. PER_COORDINATORE piani) ---

describe('postProcessActions — CSV containment matching', () => {
  test('single-valued criterion still matches by strict equality (unchanged behavior)', () => {
    const tables = fixtureTables();
    tables['LOG_DOCS'] = [
      { ID: '1', TIPO: 'PIANO_PERS', CLASSI: '1A', NOTIFICATO: '' },
      { ID: '2', TIPO: 'PIANO_PERS', CLASSI: '2B', NOTIFICATO: '' }
    ];
    const db = new FakeDatabase(tables);
    const actions = JSON.stringify([
      {
        tipo: 'INSERISCI_TIMESTAMP',
        tab: 'LOG_DOCS',
        col: 'NOTIFICATO',
        criteri: { TIPO: 'PIANO_PERS', CLASSI: '{{classe}}' }
      }
    ]);
    const n = executePostProcess(actions, { classe: '1A' }, db, new FakeTemplateEngine(), NOW, logger);
    expect(n).toBe(1);
    expect(db.tables['LOG_DOCS']!.getByPK('1')!['NOTIFICATO']).not.toBe('');
    expect(db.tables['LOG_DOCS']!.getByPK('2')!['NOTIFICATO']).toBe('');
  });

  test('multi-valued criterion (join-rendered classiCompetenza) matches every class it covers, not just the first', () => {
    const tables = fixtureTables();
    tables['LOG_DOCS'] = [
      { ID: '1', TIPO: 'PIANO_PERS', CLASSI: '1A', NOTIFICATO: '' },
      { ID: '2', TIPO: 'PIANO_PERS', CLASSI: '2B', NOTIFICATO: '' },
      { ID: '3', TIPO: 'PIANO_PERS', CLASSI: '3C', NOTIFICATO: '' } // not covered — must stay untouched
    ];
    const db = new FakeDatabase(tables);
    const actions = JSON.stringify([
      {
        tipo: 'INSERISCI_TIMESTAMP',
        tab: 'LOG_DOCS',
        col: 'NOTIFICATO',
        criteri: { TIPO: 'PIANO_PERS', CLASSI: '{{destinatario.contesto.classiCompetenza | join}}' }
      }
    ]);
    const n = executePostProcess(
      actions,
      { destinatario: { contesto: { classiCompetenza: ['1A', '2B'] } } },
      db,
      new FakeTemplateEngine(), // real WorkspaceTemplateEngine string/filter processing (offline-safe)
      NOW,
      logger
    );
    expect(n).toBe(2);
    expect(db.tables['LOG_DOCS']!.getByPK('1')!['NOTIFICATO']).not.toBe('');
    expect(db.tables['LOG_DOCS']!.getByPK('2')!['NOTIFICATO']).not.toBe('');
    expect(db.tables['LOG_DOCS']!.getByPK('3')!['NOTIFICATO']).toBe('');
  });

  test('VERBALE actions verbalize plans for both articulated partners', () => {
    const tables = fixtureTables();
    tables['LOG_DOCS'] = [
      { ID: '1', TIPO: 'PIANO_PERS', CLASSI: '3C', STATO: 'GENERATO' },
      { ID: '2', TIPO: 'PIANO_PERS', CLASSI: '3C-LC', STATO: 'GENERATO' },
      { ID: '3', TIPO: 'PIANO_PERS', CLASSI: '4A', STATO: 'GENERATO' }
    ];
    const db = new FakeDatabase(tables);
    const actions = JSON.stringify([
      {
        tipo: 'AGGIORNA_STATO_DOC',
        stato: 'VERBALIZZATO',
        criteri: { TIPO: 'PIANO_PERS', CLASSI: '{{focus.classe.anagrafica.nome}}' }
      },
      {
        tipo: 'AGGIORNA_STATO_DOC',
        stato: 'VERBALIZZATO',
        criteri: { TIPO: 'PIANO_PERS', CLASSI: '{{focus.classe.articolazione.partners | join}}' }
      }
    ]);
    const parentCdu = {
      focus: {
        classe: {
          anagrafica: { nome: '3C' },
          articolazione: { partners: ['3C-LC'] }
        }
      }
    };

    expect(executePostProcess(actions, parentCdu, db, new FakeTemplateEngine(), NOW, logger)).toBe(2);
    const rowsFor = (...classi: string[]) =>
      db.tables['LOG_DOCS']!.getAllRows().filter((row) => classi.includes(String(row['CLASSI'])));
    expect(rowsFor('3C', '3C-LC').every((row) => row['STATO'] === 'VERBALIZZATO')).toBe(true);
    expect(db.tables['LOG_DOCS']!.getByPK('3')!['STATO']).toBe('GENERATO');
  });

  test('VERBALE partner action updates no plans for a normal class with no partners', () => {
    const tables = fixtureTables();
    tables['LOG_DOCS'] = [
      { ID: '1', TIPO: 'PIANO_PERS', CLASSI: '3C', STATO: 'GENERATO' },
      { ID: '2', TIPO: 'PIANO_PERS', CLASSI: '4A', STATO: 'GENERATO' }
    ];
    const db = new FakeDatabase(tables);
    const actions = JSON.stringify([
      {
        tipo: 'AGGIORNA_STATO_DOC',
        stato: 'VERBALIZZATO',
        criteri: { TIPO: 'PIANO_PERS', CLASSI: '{{focus.classe.articolazione.partners | join}}' }
      }
    ]);
    const normalClassCdu = {
      focus: {
        classe: {
          anagrafica: { nome: '3C' },
          articolazione: { partners: [] }
        }
      }
    };

    expect(executePostProcess(actions, normalClassCdu, db, new FakeTemplateEngine(), NOW, logger)).toBe(0);
    expect(db.tables['LOG_DOCS']!.getAllRows().every((row) => row['STATO'] === 'GENERATO')).toBe(true);
  });

  test('a multi-valued criterion bypasses the single-column indexed fast path (it cannot answer a containment query)', () => {
    const tables = fixtureTables();
    tables['LOG_DOCS'] = [{ ID: '1', TIPO: 'PIANO_PERS', CLASSI: '1A', NOTIFICATO: '' }];
    const db = new FakeDatabase(tables);
    const logDocs = db.tables['LOG_DOCS']!;
    const getAllRowsSpy = jest.spyOn(logDocs, 'getAllRows');
    const actions = JSON.stringify([
      {
        tipo: 'INSERISCI_TIMESTAMP',
        tab: 'LOG_DOCS',
        col: 'NOTIFICATO',
        criteri: { CLASSI: '{{destinatario.contesto.classiCompetenza | join}}' }
      }
    ]);
    executePostProcess(
      actions,
      { destinatario: { contesto: { classiCompetenza: ['1A', '2B'] } } },
      db,
      new FakeTemplateEngine(),
      NOW,
      logger
    );
    expect(getAllRowsSpy).toHaveBeenCalled();
  });
});

// --- A20: action-type switch and updateMatching column-scan fallback ---

describe('postProcessActions — updateMatching guard and findMatchingRows fallback (A20)', () => {
  test('updateMatching returns 0 without scanning when the target table does not exist in db.tables', () => {
    // A plain-object PostProcessDb (unlike FakeDatabase's Proxy-backed `tables`,
    // which auto-vivifies any table name) so `db.tables[tab]` really is
    // `undefined` and the `table === undefined` guard is exercised for real.
    const db: PostProcessDb = { tables: {} };
    const actions = JSON.stringify([
      {
        tipo: 'INSERISCI_TIMESTAMP',
        tab: 'TABELLA_INESISTENTE',
        col: 'NOTIFICATO',
        criteri: { ID: 'x' }
      }
    ]);
    const n = executePostProcess(actions, cdu(), db, new FakeTemplateEngine(), NOW, logger);
    expect(n).toBe(0);
  });

  test('findMatchingRows falls back to a full scan when no indexed column produces a hit', () => {
    const rows: EntityData[] = [{ ID: 'r1', STAMP: '' }];
    const getAllRowsSpy = jest.fn(() => rows);
    const updateRowWhereSpy = jest.fn((match: EntityData, row: EntityData) => {
      const i = rows.findIndex((r) => r['ID'] === match['ID']);
      if (i !== -1) rows[i] = row;
    });
    const createIndexSpy = jest.fn();
    // Even after createIndex is called, the lookup keeps reporting no hit —
    // the single-column indexed path is exhausted and findMatchingRows must
    // still fall back to a full getAllRows() scan rather than returning [].
    const indexedLookupSpy = jest.fn(() => null);
    const table: RepositoryTable = {
      getByPK: (id) => rows.find((r) => r['ID'] === id) ?? null,
      getAllRows: getAllRowsSpy,
      insertRow: (row) => {
        rows.push(row);
        return row;
      },
      updateRowById: () => {
        /* unused */
      },
      updateRowWhere: updateRowWhereSpy,
      createIndex: createIndexSpy,
      indexedLookup: indexedLookupSpy
    };
    const db: PostProcessDb = { tables: { CUSTOM: table } };
    const actions = JSON.stringify([
      { tipo: 'INSERISCI_TIMESTAMP', tab: 'CUSTOM', col: 'STAMP', criteri: { ID: 'r1' } }
    ]);
    const n = executePostProcess(actions, cdu(), db, new FakeTemplateEngine(), NOW, logger);
    expect(n).toBe(1);
    expect(createIndexSpy).toHaveBeenCalledWith('ID');
    expect(getAllRowsSpy).toHaveBeenCalled();
    expect(updateRowWhereSpy).toHaveBeenCalledWith(
      { ID: 'r1', STAMP: '' },
      { ID: 'r1', STAMP: NOW.toISOString() }
    );
  });

  test('applies AGGIORNA_CAMPO, rendering action.valore as a template against the CDU', () => {
    const db = new FakeDatabase(fixtureTables());
    const templates = new FakeTemplateEngine();
    const processStringSpy = jest.spyOn(templates, 'processString');
    const actions = JSON.stringify([
      {
        tipo: 'AGGIORNA_CAMPO',
        tab: 'ALUNNI',
        col: 'NOTE',
        valore: 'Notificato il {{focus.carenza.data}}',
        criteri: { EMAIL: '{{focus.alunno.anagrafica.email}}' }
      }
    ]);
    const n = executePostProcess(actions, cdu(), db, templates, NOW, logger);
    expect(n).toBe(1);
    expect(processStringSpy).toHaveBeenCalledWith('Notificato il {{focus.carenza.data}}', cdu());
    expect(db.tables['ALUNNI']!.getByPK('a1@school.it')!['NOTE']).toBe('Notificato il 2026-02-15');
  });

  test("applies AGGIORNA_STATO_DOC, defaulting action.tab to TABLE.LOG_DOCS and action.stato to '' when unset", () => {
    const tables = fixtureTables();
    tables['LOG_DOCS'] = [{ ID: 'file_1', ID_GEN: 'CD1', STATO: 'GENERATO', CLASSI: '5A' }];
    const db = new FakeDatabase(tables);
    // No `tab` and no `stato` in the action ⇒ defaults to TABLE.LOG_DOCS and ''.
    const actions = JSON.stringify([{ tipo: 'AGGIORNA_STATO_DOC', criteri: { ID: 'file_1' } }]);
    const n = executePostProcess(actions, cdu(), db, new FakeTemplateEngine(), NOW, logger);
    expect(n).toBe(1);
    expect(db.tables['LOG_DOCS']!.getByPK('file_1')!['STATO']).toBe('');
  });
});
