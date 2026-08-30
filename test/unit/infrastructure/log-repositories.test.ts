import { LogDocumentoRepository } from '../../../src/infrastructure/repositories/LogDocumentoRepository';
import { LogCartellaRepository } from '../../../src/infrastructure/repositories/LogCartellaRepository';
import { LogEmailRepository } from '../../../src/infrastructure/repositories/LogEmailRepository';
import { ClasseRepository } from '../../../src/infrastructure/repositories/ClasseRepository';
import { FakeDatabase } from '../../../test/fakes/FakeDatabase';
import { Classe } from '../../../src/domain/entities/Classe';
import { ClasseId } from '../../../src/domain/value-objects/ClasseId';
import { Email } from '../../../src/domain/value-objects/Email';
import { StatoDocumento, StatoEmail } from '../../../src/domain/value-objects/enums';

const classe5A = Classe.fromData({ ID: '5A', ANNO: 5, INDIRIZZO: 'SCI' });

function docsDb() {
  return new FakeDatabase({
    CLASSI: [{ ID: '5A', ANNO: 5, INDIRIZZO: 'SCI' }],
    LOG_DOCS: [
      {
        ID: 'f1',
        ID_GEN: 'CD1',
        NOME: 'V 5A',
        STATO: 'GENERATO',
        NOTIFICATO: '',
        CLASSI: '5A',
        UTENTI: '',
        LINK: 'http://d/f1'
      },
      {
        ID: 'f2',
        ID_GEN: 'CD1',
        NOME: 'V 3B',
        STATO: 'NOTIFICATO',
        NOTIFICATO: '2026-02-01T00:00:00.000Z',
        CLASSI: '3B,5A',
        UTENTI: 'a1@school.it'
      }
    ]
  });
}

test('LOG_DOCS: CONTAINS queries + stato + non-notificati (06 §17)', () => {
  const db = docsDb();
  const r = new LogDocumentoRepository(db, new LazyRef(() => new ClasseRepository(db)));
  expect(
    r
      .findByClasse(classe5A)
      .map((l) => l.id)
      .sort()
  ).toEqual(['f1', 'f2']); // both contain 5A
  expect(r.findByUtente(Email.of('a1@school.it')).map((l) => l.id)).toEqual(['f2']);
  expect(r.findByStato(StatoDocumento.GENERATO).map((l) => l.id)).toEqual(['f1']);
  expect(r.findNonNotificati().map((l) => l.id)).toEqual(['f1']);
});

test('LogDocumento.cambiaStato / notifica mark dirty; getLink', () => {
  const db = docsDb();
  const r = new LogDocumentoRepository(db, new LazyRef(() => new ClasseRepository(db)));
  const f1 = r.findByStato(StatoDocumento.GENERATO)[0]!;
  expect(f1.getLink()).toBe('http://d/f1');
  f1.cambiaStato(StatoDocumento.VERBALIZZATO);
  expect(f1.getStato()).toBe(StatoDocumento.VERBALIZZATO);
  expect(f1.isDirty('STATO')).toBe(true);
  f1.notifica();
  expect(f1.isNotificato()).toBe(true);
});

test('registraDocumento appends a GENERATO row (06 §17)', () => {
  const db = new FakeDatabase({ LOG_DOCS: [] });
  const r = new LogDocumentoRepository(db, new LazyRef(() => new ClasseRepository(db)));
  const log = r.registraDocumento('drive_99', 'CD1', 'Nuovo', 'Verbali/5', 'http://d/99', {
    classe: ClasseId.of('5A')
  });
  expect(log.getStato()).toBe(StatoDocumento.GENERATO);
  const row = db.table('LOG_DOCS').find((x) => x.ID === 'drive_99');
  expect(row?.CLASSI).toBe('5A');
  expect(db.saved).toBe(1);
});

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

test('LOG_FOLD: findByClasse / findByTipo + registraCartella (06 §18)', () => {
  const db = new FakeDatabase({
    LOG_FOLD: [{ ID: 'd1', ID_GEN: 'CD1', NOME: 'Verbali', CLASSI: '5A' }]
  });
  const r = new LogCartellaRepository(db);
  expect(r.findByClasse(classe5A).map((l) => l.id)).toEqual(['d1']);
  expect(r.findByTipo('CD1').map((l) => l.id)).toEqual(['d1']);
  r.registraCartella('d2', 'CD1', 'Nuova', 'X', 'http://d/d2', { classe: ClasseId.of('3B') });
  expect(db.table('LOG_FOLD').findAll()).toHaveLength(2);
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
