import { ClasseRepository } from '../../../src/infrastructure/repositories/ClasseRepository';
import { Classe } from '../../../src/domain/entities/Classe';
import { Docente } from '../../../src/domain/entities/Docente';
import { FakeDatabase } from '../../../test/fakes/FakeDatabase';
import { fixtureTables, teachingSlotFixtureTables } from '../../../test/fixtures/tables';
import { ClasseId } from '../../../src/domain/value-objects/ClasseId';
import { MateriaId } from '../../../src/domain/value-objects/MateriaId';
import { IndirizzoId } from '../../../src/domain/value-objects/IndirizzoId';
import {
  EntityNotFoundError,
  MateriaNotFoundError,
  ValidationError
} from '../../../src/domain/errors/DomainError';

function repo(): ClasseRepository {
  return new ClasseRepository(new FakeDatabase(fixtureTables()));
}

test('findById maps CLASSI row to Classe entity', () => {
  const c = repo().findById(ClasseId.of('5A'));
  expect(c?.nome).toBe('5A');
  expect(c?.anno.value).toBe(5);
  expect(c?.indirizzo).toBe('SCIENTIFICO');
});

test('getTeachingSlots enumerates every populated subject slot and preserves arbitrary specificities', () => {
  const r = new ClasseRepository(new FakeDatabase(teachingSlotFixtureTables()));
  const classe = r.findById(ClasseId.of('5A'))!;

  const slots = r.getTeachingSlots(classe);
  expect(slots.find((slot) => slot.column === 'MAT')).toEqual({
    column: 'MAT',
    materia: MateriaId.of('MAT'),
    kind: 'MAIN',
    specifica: null,
    actorEmails: ['main@school.test']
  });
  expect(slots.find((slot) => slot.column === 'INF.itp')).toEqual({
    column: 'INF.itp',
    materia: MateriaId.of('INF'),
    kind: 'ITP',
    specifica: null,
    actorEmails: ['itp@school.test']
  });
  expect(slots.find((slot) => slot.column === 'LAB.GRUPPO_A')).toEqual({
    column: 'LAB.GRUPPO_A',
    materia: MateriaId.of('LAB'),
    kind: 'SPECIFICA',
    specifica: 'GRUPPO_A',
    actorEmails: ['specific-a@school.test']
  });
  expect(slots.find((slot) => slot.column === 'LAB.GRUPPO.A')).toEqual({
    column: 'LAB.GRUPPO.A',
    materia: MateriaId.of('LAB'),
    kind: 'SPECIFICA',
    specifica: 'GRUPPO.A',
    actorEmails: ['specific-b@school.test']
  });
  expect(slots.find((slot) => slot.column === 'INTERPRET.CHITARRA')).toEqual({
    column: 'INTERPRET.CHITARRA',
    materia: MateriaId.of('INTERPRET'),
    kind: 'SPECIFICA',
    specifica: 'CHITARRA',
    actorEmails: ['guitar@school.test']
  });
  expect(slots.find((slot) => slot.column === 'IRC')).toEqual({
    column: 'IRC',
    materia: MateriaId.of('IRC'),
    kind: 'MAIN',
    specifica: null,
    actorEmails: ['irc@school.test']
  });
  expect(slots.find((slot) => slot.column === 'ALT')).toEqual({
    column: 'ALT',
    materia: MateriaId.of('ALT'),
    kind: 'MAIN',
    specifica: null,
    actorEmails: ['alt@school.test']
  });
});

test('getTeachingSlots throws MateriaNotFoundError when a SPECIFICA slot has no matching MATERIE row', () => {
  const tables = teachingSlotFixtureTables();
  const classe5A = tables.CLASSI!.find((row) => row.ID === '5A')!;
  classe5A['LAB.UNREGISTERED'] = 'ghost@school.test';
  const r = new ClasseRepository(new FakeDatabase(tables));
  const classe = r.findById(ClasseId.of('5A'))!;

  expect(() => r.getTeachingSlots(classe)).toThrow(MateriaNotFoundError);
});

test('getConsiglioDiClasse derives cattedre from teacher columns (05/06)', () => {
  // IRC is now a MATERIE row (IS_RELIGIONE_ALT flag, ref 01_SCHEMA_DATABASE.md
  // Nota IRC/ALT) and 5A.IRC is populated in the fixture, so this raw
  // per-column enumeration (which doesn't filter on IS_RELIGIONE_ALT -- that
  // filtering lives one layer up, in CattedraResolver.resolveConsiglio) now
  // legitimately reports it alongside the ordinary subjects.
  const cdc = repo().getConsiglioDiClasse(ClasseId.of('5A'));
  const pairs = cdc.cattedre.map((k) => `${k.materia.value}:${k.docente.email.value}`).sort();
  expect(pairs).toEqual(['FISI:bianchi@school.it', 'IRC:bianchi@school.it', 'MATE:rossi@school.it']);
});

test('getAlunniAttivi applies AlunniAttiviSpec', () => {
  const alunni = repo().getAlunniAttivi(ClasseId.of('5A'));
  expect(alunni.map((a) => a.EMAIL)).toEqual(['a1@school.it']);
});

test('findById returns null for unknown class', () => {
  expect(repo().findById(ClasseId.of('9Z'))).toBeNull();
});

test('findById throws on a malformed row missing INDIRIZZO (fail loud, no "undefined" coercion)', () => {
  const db = new FakeDatabase({ CLASSI: [{ ID: '2B', ANNO: 2 }] });
  expect(() => new ClasseRepository(db).findById(ClasseId.of('2B'))).toThrow(ValidationError);
});

test('getConsiglioDiClasse throws when a teacher column references an unknown docente', () => {
  const db = new FakeDatabase({
    CLASSI: [{ ID: '1A', ANNO: 1, INDIRIZZO: 'X', MATE: 'ghost@school.it' }],
    MATERIE: [{ ID: 'MATE', SINTESI: 'Mate' }],
    DOCENTI: [],
    ALUNNI: []
  });
  expect(() => new ClasseRepository(db).getConsiglioDiClasse(ClasseId.of('1A'))).toThrow(
    EntityNotFoundError
  );
});

// REPORT_GLF.md B2: setCoordinatori/setDocentiRuolo now persist via
// Repository.save() using the DomainRepositoryLib dynamic-column passthrough
// (Classe.getKnownColumns()) instead of a hand-built row spread — these tests
// verify the cattedra matrix columns are not silently dropped on a single-
// column write.
test('setCoordinatori updates COORD and preserves the cattedra matrix columns', () => {
  const db = new FakeDatabase(fixtureTables());
  const r = new ClasseRepository(db);
  const classe = r.findById(ClasseId.of('5A'))!;
  const rossi = Docente.fromData({ EMAIL: 'rossi@school.it', DIPART: 'X' });

  r.setCoordinatori(classe, [rossi]);

  const row = db.tables.CLASSI.getByPK('5A')!;
  expect(row.COORD).toBe('rossi@school.it');
  expect(row.MATE).toBe('rossi@school.it');
  expect(row.FISI).toBe('bianchi@school.it');
  expect(row.ID).toBe('5A');
  expect(row.ANNO).toBe(5);
});

test('setRuolo sets a RUOLI JSON key without dropping other keys or matrix columns', () => {
  const db = new FakeDatabase(fixtureTables());
  const r = new ClasseRepository(db);
  const classe = r.findById(ClasseId.of('5A'))!;
  const bianchi = Docente.fromData({ EMAIL: 'bianchi@school.it', DIPART: 'X' });

  r.setRuolo(classe, 'SEGRETARIO', bianchi);

  const row = db.tables.CLASSI.getByPK('5A')!;
  const ruoli = JSON.parse(row.RUOLI as string) as Record<string, string>;
  expect(ruoli.SEGRETARIO).toBe('bianchi@school.it');
  expect(ruoli.TUTOR_ASL).toBe('rossi@school.it,bianchi@school.it');
  expect(row.MATE).toBe('rossi@school.it');
  expect(row.FISI).toBe('bianchi@school.it');
});

test('two sequential dynamic-column writes on the same Classe instance both stick', () => {
  const db = new FakeDatabase(fixtureTables());
  const r = new ClasseRepository(db);
  const classe = r.findById(ClasseId.of('5A'))!;
  const bianchi = Docente.fromData({ EMAIL: 'bianchi@school.it', DIPART: 'X' });

  r.setCoordinatori(classe, [bianchi]);
  r.setRuolo(classe, 'SEGRETARIO', bianchi);

  const row = db.tables.CLASSI.getByPK('5A')!;
  const ruoli = JSON.parse(row.RUOLI as string) as Record<string, string>;
  expect(row.COORD).toBe('bianchi@school.it');
  expect(ruoli.SEGRETARIO).toBe('bianchi@school.it');
  expect(row.MATE).toBe('rossi@school.it');
});

describe('findByDocenteAssegnato', () => {
  test('finds every class where the docente holds any teaching slot (MAIN/ITP/SPECIFICA)', () => {
    const r = new ClasseRepository(new FakeDatabase(teachingSlotFixtureTables()));

    expect(r.findByDocenteAssegnato('main@school.test').map((c) => c.id)).toEqual(['5A']);
    expect(r.findByDocenteAssegnato('specific-a@school.test').map((c) => c.id)).toEqual(['5A']);
  });

  test('a docente holding MATE in several classes is found in all of them', () => {
    const r = repo();

    expect(r.findByDocenteAssegnato('rossi@school.it').map((c) => c.id).sort()).toEqual([
      '1F',
      '1F-LSO',
      '1F-LSS',
      '5A'
    ]);
  });

  test('a docente with no teaching slot anywhere yields []', () => {
    const r = repo();

    expect(r.findByDocenteAssegnato('nobody@school.it')).toEqual([]);
  });
});

// --- A16: remaining uncovered branches (indirizzo miss, articolazione edge
// shapes, dynamic-column parsing edge cases, id-fallback messages) ---

describe('ClasseRepository — remaining uncovered branches (A16)', () => {
  test('constructor skips a MATERIE row with a blank/non-string ID when building the cattedra column map', () => {
    const db = new FakeDatabase({
      ...fixtureTables(),
      MATERIE: [...(fixtureTables().MATERIE ?? []), { ID: '', SINTESI: 'Invalid' }]
    });
    const r = new ClasseRepository(db);
    const classe = r.findById(ClasseId.of('5A'))!;
    expect(() => r.getDocentiPerMateria(classe, MateriaId.of('ZZ'))).toThrow(MateriaNotFoundError);
  });

  test('getITPPerMateria throws MateriaNotFoundError for a materia outside the cattedra matrix', () => {
    const r = repo();
    const classe = r.findById(ClasseId.of('5A'))!;
    expect(() => r.getITPPerMateria(classe, MateriaId.of('GHOST'))).toThrow(MateriaNotFoundError);
  });

  test('getStorico returns [] when STORICO is not a string', () => {
    const r = repo();
    const classe = r.findById(ClasseId.of('3B'))!;
    expect(r.getStorico(classe)).toEqual([]);
  });

  test('getIndirizzo throws EntityNotFoundError when classe.indirizzo has no INDIRIZZI row (id known)', () => {
    const r = repo();
    const classe = Classe.fromData({ ID: 'X9', ANNO: 1, INDIRIZZO: 'NOPE' });
    expect(() => r.getIndirizzo(classe)).toThrow(EntityNotFoundError);
  });

  test('getIndirizzo throws with the "?" id fallback when classe.id is null', () => {
    const r = repo();
    const classe = Classe.fromData({ ANNO: 1, INDIRIZZO: 'NOPE' });
    expect(() => r.getIndirizzo(classe)).toThrow(EntityNotFoundError);
  });

  test('getClassiPartner returns [] for a class without articolazione', () => {
    const r = repo();
    const classe = r.findById(ClasseId.of('5A'))!;
    expect(r.getClassiPartner(classe)).toEqual([]);
  });

  test('getClassiPartner throws ValidationError when called on a partner class', () => {
    const r = repo();
    const classe = r.findById(ClasseId.of('1F-LSO'))!;
    expect(() => r.getClassiPartner(classe)).toThrow(ValidationError);
  });

  test('getClassiPartner throws with the "?" id fallback when classe.id is null (resolved via empty-string PK)', () => {
    const db = new FakeDatabase({
      ...fixtureTables(),
      CLASSI: [
        ...(fixtureTables().CLASSI ?? []),
        {
          ID: '',
          ANNO: 1,
          INDIRIZZO: 'SCIENTIFICO',
          ARTICOLAZIONE: '{"parent":"1F","partner":"1F-LSS","partners":null}'
        }
      ]
    });
    const r = new ClasseRepository(db);
    const classe = Classe.fromData({ ANNO: 1, INDIRIZZO: 'SCIENTIFICO' }); // id null → rowOf falls back to PK ''
    expect(() => r.getClassiPartner(classe)).toThrow(ValidationError);
  });

  test('getClasseParent returns null for a class without articolazione', () => {
    const r = repo();
    const classe = r.findById(ClasseId.of('5A'))!;
    expect(r.getClasseParent(classe)).toBeNull();
  });

  test('getGruppoArticolazione skips a null partner result within the add() closure', () => {
    const db = new FakeDatabase({
      ...fixtureTables(),
      CLASSI: [
        ...(fixtureTables().CLASSI ?? []),
        {
          ID: '1F-ORPHAN',
          ANNO: 1,
          INDIRIZZO: 'SCIENTIFICO',
          ARTICOLAZIONE: '{"parent":"1F","partner":null,"partners":null}',
          MATE: 'rossi@school.it'
        }
      ]
    });
    const r = new ClasseRepository(db);
    const classe = r.findById(ClasseId.of('1F-ORPHAN'))!;
    const gruppo = r.getGruppoArticolazione(classe);
    expect(gruppo.map((c) => c.id).sort()).toEqual(['1F', '1F-ORPHAN']);
  });

  test('getAllDocentiCDCArticolata returns the plain CDC when the class has no articolazione', () => {
    const r = repo();
    const classe = r.findById(ClasseId.of('5A'))!;
    const result = r.getAllDocentiCDCArticolata(classe);
    expect(result.map((d) => d.id)).toEqual(r.getAllDocentiCDC(classe).map((d) => d.id));
  });

  test('getAllDocentiCDCArticolata skips the partner merge when the partner class is absent', () => {
    const db = new FakeDatabase({
      ...fixtureTables(),
      CLASSI: [
        ...(fixtureTables().CLASSI ?? []),
        {
          ID: '1F-ORPHAN',
          ANNO: 1,
          INDIRIZZO: 'SCIENTIFICO',
          ARTICOLAZIONE: '{"parent":"1F","partner":null,"partners":null}',
          MATE: 'rossi@school.it'
        }
      ]
    });
    const r = new ClasseRepository(db);
    const classe = r.findById(ClasseId.of('1F-ORPHAN'))!;
    const result = r.getAllDocentiCDCArticolata(classe);
    expect(result.map((d) => d.id)).toEqual(r.getAllDocentiCDC(classe).map((d) => d.id));
  });

  test('getDocentiPerMateriaArticolata returns [] when no group class matches the given indirizzo', () => {
    const r = repo();
    const classe = r.findById(ClasseId.of('1F'))!;
    const result = r.getDocentiPerMateriaArticolata(
      classe,
      MateriaId.of('MATE'),
      IndirizzoId.of('ITI')
    );
    expect(result).toEqual([]);
  });

  test('getMaterieArticolazione returns null for a non-articulated class', () => {
    const r = repo();
    expect(r.getMaterieArticolazione(r.findById(ClasseId.of('5A'))!)).toBeNull();
  });

  test('getMaterieArticolazione returns null when the referenced parent has no partners configured', () => {
    const db = new FakeDatabase({
      ...fixtureTables(),
      CLASSI: [
        ...(fixtureTables().CLASSI ?? []),
        {
          ID: 'CHILD-ORPHAN',
          ANNO: 1,
          INDIRIZZO: 'SCIENTIFICO',
          ARTICOLAZIONE: '{"parent":"3B","partner":"1F-LSS","partners":null}',
          MATE: 'rossi@school.it'
        }
      ]
    });
    const r = new ClasseRepository(db);
    const classe = r.findById(ClasseId.of('CHILD-ORPHAN'))!;
    expect(r.getMaterieArticolazione(classe)).toBeNull();
  });

  test('getMaterieArticolazione returns null when orderedPartners cannot resolve a parent (dangling partner field)', () => {
    const db = new FakeDatabase({
      ...fixtureTables(),
      CLASSI: [
        ...(fixtureTables().CLASSI ?? []),
        {
          ID: 'DANGLING',
          ANNO: 1,
          INDIRIZZO: 'SCIENTIFICO',
          ARTICOLAZIONE: '{"parent":null,"partner":"1F-LSS","partners":null}',
          MATE: 'rossi@school.it'
        }
      ]
    });
    const r = new ClasseRepository(db);
    const classe = r.findById(ClasseId.of('DANGLING'))!;
    expect(r.getMaterieArticolazione(classe)).toBeNull();
  });

  test('getMaterieArticolazione splits shared vs per-group subjects between 1F-LSO/1F-LSS', () => {
    const r = repo();
    const classe = r.findById(ClasseId.of('1F-LSO'))!;
    const result = r.getMaterieArticolazione(classe)!;
    expect(result.condivise).toEqual(['MATE']);
    expect(result.separatePrimoGruppo).toEqual(['FISI']);
    expect(result.separateSecondoGruppo).toEqual(['FISI']);
  });

  test('getMaterieArticolazione treats a subject as separate when the two groups have different-size teacher sets', () => {
    const db = new FakeDatabase({
      ...fixtureTables(),
      CLASSI: fixtureTables().CLASSI.map((c) =>
        c.ID === '1F-LSO' ? { ...c, MATE: 'rossi@school.it,bianchi@school.it' } : c
      )
    });
    const r = new ClasseRepository(db);
    const classe = r.findById(ClasseId.of('1F-LSO'))!;
    const result = r.getMaterieArticolazione(classe)!;
    expect(result.condivise).not.toContain('MATE');
    expect(result.separatePrimoGruppo).toContain('MATE');
  });

  test('getMaterieArticolazione does not list a subject for the group that has zero teachers of it', () => {
    const db = new FakeDatabase({
      ...fixtureTables(),
      MATERIE: [
        ...(fixtureTables().MATERIE ?? []),
        { ID: 'ITA', SINTESI: 'Italiano' },
        { ID: 'STOR', SINTESI: 'Storia' }
      ],
      CLASSI: fixtureTables().CLASSI.map((c) => {
        if (c.ID === '1F-LSO') return { ...c, ITA: 'rossi@school.it' }; // only LSO teaches ITA
        if (c.ID === '1F-LSS') return { ...c, STOR: 'verdi@school.it' }; // only LSS teaches STOR
        return c;
      })
    });
    const r = new ClasseRepository(db);
    const classe = r.findById(ClasseId.of('1F-LSO'))!;
    const result = r.getMaterieArticolazione(classe)!;
    expect(result.separatePrimoGruppo).toContain('ITA');
    expect(result.separateSecondoGruppo).not.toContain('ITA');
    expect(result.separateSecondoGruppo).toContain('STOR');
    expect(result.separatePrimoGruppo).not.toContain('STOR');
  });

  test('getITPPerMateria returns the itp-column docenti when set', () => {
    const db = new FakeDatabase({
      ...fixtureTables(),
      CLASSI: fixtureTables().CLASSI.map((c) =>
        c.ID === '5A' ? { ...c, 'FISI.itp': 'verdi@school.it' } : c
      )
    });
    const r = new ClasseRepository(db);
    const classe = r.findById(ClasseId.of('5A'))!;
    expect(r.getITPPerMateria(classe, MateriaId.of('FISI')).map((d) => d.id)).toEqual([
      'verdi@school.it'
    ]);
  });

  test('getMaterieDelDocente flags a subject taught only via the itp column', () => {
    const db = new FakeDatabase({
      ...fixtureTables(),
      CLASSI: fixtureTables().CLASSI.map((c) =>
        c.ID === '5A' ? { ...c, 'FISI.itp': 'verdi@school.it' } : c
      )
    });
    const r = new ClasseRepository(db);
    const classe = r.findById(ClasseId.of('5A'))!;
    expect(r.getMaterieDelDocente(classe, 'verdi@school.it')).toEqual([
      { sigla: 'FISI', isItp: true }
    ]);
  });

  test('getMateriaDocente resolves via the itp column when not the main teacher', () => {
    const db = new FakeDatabase({
      ...fixtureTables(),
      CLASSI: fixtureTables().CLASSI.map((c) =>
        c.ID === '5A' ? { ...c, 'FISI.itp': 'verdi@school.it' } : c
      )
    });
    const r = new ClasseRepository(db);
    const classe = r.findById(ClasseId.of('5A'))!;
    expect(r.getMateriaDocente(classe, 'verdi@school.it')).toBe('FISI');
  });

  test('requireClasse throws EntityNotFoundError when a partner/parent id is not in CLASSI', () => {
    const db = new FakeDatabase({
      ...fixtureTables(),
      CLASSI: [
        ...(fixtureTables().CLASSI ?? []),
        {
          ID: 'GHOST-PARTNER',
          ANNO: 1,
          INDIRIZZO: 'SCIENTIFICO',
          ARTICOLAZIONE: '{"parent":"1F","partner":"NOPE","partners":null}',
          MATE: 'rossi@school.it'
        }
      ]
    });
    const r = new ClasseRepository(db);
    const classe = r.findById(ClasseId.of('GHOST-PARTNER'))!;
    expect(() => r.getClassePartner(classe)).toThrow(EntityNotFoundError);
  });

  test('setCoordinatori filters out a coordinatore Docente with no id', () => {
    const db = new FakeDatabase(fixtureTables());
    const r = new ClasseRepository(db);
    const classe = r.findById(ClasseId.of('5A'))!;
    const ghost = Docente.fromData({}); // no EMAIL → id null
    r.setCoordinatori(classe, [ghost]);
    const row = db.tables.CLASSI.getByPK('5A')!;
    expect(row.COORD).toBe('');
  });

  test('setDocentiRuolo starts from an empty roles object when RUOLI is not set, and drops a Docente with no id', () => {
    const db = new FakeDatabase(fixtureTables());
    const r = new ClasseRepository(db);
    const classe = r.findById(ClasseId.of('3B'))!; // RUOLI: null in fixture
    const ghost = Docente.fromData({}); // no EMAIL → id null
    r.setDocentiRuolo(classe, 'SEGRETARIO', [ghost]);
    const row = db.tables.CLASSI.getByPK('3B')!;
    const ruoli = JSON.parse(row.RUOLI as string) as Record<string, string>;
    // The ghost docente's blank id is filtered out, so no key gets written for SEGRETARIO.
    expect(ruoli.SEGRETARIO).toBeUndefined();
  });

  test('getConsiglioDiClasse throws EntityNotFoundError for an unknown classe id', () => {
    const r = repo();
    expect(() => r.getConsiglioDiClasse(ClasseId.of('ZZZZ'))).toThrow(EntityNotFoundError);
  });

  test('getConsiglioDiClasse skips subjects with no teacher assigned in the cattedra matrix', () => {
    const r = repo();
    const cdc = r.getConsiglioDiClasse(ClasseId.of('3B')); // 3B has MATE only, no FISI cell
    expect(cdc.cattedre.map((k) => k.materia.value)).toEqual(['MATE']);
  });

  test('rowOf resolves via the empty-string PK fallback when classe.id is null and no such row exists', () => {
    const r = repo();
    const classe = Classe.fromData({ ANNO: 1, INDIRIZZO: 'SCIENTIFICO' }); // id null
    expect(() => r.getStorico(classe)).toThrow(EntityNotFoundError);
  });

  test('rowOf throws EntityNotFoundError referencing the real id when the classe id is unknown', () => {
    const r = repo();
    const classe = Classe.fromData({ ID: 'ZZZ', ANNO: 1, INDIRIZZO: 'SCIENTIFICO' });
    expect(() => r.getStorico(classe)).toThrow(EntityNotFoundError);
  });

  test('loadDocentiFromEmails skips CSV emails not present in DOCENTI', () => {
    const db = new FakeDatabase({
      ...fixtureTables(),
      CLASSI: fixtureTables().CLASSI.map((c) =>
        c.ID === '5A' ? { ...c, IRC: 'bianchi@school.it,ghost@school.it' } : c
      )
    });
    const r = new ClasseRepository(db);
    const classe = r.findById(ClasseId.of('5A'))!;
    expect(r.getDocentiIRC(classe).map((d) => d.id)).toEqual(['bianchi@school.it']);
  });
});
