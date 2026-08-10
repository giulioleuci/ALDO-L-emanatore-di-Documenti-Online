import { LogDocumentoRepository } from '../../../src/infrastructure/repositories/LogDocumentoRepository';
import { ClasseRepository } from '../../../src/infrastructure/repositories/ClasseRepository';
import { FakeDatabase } from '../../../test/fakes/FakeDatabase';
import { ClasseId } from '../../../src/domain/value-objects/ClasseId';
import { StatoDocumento } from '../../../src/domain/value-objects/enums';

/**
 * Exercises the real DomainRepositoryLib Repository.save() write path (no
 * hand-rolled persistence): register (append via the lib table seam) then
 * cambiaStato/registraNotifica (update via Repository.save → validateOrThrow →
 * toData dehydrate → table.updateRowById).
 */
function repo() {
  const db = new FakeDatabase({ LOG_DOCS: [] });
  return { db, r: new LogDocumentoRepository(db, new ClasseRepository(db)) };
}

test('cambiaStato persists through Repository.save() update path (06 §17)', () => {
  const { db, r } = repo();
  const log = r.registraDocumento('drive_1', 'CD1', 'Verbale', 'Verbali/5', 'http://d/1', {
    classe: ClasseId.of('5A')
  });
  expect(db.table('LOG_DOCS').find((x) => x.ID === 'drive_1')?.STATO).toBe('GENERATO');

  r.cambiaStato(log, StatoDocumento.VERBALIZZATO);

  const row = db.table('LOG_DOCS').find((x) => x.ID === 'drive_1');
  expect(row?.STATO).toBe('VERBALIZZATO'); // updated in place, not appended
  expect(db.table('LOG_DOCS').findAll()).toHaveLength(1);
  expect(log.getStato()).toBe(StatoDocumento.VERBALIZZATO);
  expect(log.isDirty('STATO')).toBe(false); // save() cleared dirty fields
});

test('registraNotifica stamps NOTIFICATO and persists (06 §17)', () => {
  const { db, r } = repo();
  const log = r.registraDocumento('drive_2', 'CD1', 'Verbale', 'p', 'l');
  r.registraNotifica(log);
  expect(db.table('LOG_DOCS').find((x) => x.ID === 'drive_2')?.NOTIFICATO).not.toBe('');
  expect(log.isNotificato()).toBe(true);
  expect(r.findNonNotificati()).toEqual([]); // reloaded from the persisted row
});
