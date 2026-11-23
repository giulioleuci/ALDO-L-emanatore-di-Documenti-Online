import { LogDocumentoRepository } from '../../../src/infrastructure/repositories/LogDocumentoRepository';
import { LogEmailRepository } from '../../../src/infrastructure/repositories/LogEmailRepository';
import { ClasseRepository } from '../../../src/infrastructure/repositories/ClasseRepository';
import { FakeDatabase } from '../../../test/fakes/FakeDatabase';
import { ClasseId } from '../../../src/domain/value-objects/ClasseId';
import { Email } from '../../../src/domain/value-objects/Email';
import { StatoEmail } from '../../../src/domain/value-objects/enums';

test('LOG_DOCS exposes a parent-owned document to its direct partner only', () => {
  const db = new FakeDatabase({
    CLASSI: [
      {
        ID: '3C',
        ANNO: 3,
        INDIRIZZO: 'SCI',
        ARTICOLAZIONE: JSON.stringify({ partners: ['3C-S', '3C-C'] })
      },
      {
        ID: '3C-S',
        ANNO: 3,
        INDIRIZZO: 'SCI',
        ARTICOLAZIONE: JSON.stringify({ parent: '3C', partner: '3C-C' })
      },
      {
        ID: '3C-C',
        ANNO: 3,
        INDIRIZZO: 'CLA',
        ARTICOLAZIONE: JSON.stringify({ parent: '3C', partner: '3C-S' })
      }
    ],
    LOG_DOCS: [
      { ID: 'parent-doc', ID_GEN: 'VERBALE', CLASSI: '3C', STATO: 'GENERATO', UTENTI: '' },
      { ID: 'sibling-doc', ID_GEN: 'PROGRAMMA', CLASSI: '3C-S', STATO: 'GENERATO', UTENTI: '' }
    ]
  });
  const classi = new ClasseRepository(db);
  const docs = new LogDocumentoRepository(db, new LazyRef(() => classi));
  const parent = classi.findById(ClasseId.of('3C'))!;
  const scientifico = classi.findById(ClasseId.of('3C-S'))!;
  const classico = classi.findById(ClasseId.of('3C-C'))!;

  expect(docs.findByClasse(scientifico).map((doc) => doc.id)).toEqual([
    'parent-doc',
    'sibling-doc'
  ]);
  expect(docs.findByClasse(classico).map((doc) => doc.id)).toEqual(['parent-doc']);
  expect(docs.findByClasse(parent).map((doc) => doc.id)).toEqual(['parent-doc']);
});

test('LOG_MAIL: composite id, findByPattern / findFailed + registraInvio (06 §19)', () => {
  const db = new FakeDatabase({
    LOG_MAIL: [
      {
        PATTERN: 'CDC_OTTOBRE',
        DESTINATARI: 'rossi@school.it,bianchi@school.it',
        DATA: '2025-10-05T10:00:00.000Z',
        STATO: 'SUCCESS'
      },
      {
        PATTERN: 'CARENZE_FAM',
        DESTINATARI: 'g1@x.it',
        DATA: '2026-02-10T09:00:00.000Z',
        STATO: 'ERROR',
        ERRORE: 'quota'
      }
    ]
  });
  const r = new LogEmailRepository(db);
  expect(r.findByPattern('CDC_OTTOBRE')[0]!.getDestinatari()).toEqual([
    'rossi@school.it',
    'bianchi@school.it'
  ]);
  expect(r.findByPattern('CDC_OTTOBRE')[0]!.id).toBe(
    'CDC_OTTOBRE::rossi@school.it,bianchi@school.it::2025-10-05T10:00:00.000Z'
  );
  expect(r.findFailed().map((l) => l.pattern)).toEqual(['CARENZE_FAM']);
  const sent = r.registraInvio(
    'CDC_OTTOBRE',
    [Email.of('x@y.it')],
    StatoEmail.SUCCESS,
    '<p>Ciao <b>Mario</b>!</p>',
    { docs: ['a'] }
  );
  expect(sent.getAllegati()).toEqual({ docs: ['a'] });
  expect(sent.testo).toBe('Ciao Mario!');
  expect(db.table('LOG_MAIL').findAll()).toHaveLength(3);
});
