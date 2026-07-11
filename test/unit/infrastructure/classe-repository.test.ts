import { ClasseRepository } from '../../../src/infrastructure/repositories/ClasseRepository';
import { Docente } from '../../../src/domain/entities/Docente';
import { FakeDatabase } from '../../../test/fakes/FakeDatabase';
import { fixtureTables } from '../../../test/fixtures/tables';
import { ClasseId } from '../../../src/domain/value-objects/ClasseId';
import { EntityNotFoundError, ValidationError } from '../../../src/domain/errors/DomainError';

function repo(): ClasseRepository {
  return new ClasseRepository(new FakeDatabase(fixtureTables()));
}

test('findById maps CLASSI row to Classe entity', () => {
  const c = repo().findById(ClasseId.of('5A'));
  expect(c?.nome).toBe('5A');
  expect(c?.anno.value).toBe(5);
  expect(c?.indirizzo).toBe('SCIENTIFICO');
});

test('getConsiglioDiClasse derives cattedre from teacher columns (05/06)', () => {
  const cdc = repo().getConsiglioDiClasse(ClasseId.of('5A'));
  const pairs = cdc.cattedre.map((k) => `${k.materia.value}:${k.docente.email.value}`).sort();
  expect(pairs).toEqual(['FISI:bianchi@school.it', 'MATE:rossi@school.it']);
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
