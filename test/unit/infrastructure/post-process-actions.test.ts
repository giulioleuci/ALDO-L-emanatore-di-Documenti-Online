import { executePostProcess } from '../../../src/infrastructure/steps/postProcessActions';
import { FakeDatabase } from '../../../test/fakes/FakeDatabase';
import { fixtureTables } from '../../../test/fixtures/tables';
import { FakeTemplateEngine } from '../../../test/fakes/FakeTemplateEngine';

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
    { tipo: 'INSERISCI_TIMESTAMP', tab: 'CARENZE', col: 'NOTIFICATO', criteri: { STUDENTE: 'nessuno@x.it' } }
  ]);
  expect(executePostProcess(actions, cdu(), db, new FakeTemplateEngine(), NOW, logger)).toBe(0);
  expect(db.tables['CARENZE']!.getAllRows()).toHaveLength(before);
});

test('unknown action type is skipped with a warning, others still run', () => {
  const db = new FakeDatabase(fixtureTables());
  const actions = JSON.stringify([
    { tipo: 'BOOM', tab: 'CARENZE', criteri: {} },
    { tipo: 'INSERISCI_TIMESTAMP', tab: 'CARENZE', col: 'NOTIFICATO', criteri: { STUDENTE: 'a2@school.it' } }
  ]);
  expect(executePostProcess(actions, cdu(), db, new FakeTemplateEngine(), NOW, logger)).toBe(1);
});
