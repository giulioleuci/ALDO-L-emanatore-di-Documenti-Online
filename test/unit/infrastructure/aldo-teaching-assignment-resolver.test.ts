import { AldoTeachingAssignmentResolver } from '../../../src/infrastructure/role-resolution/AldoTeachingAssignmentResolver';
import type { TeachingAssignment } from '../../../src/application/ports/ITeachingAssignmentResolver';
import { ClasseId } from '../../../src/domain/value-objects/ClasseId';
import { MateriaId } from '../../../src/domain/value-objects/MateriaId';
import type { Row } from '../../../src/infrastructure/db/Database';
import { ClasseRepository } from '../../../src/infrastructure/repositories/ClasseRepository';
import { FakeDatabase } from '../../../test/fakes/FakeDatabase';
import { teachingSlotFixtureTables } from '../../../test/fixtures/tables';
import { AmbiguousVariazioneCattedraError } from '../../../src/domain/errors/DomainError';

function freshTables(): Record<string, Row[]> {
  const tables = teachingSlotFixtureTables();
  return Object.fromEntries(
    Object.entries(tables).map(([name, rows]) => [name, rows.map((row) => ({ ...row }))])
  );
}

function docente(email: string, itp = false): Row {
  return {
    EMAIL: email,
    COGNOME: email.split('@')[0]!.toUpperCase(),
    NOME: 'TEST',
    GENERE: 'F',
    DIPART: 'SCIENTIFICO_DIP',
    ITP: itp
  };
}

function resolverFor(tables: Record<string, Row[]>): {
  resolver: AldoTeachingAssignmentResolver;
  classe5A: NonNullable<ReturnType<ClasseRepository['findById']>>;
} {
  const database = new FakeDatabase(tables);
  const resolver = new AldoTeachingAssignmentResolver(database);
  const classe5A = new ClasseRepository(database).findById(ClasseId.of('5A'));
  if (classe5A === null) throw new Error('Fixture 5A assente');
  return { resolver, classe5A };
}

function columnOf(assignment: TeachingAssignment): string {
  if (assignment.slot.kind === 'ITP') return `${assignment.slot.materia.value}.itp`;
  if (assignment.slot.kind === 'SPECIFICA') {
    return `${assignment.slot.materia.value}.${assignment.slot.specifica ?? ''}`;
  }
  return assignment.slot.materia.value;
}

function byColumn(assignments: TeachingAssignment[], column: string): TeachingAssignment {
  const assignment = assignments.find((item) => columnOf(item) === column);
  if (assignment === undefined) throw new Error(`Assegnazione ${column} assente`);
  return assignment;
}

test('resolves MAIN, ITP, arbitrary SPECIFICA, IRC, and ALT through GLF mappings', () => {
  const tables = freshTables();
  const classe5A = tables.CLASSI!.find((row) => row.ID === '5A')!;
  classe5A['LAB.GRUPPO_B'] = 'specific-a@school.test';
  tables.DOCENTI!.push(
    docente('main-sub@school.test'),
    docente('main-new@school.test'),
    docente('itp-new@school.test', true),
    docente('itp-sub@school.test', true),
    docente('specific-old-new@school.test'),
    docente('specific-new@school.test'),
    docente('specific-mid@school.test'),
    docente('specific-sub@school.test'),
    docente('irc-new@school.test'),
    docente('irc-sub@school.test'),
    docente('alt-new@school.test'),
    docente('alt-sub@school.test')
  );
  tables.VARIAZIONI_CATTEDRA = [
    {
      TITOLARE: 'main@school.test',
      NUOVO_TITOLARE: 'main-new@school.test',
      DAL: '2026-01-15',
      CLASSI: '5A',
      MATERIE: 'MAT'
    },
    {
      TITOLARE: 'itp@school.test',
      NUOVO_TITOLARE: 'itp-new@school.test',
      DAL: '2026-01-15',
      CLASSI: '5A',
      MATERIE: 'INF'
    },
    {
      TITOLARE: 'specific-a@school.test',
      NUOVO_TITOLARE: 'specific-old-new@school.test',
      DAL: '2025-12-01',
      CLASSI: '5A',
      MATERIE: 'LAB'
    },
    {
      TITOLARE: 'specific-a@school.test',
      NUOVO_TITOLARE: 'specific-new@school.test',
      DAL: '2026-01-15',
      CLASSI: '5A',
      MATERIE: 'LAB'
    },
    {
      TITOLARE: 'irc@school.test',
      NUOVO_TITOLARE: 'irc-new@school.test',
      DAL: '2026-01-10',
      CLASSI: '5A',
      MATERIE: 'IRC'
    },
    {
      TITOLARE: 'alt@school.test',
      NUOVO_TITOLARE: 'alt-new@school.test',
      DAL: '2026-01-10',
      CLASSI: '5A',
      MATERIE: 'ALT'
    }
  ];
  tables.SUPPLENZE = [
    {
      TITOLARE: 'main-new@school.test',
      SUPPLENTE: 'main-sub@school.test',
      DAL: '2026-02-01',
      AL: null,
      CLASSI: '4B, 5A',
      MATERIE: '*'
    },
    {
      TITOLARE: 'itp-new@school.test',
      SUPPLENTE: 'itp-sub@school.test',
      DAL: '2026-02-01',
      AL: null,
      CLASSI: '5A',
      MATERIE: 'INF'
    },
    {
      TITOLARE: 'specific-new@school.test',
      SUPPLENTE: 'specific-mid@school.test',
      DAL: '2026-02-01',
      AL: null,
      CLASSI: '5A',
      MATERIE: 'LAB'
    },
    {
      TITOLARE: 'specific-mid@school.test',
      SUPPLENTE: 'specific-sub@school.test',
      DAL: '2026-02-02',
      AL: null,
      CLASSI: '*',
      MATERIE: 'LAB, INTERPRET'
    },
    {
      TITOLARE: 'irc-new@school.test',
      SUPPLENTE: 'irc-sub@school.test',
      DAL: '2026-02-01',
      AL: null,
      CLASSI: '*',
      MATERIE: 'IRC, ALT'
    },
    {
      TITOLARE: 'alt-new@school.test',
      SUPPLENTE: 'alt-sub@school.test',
      DAL: '2026-02-01',
      AL: null,
      CLASSI: '*',
      MATERIE: '*'
    }
  ];
  const { resolver, classe5A: classe } = resolverFor(tables);

  const assignments = resolver.resolveConsiglio(classe, new Date('2026-02-15'), {
    includeReligioneAlt: true,
    routingPolicy: RoutingPolicy.DELEGATE_OR_PRINCIPAL
  });

  const main = byColumn(assignments, 'MAT');
  expect(main.titolareNominale.id).toBe('main@school.test');
  expect(main.titolare.id).toBe('main-new@school.test');
  expect(main.docenteEffettivo.id).toBe('main-sub@school.test');
  expect(main.routing.primary.map((actor) => actor.id)).toEqual(['main-sub@school.test']);
  expect(main.routing.cc).toEqual([]);
  expect(main.routing.bcc).toEqual([]);
  const itp = byColumn(assignments, 'INF.itp');
  expect(itp.slot).toEqual({ materia: MateriaId.of('INF'), kind: 'ITP', specifica: null });
  expect(itp.titolareNominale.id).toBe('itp@school.test');
  expect(itp.titolare.id).toBe('itp-new@school.test');
  expect(itp.docenteEffettivo.id).toBe('itp-sub@school.test');
  const specifica = byColumn(assignments, 'LAB.GRUPPO_A');
  expect(specifica.slot).toEqual({
    materia: MateriaId.of('LAB'),
    kind: 'SPECIFICA',
    specifica: 'GRUPPO_A'
  });
  expect(specifica.titolareNominale.id).toBe('specific-a@school.test');
  expect(specifica.titolare.id).toBe('specific-new@school.test');
  expect(specifica.docenteEffettivo.id).toBe('specific-sub@school.test');
  expect(byColumn(assignments, 'LAB.GRUPPO_A').delegationChain.map((actor) => actor.id)).toEqual([
    'specific-new@school.test',
    'specific-mid@school.test',
    'specific-sub@school.test'
  ]);
  expect(byColumn(assignments, 'LAB.GRUPPO_B').titolareNominale.id).toBe('specific-a@school.test');
  expect(byColumn(assignments, 'LAB.GRUPPO.A').slot.specifica).toBe('GRUPPO.A');
  const musical = byColumn(assignments, 'INTERPRET.CHITARRA');
  expect(musical.slot.specifica).toBe('CHITARRA');
  expect(musical.titolareNominale.id).toBe('guitar@school.test');
  expect(byColumn(assignments, 'IRC').titolare.id).toBe('irc-new@school.test');
  expect(byColumn(assignments, 'IRC').docenteEffettivo.id).toBe('irc-sub@school.test');
  expect(byColumn(assignments, 'ALT').titolareNominale.id).toBe('alt@school.test');
  expect(byColumn(assignments, 'ALT').titolare.id).toBe('alt-new@school.test');
  expect(byColumn(assignments, 'ALT').docenteEffettivo.id).toBe('alt-sub@school.test');
  expect(byColumn(assignments, 'LAB.GRUPPO_A').trace).not.toHaveLength(0);

  const ordinaryCouncil = resolver.resolveConsiglio(classe, new Date('2026-02-15'));
  expect(ordinaryCouncil.map(columnOf)).not.toEqual(expect.arrayContaining(['IRC', 'ALT']));
});

test('rejects tied latest overrides and a missing new holder', () => {
  const cases: Array<{
    name: string;
    variazioni: Row[];
    error: typeof AmbiguousVariazioneCattedraError | typeof AssignmentActorNotFoundError;
  }> = [
    {
      name: 'tied',
      variazioni: [
        {
          TITOLARE: 'main@school.test',
          NUOVO_TITOLARE: 'specific-a@school.test',
          DAL: '2026-01-01',
          CLASSI: '5A',
          MATERIE: 'MAT'
        },
        {
          TITOLARE: 'main@school.test',
          NUOVO_TITOLARE: 'specific-b@school.test',
          DAL: '2026-01-01',
          CLASSI: '5A',
          MATERIE: 'MAT'
        }
      ],
      error: AmbiguousVariazioneCattedraError
    },
    {
      name: 'missing',
      variazioni: [
        {
          TITOLARE: 'main@school.test',
          NUOVO_TITOLARE: 'missing@school.test',
          DAL: '2026-01-01',
          CLASSI: '5A',
          MATERIE: 'MAT'
        }
      ],
      error: AssignmentActorNotFoundError
    }
  ];

  for (const scenario of cases) {
    const tables = freshTables();
    tables.VARIAZIONI_CATTEDRA = scenario.variazioni;
    tables.SUPPLENZE = [];
    const { resolver, classe5A } = resolverFor(tables);
    expect(() =>
      resolver.resolveMateria(classe5A, MateriaId.of('MAT'), new Date('2026-02-15'))
    ).toThrow(scenario.error);
  }
});

test('a VARIAZIONI_CATTEDRA row whose TITOLARE matches no actual holder is inert, not an error', () => {
  const tables = freshTables();
  tables.VARIAZIONI_CATTEDRA = [
    {
      TITOLARE: 'other@school.test',
      NUOVO_TITOLARE: 'specific-a@school.test',
      DAL: '2026-01-01',
      CLASSI: '5A',
      MATERIE: 'MAT'
    }
  ];
  tables.SUPPLENZE = [];
  const { resolver, classe5A } = resolverFor(tables);

  const [assignment] = resolver.resolveMateria(
    classe5A,
    MateriaId.of('MAT'),
    new Date('2026-02-15')
  );

  expect(assignment!.titolare.email.value).toBe('main@school.test');
});

test('rejects delegation cycles and overlapping outgoing delegations', () => {
  const cases: Array<{
    supplenze: Row[];
    errorName: string;
  }> = [
    {
      supplenze: [
        {
          TITOLARE: 'main@school.test',
          SUPPLENTE: 'specific-a@school.test',
          DAL: '2026-01-01',
          AL: null,
          CLASSI: '5A',
          MATERIE: 'MAT'
        },
        {
          TITOLARE: 'specific-a@school.test',
          SUPPLENTE: 'main@school.test',
          DAL: '2026-01-01',
          AL: null,
          CLASSI: '5A',
          MATERIE: 'MAT'
        }
      ],
      errorName: 'CircularDelegationError'
    },
    {
      supplenze: [
        {
          TITOLARE: 'main@school.test',
          SUPPLENTE: 'specific-a@school.test',
          DAL: '2026-01-01',
          AL: null,
          CLASSI: '5A',
          MATERIE: 'MAT'
        },
        {
          TITOLARE: 'main@school.test',
          SUPPLENTE: 'specific-b@school.test',
          DAL: '2026-01-01',
          AL: null,
          CLASSI: '*',
          MATERIE: '*'
        }
      ],
      errorName: 'OverlappingDelegationError'
    }
  ];

  for (const scenario of cases) {
    const tables = freshTables();
    tables.VARIAZIONI_CATTEDRA = [];
    tables.SUPPLENZE = scenario.supplenze;
    const { resolver, classe5A } = resolverFor(tables);
    let caught: unknown;
    try {
      resolver.resolveMateria(classe5A, MateriaId.of('MAT'), new Date('2026-02-15'));
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).name).toBe(scenario.errorName);
  }
});

test('permits an unbounded delegation chain longer than the legacy depth limit', () => {
  const tables = freshTables();
  const delegates = Array.from({ length: 11 }, (_, index) => `chain-${index + 1}@school.test`);
  tables.DOCENTI!.push(...delegates.map((email) => docente(email)));
  tables.VARIAZIONI_CATTEDRA = [];
  tables.SUPPLENZE = delegates.map((delegate, index) => ({
    TITOLARE: index === 0 ? 'main@school.test' : delegates[index - 1],
    SUPPLENTE: delegate,
    DAL: '2026-01-01',
    AL: null,
    CLASSI: '5A',
    MATERIE: 'MAT'
  }));
  const { resolver, classe5A } = resolverFor(tables);

  const assignment = resolver.resolveMateria(
    classe5A,
    MateriaId.of('MAT'),
    new Date('2026-02-15')
  )[0]!;

  expect(assignment.docenteEffettivo.id).toBe('chain-11@school.test');
  expect(assignment.delegationChain).toHaveLength(12);
});

test('composes articulated partner MAIN, ITP, and SPECIFICA slots through GLF', () => {
  const tables = freshTables();
  const lso = tables.CLASSI!.find((row) => row.ID === '1F-LSO')!;
  const lss = tables.CLASSI!.find((row) => row.ID === '1F-LSS')!;
  Object.assign(lso, {
    MAT: 'main@school.test',
    'INF.itp': 'itp@school.test',
    'LAB.GRUPPO_A': 'specific-a@school.test'
  });
  Object.assign(lss, {
    MAT: 'main@school.test',
    'INF.itp': 'verdi@school.it',
    'LAB.GRUPPO_B': 'specific-b@school.test'
  });
  tables.DOCENTI!.push(
    docente('articulated-sub@school.test'),
    docente('articulated-new@school.test')
  );
  tables.VARIAZIONI_CATTEDRA = [
    {
      TITOLARE: 'main@school.test',
      NUOVO_TITOLARE: 'articulated-new@school.test',
      DAL: '2026-01-15',
      CLASSI: '1F-LSS',
      MATERIE: 'MAT'
    }
  ];
  tables.SUPPLENZE = [
    {
      TITOLARE: 'main@school.test',
      SUPPLENTE: 'articulated-sub@school.test',
      DAL: '2026-02-01',
      AL: null,
      CLASSI: '1F-LSO',
      MATERIE: 'MAT'
    },
    {
      TITOLARE: 'articulated-new@school.test',
      SUPPLENTE: 'articulated-sub@school.test',
      DAL: '2026-02-01',
      AL: null,
      CLASSI: '1F-LSS',
      MATERIE: 'MAT'
    }
  ];
  const database = new FakeDatabase(tables);
  const resolver = new AldoTeachingAssignmentResolver(database);
  const parent = new ClasseRepository(database).findById(ClasseId.of('1F'))!;

  const assignments = resolver.resolveConsiglio(parent, new Date('2026-02-15'));

  expect(assignments.filter((item) => columnOf(item) === 'MAT')).toHaveLength(2);
  expect(assignments.filter((item) => columnOf(item) === 'INF.itp')).toHaveLength(2);
  expect(assignments.map(columnOf)).toEqual(
    expect.arrayContaining(['LAB.GRUPPO_A', 'LAB.GRUPPO_B'])
  );
  const lsoMain = assignments.find(
    (item) => columnOf(item) === 'MAT' && item.classeId.value === '1F-LSO'
  )!;
  expect(lsoMain.docenteEffettivo.id).toBe('articulated-sub@school.test');
  const lssMain = assignments.find(
    (item) => columnOf(item) === 'MAT' && item.classeId.value === '1F-LSS'
  )!;
  expect(lssMain.titolare.id).toBe('articulated-new@school.test');
});

test('retains each partner owner for wildcard articulated changes and delegations', () => {
  const tables = freshTables();
  const lso = tables.CLASSI!.find((row) => row.ID === '1F-LSO')!;
  const lss = tables.CLASSI!.find((row) => row.ID === '1F-LSS')!;
  lso.MAT = 'main@school.test';
  lss.MAT = 'main@school.test';
  tables.DOCENTI!.push(
    docente('articulated-common-new@school.test'),
    docente('articulated-common-sub@school.test')
  );
  tables.VARIAZIONI_CATTEDRA = [
    {
      TITOLARE: 'main@school.test',
      NUOVO_TITOLARE: 'articulated-common-new@school.test',
      DAL: '2026-01-15',
      CLASSI: '*',
      MATERIE: '*'
    }
  ];
  tables.SUPPLENZE = [
    {
      TITOLARE: 'articulated-common-new@school.test',
      SUPPLENTE: 'articulated-common-sub@school.test',
      DAL: '2026-02-01',
      AL: null,
      CLASSI: '*',
      MATERIE: '*'
    }
  ];
  const database = new FakeDatabase(tables);
  const resolver = new AldoTeachingAssignmentResolver(database);
  const parent = new ClasseRepository(database).findById(ClasseId.of('1F'))!;

  const assignments = resolver.resolveMateria(parent, MateriaId.of('MAT'), new Date('2026-02-15'));

  expect(assignments.map((assignment) => assignment.classeId.value)).toEqual([
    '1F-LSO',
    '1F-LSS'
  ]);
  for (const assignment of assignments) {
    expect(assignment.titolare.id).toBe('articulated-common-new@school.test');
    expect(assignment.docenteEffettivo.id).toBe('articulated-common-sub@school.test');
  }
});
