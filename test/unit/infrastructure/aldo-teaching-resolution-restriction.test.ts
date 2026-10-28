import { AldoTeachingAssignmentResolver } from '../../../src/infrastructure/role-resolution/AldoTeachingAssignmentResolver';
import { ClasseId } from '../../../src/domain/value-objects/ClasseId';
import { MateriaId } from '../../../src/domain/value-objects/MateriaId';
import type { Row } from '../../../src/infrastructure/db/Database';
import { ClasseRepository } from '../../../src/infrastructure/repositories/ClasseRepository';
import { FakeDatabase } from '../../../test/fakes/FakeDatabase';
import { teachingSlotFixtureTables } from '../../../test/fixtures/tables';

function freshTables(): Record<string, Row[]> {
  const tables = teachingSlotFixtureTables();
  return Object.fromEntries(
    Object.entries(tables).map(([name, rows]) => [name, rows.map((row) => ({ ...row }))])
  );
}

function docente(email: string): Row {
  return {
    EMAIL: email,
    COGNOME: email.split('@')[0]!.toUpperCase(),
    NOME: 'TEST',
    GENERE: 'F',
    DIPART: 'SCIENTIFICO_DIP',
    ITP: false
  };
}

function plainClasse(id: string, columns: Record<string, string> = {}): Row {
  return {
    ID: id,
    ANNO: 1,
    INDIRIZZO: 'SCIENTIFICO',
    ARTICOLAZIONE: null,
    ATTIVA: true,
    ...columns
  };
}

function resolverFor(tables: Record<string, Row[]>): {
  resolver: AldoTeachingAssignmentResolver;
  classi: ClasseRepository;
} {
  const database = new FakeDatabase(tables);
  return {
    resolver: new AldoTeachingAssignmentResolver(database),
    classi: new ClasseRepository(database)
  };
}

function actorFor(
  resolver: AldoTeachingAssignmentResolver,
  classi: ClasseRepository,
  classeId: string,
  materia: string,
  date: string
): string | undefined {
  const classe = classi.findById(ClasseId.of(classeId));
  if (classe === null) throw new Error(`Fixture ${classeId} assente`);
  return (
    resolver.resolveMateria(classe, MateriaId.of(materia), new Date(date))[0]?.docenteEffettivo
      .id ?? undefined
  );
}

describe('chronology: chain-walking VARIAZIONI_CATTEDRA overrides', () => {
  test('2-hop chain resolves to the intermediate holder before the second DAL and the final holder after', () => {
    const tables = freshTables();
    tables.DOCENTI!.push(docente('hop-b@school.test'), docente('hop-c@school.test'));
    tables.VARIAZIONI_CATTEDRA = [
      {
        TITOLARE: 'main@school.test',
        NUOVO_TITOLARE: 'hop-b@school.test',
        DAL: '2025-09-01',
        CLASSI: '5A',
        MATERIE: 'MAT'
      },
      {
        TITOLARE: 'hop-b@school.test',
        NUOVO_TITOLARE: 'hop-c@school.test',
        DAL: '2026-01-15',
        CLASSI: '5A',
        MATERIE: 'MAT'
      }
    ];
    tables.SUPPLENZE = [];
    const { resolver, classi } = resolverFor(tables);

    expect(actorFor(resolver, classi, '5A', 'MAT', '2025-10-01')).toBe('hop-b@school.test');
    expect(actorFor(resolver, classi, '5A', 'MAT', '2026-02-01')).toBe('hop-c@school.test');
  });

  test('3-hop chain resolves to whichever holder is current as of each date', () => {
    const tables = freshTables();
    tables.DOCENTI!.push(
      docente('hop-b@school.test'),
      docente('hop-c@school.test'),
      docente('hop-d@school.test')
    );
    tables.VARIAZIONI_CATTEDRA = [
      {
        TITOLARE: 'main@school.test',
        NUOVO_TITOLARE: 'hop-b@school.test',
        DAL: '2025-09-01',
        CLASSI: '5A',
        MATERIE: 'MAT'
      },
      {
        TITOLARE: 'hop-b@school.test',
        NUOVO_TITOLARE: 'hop-c@school.test',
        DAL: '2026-01-15',
        CLASSI: '5A',
        MATERIE: 'MAT'
      },
      {
        TITOLARE: 'hop-c@school.test',
        NUOVO_TITOLARE: 'hop-d@school.test',
        DAL: '2026-06-01',
        CLASSI: '5A',
        MATERIE: 'MAT'
      }
    ];
    tables.SUPPLENZE = [];
    const { resolver, classi } = resolverFor(tables);

    expect(actorFor(resolver, classi, '5A', 'MAT', '2025-10-01')).toBe('hop-b@school.test');
    expect(actorFor(resolver, classi, '5A', 'MAT', '2026-03-01')).toBe('hop-c@school.test');
    expect(actorFor(resolver, classi, '5A', 'MAT', '2026-07-01')).toBe('hop-d@school.test');
  });
});

describe('CLASSI/MATERIE restriction semantics (worked MAT/FIS/1A/1B/3C example)', () => {
  function restrictionTables(): Record<string, Row[]> {
    const tables = freshTables();
    tables.CLASSI!.push(
      plainClasse('X1', { MAT: 'multi@school.test' }),
      plainClasse('X2', { MAT: 'multi@school.test', FISI: 'multi@school.test' }),
      plainClasse('X3', { FISI: 'multi@school.test' })
    );
    tables.DOCENTI!.push(docente('multi@school.test'), docente('target@school.test'));
    tables.SUPPLENZE = [];
    return tables;
  }

  test('empty CLASSI + CSV MATERIE: only pairs where the anchor nominally teaches that materia', () => {
    const tables = restrictionTables();
    tables.VARIAZIONI_CATTEDRA = [
      {
        TITOLARE: 'multi@school.test',
        NUOVO_TITOLARE: 'target@school.test',
        DAL: '2026-01-01',
        CLASSI: '',
        MATERIE: 'FISI'
      }
    ];
    const { resolver, classi } = resolverFor(tables);

    expect(actorFor(resolver, classi, 'X2', 'FISI', '2026-02-01')).toBe('target@school.test');
    expect(actorFor(resolver, classi, 'X3', 'FISI', '2026-02-01')).toBe('target@school.test');
    // X1 doesn't teach FISI at all -> untouched; its unrelated MAT slot is also untouched.
    expect(actorFor(resolver, classi, 'X1', 'MAT', '2026-02-01')).toBe('multi@school.test');
  });

  test('CSV CLASSI + empty MATERIE: only subjects the anchor actually teaches in those classes', () => {
    const tables = restrictionTables();
    tables.VARIAZIONI_CATTEDRA = [
      {
        TITOLARE: 'multi@school.test',
        NUOVO_TITOLARE: 'target@school.test',
        DAL: '2026-01-01',
        CLASSI: 'X1,X2',
        MATERIE: ''
      }
    ];
    const { resolver, classi } = resolverFor(tables);

    expect(actorFor(resolver, classi, 'X1', 'MAT', '2026-02-01')).toBe('target@school.test');
    expect(actorFor(resolver, classi, 'X2', 'MAT', '2026-02-01')).toBe('target@school.test');
    expect(actorFor(resolver, classi, 'X2', 'FISI', '2026-02-01')).toBe('target@school.test');
    // X3 isn't in CLASSI -> untouched even though the anchor teaches FISI there too.
    expect(actorFor(resolver, classi, 'X3', 'FISI', '2026-02-01')).toBe('multi@school.test');
  });

  test('empty CLASSI + empty MATERIE: every (classe, materia) the anchor nominally teaches', () => {
    const tables = restrictionTables();
    tables.VARIAZIONI_CATTEDRA = [
      {
        TITOLARE: 'multi@school.test',
        NUOVO_TITOLARE: 'target@school.test',
        DAL: '2026-01-01',
        CLASSI: '',
        MATERIE: ''
      }
    ];
    const { resolver, classi } = resolverFor(tables);

    expect(actorFor(resolver, classi, 'X1', 'MAT', '2026-02-01')).toBe('target@school.test');
    expect(actorFor(resolver, classi, 'X2', 'MAT', '2026-02-01')).toBe('target@school.test');
    expect(actorFor(resolver, classi, 'X2', 'FISI', '2026-02-01')).toBe('target@school.test');
    expect(actorFor(resolver, classi, 'X3', 'FISI', '2026-02-01')).toBe('target@school.test');
  });

  test('empty CLASSI + MATERIE=* degenerates to empty/empty', () => {
    const tables = restrictionTables();
    tables.VARIAZIONI_CATTEDRA = [
      {
        TITOLARE: 'multi@school.test',
        NUOVO_TITOLARE: 'target@school.test',
        DAL: '2026-01-01',
        CLASSI: '',
        MATERIE: '*'
      }
    ];
    const { resolver, classi } = resolverFor(tables);

    expect(actorFor(resolver, classi, 'X1', 'MAT', '2026-02-01')).toBe('target@school.test');
    expect(actorFor(resolver, classi, 'X3', 'FISI', '2026-02-01')).toBe('target@school.test');
  });

  test('CLASSI=* + empty MATERIE degenerates to empty/empty', () => {
    const tables = restrictionTables();
    tables.VARIAZIONI_CATTEDRA = [
      {
        TITOLARE: 'multi@school.test',
        NUOVO_TITOLARE: 'target@school.test',
        DAL: '2026-01-01',
        CLASSI: '*',
        MATERIE: ''
      }
    ];
    const { resolver, classi } = resolverFor(tables);

    expect(actorFor(resolver, classi, 'X1', 'MAT', '2026-02-01')).toBe('target@school.test');
    expect(actorFor(resolver, classi, 'X3', 'FISI', '2026-02-01')).toBe('target@school.test');
  });

  test('CSV CLASSI + CSV MATERIE: existing cartesian behavior, unchanged', () => {
    const tables = restrictionTables();
    tables.VARIAZIONI_CATTEDRA = [
      {
        TITOLARE: 'multi@school.test',
        NUOVO_TITOLARE: 'target@school.test',
        DAL: '2026-01-01',
        CLASSI: 'X1,X2',
        MATERIE: 'MAT'
      }
    ];
    const { resolver, classi } = resolverFor(tables);

    expect(actorFor(resolver, classi, 'X1', 'MAT', '2026-02-01')).toBe('target@school.test');
    expect(actorFor(resolver, classi, 'X2', 'MAT', '2026-02-01')).toBe('target@school.test');
    expect(actorFor(resolver, classi, 'X2', 'FISI', '2026-02-01')).toBe('multi@school.test');
  });

  test('* CLASSI + CSV MATERIE: every class, only the listed subject', () => {
    const tables = restrictionTables();
    tables.VARIAZIONI_CATTEDRA = [
      {
        TITOLARE: 'multi@school.test',
        NUOVO_TITOLARE: 'target@school.test',
        DAL: '2026-01-01',
        CLASSI: '*',
        MATERIE: 'FISI'
      }
    ];
    const { resolver, classi } = resolverFor(tables);

    expect(actorFor(resolver, classi, 'X2', 'FISI', '2026-02-01')).toBe('target@school.test');
    expect(actorFor(resolver, classi, 'X3', 'FISI', '2026-02-01')).toBe('target@school.test');
    expect(actorFor(resolver, classi, 'X2', 'MAT', '2026-02-01')).toBe('multi@school.test');
  });

  test('CSV CLASSI + * MATERIE: listed classes, every subject', () => {
    const tables = restrictionTables();
    tables.VARIAZIONI_CATTEDRA = [
      {
        TITOLARE: 'multi@school.test',
        NUOVO_TITOLARE: 'target@school.test',
        DAL: '2026-01-01',
        CLASSI: 'X2',
        MATERIE: '*'
      }
    ];
    const { resolver, classi } = resolverFor(tables);

    expect(actorFor(resolver, classi, 'X2', 'MAT', '2026-02-01')).toBe('target@school.test');
    expect(actorFor(resolver, classi, 'X2', 'FISI', '2026-02-01')).toBe('target@school.test');
    expect(actorFor(resolver, classi, 'X1', 'MAT', '2026-02-01')).toBe('multi@school.test');
  });

  test('* CLASSI + * MATERIE: fully unrestricted', () => {
    const tables = restrictionTables();
    tables.VARIAZIONI_CATTEDRA = [
      {
        TITOLARE: 'multi@school.test',
        NUOVO_TITOLARE: 'target@school.test',
        DAL: '2026-01-01',
        CLASSI: '*',
        MATERIE: '*'
      }
    ];
    const { resolver, classi } = resolverFor(tables);

    expect(actorFor(resolver, classi, 'X1', 'MAT', '2026-02-01')).toBe('target@school.test');
    expect(actorFor(resolver, classi, 'X2', 'FISI', '2026-02-01')).toBe('target@school.test');
    expect(actorFor(resolver, classi, 'X3', 'FISI', '2026-02-01')).toBe('target@school.test');
  });
});

describe('slot-level targeting (.itp / .SPECIFICA MATERIE entries)', () => {
  test('VARIAZIONI_CATTEDRA MATERIE=INF.itp only overrides the ITP slot, not MAIN', () => {
    const tables = freshTables();
    tables.DOCENTI!.push(docente('itp-new@school.test'));
    tables.VARIAZIONI_CATTEDRA = [
      {
        TITOLARE: 'itp@school.test',
        NUOVO_TITOLARE: 'itp-new@school.test',
        DAL: '2026-01-01',
        CLASSI: '5A',
        MATERIE: 'INF.itp'
      }
    ];
    tables.SUPPLENZE = [];
    const { resolver, classi } = resolverFor(tables);

    expect(actorFor(resolver, classi, '5A', 'INF', '2026-02-01')).toBe('itp-new@school.test');
  });

  test('SUPPLENZE MATERIE=LAB.GRUPPO_A only delegates that SPECIFICA, not LAB.GRUPPO_B', () => {
    const tables = freshTables();
    tables.DOCENTI!.push(docente('sub-a@school.test'));
    tables.VARIAZIONI_CATTEDRA = [];
    tables.SUPPLENZE = [
      {
        TITOLARE: 'specific-a@school.test',
        SUPPLENTE: 'sub-a@school.test',
        DAL: '2026-01-01',
        AL: null,
        CLASSI: '5A',
        MATERIE: 'LAB.GRUPPO_A'
      }
    ];
    const { resolver, classi } = resolverFor(tables);
    const classe = classi.findById(ClasseId.of('5A'))!;

    const assignments = resolver.resolveMateria(
      classe,
      MateriaId.of('LAB'),
      new Date('2026-02-01')
    );
    const groupA = assignments.find((a) => a.slot.specifica === 'GRUPPO_A')!;
    const groupB = assignments.find((a) => a.slot.specifica === 'GRUPPO_B')!;

    expect(groupA.docenteEffettivo.id).toBe('sub-a@school.test');
    expect(groupB.docenteEffettivo.id).toBe('specific-b@school.test');
  });

  test('mixed bare + slot-qualified entries in one MATERIE CSV split independently per entry', () => {
    const tables = freshTables();
    tables.CLASSI!.push(
      plainClasse('X5', { MAT: 'combo@school.test', 'INF.itp': 'combo@school.test' })
    );
    tables.DOCENTI!.push(docente('combo@school.test'), docente('combo-target@school.test'));
    tables.VARIAZIONI_CATTEDRA = [
      {
        TITOLARE: 'combo@school.test',
        NUOVO_TITOLARE: 'combo-target@school.test',
        DAL: '2026-01-01',
        CLASSI: 'X5',
        MATERIE: 'MAT,INF.itp'
      }
    ];
    tables.SUPPLENZE = [];
    const { resolver, classi } = resolverFor(tables);

    expect(actorFor(resolver, classi, 'X5', 'MAT', '2026-02-01')).toBe('combo-target@school.test');
    expect(actorFor(resolver, classi, 'X5', 'INF', '2026-02-01')).toBe('combo-target@school.test');
  });
});
