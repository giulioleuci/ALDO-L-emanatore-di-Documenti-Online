import { CattedraResolver } from '../../../src/application/services/CattedraResolver';
import { ClasseRepository } from '../../../src/infrastructure/repositories/ClasseRepository';
import { FakeDatabase } from '../../../test/fakes/FakeDatabase';
import { ClasseId } from '../../../src/domain/value-objects/ClasseId';
import { MateriaId } from '../../../src/domain/value-objects/MateriaId';
import {
  VariazioneCattedraTitolareNonTrovatoError,
  AmbiguousVariazioneCattedraError,
  VariazioneCattedraInconsistenteError
} from '../../../src/domain/errors/DomainError';
import { fixtureTables } from '../../fixtures/tables';

function seed() {
  return {
    MATERIE: [{ ID: 'MAT' }, { ID: 'FIS' }],
    DOCENTI: [
      { EMAIL: 'rossi@s.it', COGNOME: 'ROSSI', NOME: 'M', GENERE: 'M' },
      { EMAIL: 'bianchi@s.it', COGNOME: 'BIANCHI', NOME: 'L', GENERE: 'F' },
      { EMAIL: 'verdi@s.it', COGNOME: 'VERDI', NOME: 'G', GENERE: 'M' }
    ],
    CLASSI: [{ ID: '5A', ANNO: 5, INDIRIZZO: 'SCI', MAT: 'rossi@s.it', FIS: 'bianchi@s.it' }],
    VARIAZIONI_CATTEDRA: [
      {
        CLASSE_ID: '5A',
        MATERIA_ID: 'MAT',
        VECCHIO_TITOLARE: 'rossi@s.it',
        NUOVO_TITOLARE: 'bianchi@s.it',
        DATA_DECORRENZA: '2025-10-01'
      }
    ],
    SUPPLENZE: [
      {
        TITOLARE: 'bianchi@s.it',
        SUPPLENTE: 'verdi@s.it',
        DAL: '2025-11-01',
        AL: '2025-11-30',
        CLASSI: '5A',
        MATERIE: '*'
      }
    ]
  };
}

function ctx() {
  const db = new FakeDatabase(seed());
  const classe = new ClasseRepository(db).findById(ClasseId.of('5A'))!;
  return { resolver: new CattedraResolver(db), classe };
}
const MAT = MateriaId.of('MAT');
const FIS = MateriaId.of('FIS');

test('Priority 3 — nominal CLASSI holder when nothing overrides', () => {
  const { resolver, classe } = ctx();
  expect(resolver.resolveTitolare(classe, MAT, new Date('2025-09-15'))!.id).toBe('rossi@s.it');
});

test('Priority 2 — variazione in force replaces the nominal holder', () => {
  const { resolver, classe } = ctx();
  // 2025-10-15: DATA_DECORRENZA (10-01) reached, no active supplenza yet.
  expect(resolver.resolveTitolare(classe, MAT, new Date('2025-10-15'))!.id).toBe('bianchi@s.it');
});

test('Priority 1 — active supplenza overrides everything (over a variazione holder)', () => {
  const { resolver, classe } = ctx();
  // 2025-11-15: base holder is bianchi (variazione), who is on supply by verdi.
  expect(resolver.resolveTitolare(classe, MAT, new Date('2025-11-15'))!.id).toBe('verdi@s.it');
});

test('Priority 1 via wildcard materie applies to a different subject', () => {
  const { resolver, classe } = ctx();
  // FIS nominal holder bianchi (no variazione) → supplenza MATERIE '*' → verdi.
  expect(resolver.resolveTitolari(classe, FIS, new Date('2025-11-15')).map((d) => d.id)).toEqual([
    'verdi@s.it'
  ]);
  // before the supply period, the nominal holder stands.
  expect(resolver.resolveTitolare(classe, FIS, new Date('2025-10-15'))!.id).toBe('bianchi@s.it');
});

test('a variazione pointing at a non-existent docente throws, never falls back to CLASSI', () => {
  const db = new FakeDatabase({
    MATERIE: [{ ID: 'MAT' }],
    DOCENTI: [{ EMAIL: 'rossi@s.it', COGNOME: 'ROSSI', NOME: 'M', GENERE: 'M' }],
    CLASSI: [{ ID: '5A', ANNO: 5, INDIRIZZO: 'SCI', MAT: 'rossi@s.it' }],
    VARIAZIONI_CATTEDRA: [
      {
        CLASSE_ID: '5A',
        MATERIA_ID: 'MAT',
        VECCHIO_TITOLARE: 'rossi@s.it',
        NUOVO_TITOLARE: 'ghost@s.it',
        DATA_DECORRENZA: '2025-10-01'
      }
    ]
  });
  const classe = new ClasseRepository(db).findById(ClasseId.of('5A'))!;
  const resolver = new CattedraResolver(db);

  expect(() => resolver.resolveTitolari(classe, MAT, new Date('2025-10-15'))).toThrow(
    VariazioneCattedraTitolareNonTrovatoError
  );
});

test('two variazioni tied on the same latest DATA_DECORRENZA throw ambiguous', () => {
  const db = new FakeDatabase({
    MATERIE: [{ ID: 'MAT' }],
    DOCENTI: [
      { EMAIL: 'rossi@s.it', COGNOME: 'ROSSI', NOME: 'M', GENERE: 'M' },
      { EMAIL: 'bianchi@s.it', COGNOME: 'BIANCHI', NOME: 'L', GENERE: 'F' },
      { EMAIL: 'verdi@s.it', COGNOME: 'VERDI', NOME: 'G', GENERE: 'M' }
    ],
    CLASSI: [{ ID: '5A', ANNO: 5, INDIRIZZO: 'SCI', MAT: 'rossi@s.it' }],
    VARIAZIONI_CATTEDRA: [
      {
        CLASSE_ID: '5A',
        MATERIA_ID: 'MAT',
        VECCHIO_TITOLARE: 'rossi@s.it',
        NUOVO_TITOLARE: 'bianchi@s.it',
        DATA_DECORRENZA: '2025-10-01'
      },
      {
        CLASSE_ID: '5A',
        MATERIA_ID: 'MAT',
        VECCHIO_TITOLARE: 'rossi@s.it',
        NUOVO_TITOLARE: 'verdi@s.it',
        DATA_DECORRENZA: '2025-10-01'
      }
    ]
  });
  const classe = new ClasseRepository(db).findById(ClasseId.of('5A'))!;
  const resolver = new CattedraResolver(db);

  expect(() => resolver.resolveTitolare(classe, MAT, new Date('2025-11-01'))).toThrow(
    AmbiguousVariazioneCattedraError
  );
});

test('two variazioni with different DATA_DECORRENZA: the latest wins', () => {
  const db = new FakeDatabase({
    MATERIE: [{ ID: 'MAT' }],
    DOCENTI: [
      { EMAIL: 'rossi@s.it', COGNOME: 'ROSSI', NOME: 'M', GENERE: 'M' },
      { EMAIL: 'bianchi@s.it', COGNOME: 'BIANCHI', NOME: 'L', GENERE: 'F' },
      { EMAIL: 'verdi@s.it', COGNOME: 'VERDI', NOME: 'G', GENERE: 'M' }
    ],
    CLASSI: [{ ID: '5A', ANNO: 5, INDIRIZZO: 'SCI', MAT: 'rossi@s.it' }],
    VARIAZIONI_CATTEDRA: [
      {
        CLASSE_ID: '5A',
        MATERIA_ID: 'MAT',
        VECCHIO_TITOLARE: 'rossi@s.it',
        NUOVO_TITOLARE: 'bianchi@s.it',
        DATA_DECORRENZA: '2025-09-01'
      },
      {
        CLASSE_ID: '5A',
        MATERIA_ID: 'MAT',
        VECCHIO_TITOLARE: 'rossi@s.it',
        NUOVO_TITOLARE: 'verdi@s.it',
        DATA_DECORRENZA: '2025-10-01'
      }
    ]
  });
  const classe = new ClasseRepository(db).findById(ClasseId.of('5A'))!;
  const resolver = new CattedraResolver(db);

  // Both rows are decorsa and scope-matching, but both claim VECCHIO_TITOLARE
  // rossi@s.it -- only one can be "the" transition FROM the nominal holder;
  // the later DATA_DECORRENZA (verdi) is the current state of the world.
  expect(resolver.resolveTitolare(classe, MAT, new Date('2025-11-01'))!.id).toBe('verdi@s.it');
});

test('a variazione whose VECCHIO_TITOLARE matches nobody in this class+subject throws inconsistente', () => {
  const db = new FakeDatabase({
    MATERIE: [{ ID: 'MAT' }],
    DOCENTI: [
      { EMAIL: 'rossi@s.it', COGNOME: 'ROSSI', NOME: 'M', GENERE: 'M' },
      { EMAIL: 'bianchi@s.it', COGNOME: 'BIANCHI', NOME: 'L', GENERE: 'F' }
    ],
    // Nominal MAT holder is bianchi, not rossi.
    CLASSI: [{ ID: '5A', ANNO: 5, INDIRIZZO: 'SCI', MAT: 'bianchi@s.it' }],
    VARIAZIONI_CATTEDRA: [
      {
        CLASSE_ID: '5A',
        MATERIA_ID: 'MAT',
        VECCHIO_TITOLARE: 'rossi@s.it',
        NUOVO_TITOLARE: 'bianchi@s.it',
        DATA_DECORRENZA: '2025-10-01'
      }
    ]
  });
  const classe = new ClasseRepository(db).findById(ClasseId.of('5A'))!;
  const resolver = new CattedraResolver(db);

  expect(() => resolver.resolveTitolare(classe, MAT, new Date('2025-11-01'))).toThrow(
    VariazioneCattedraInconsistenteError
  );
});

test('resolveConsiglio includes both main and itp holders, tagged, main-slot variazione does not affect the itp slot', () => {
  const db = new FakeDatabase({
    MATERIE: [{ ID: 'MAT' }],
    DOCENTI: [
      { EMAIL: 'rossi@s.it', COGNOME: 'ROSSI', NOME: 'M', GENERE: 'M' },
      { EMAIL: 'bianchi@s.it', COGNOME: 'BIANCHI', NOME: 'L', GENERE: 'F' },
      { EMAIL: 'verdi@s.it', COGNOME: 'VERDI', NOME: 'G', GENERE: 'M', ITP: true }
    ],
    CLASSI: [{ ID: '5A', ANNO: 5, INDIRIZZO: 'SCI', MAT: 'rossi@s.it', 'MAT.itp': 'verdi@s.it' }],
    VARIAZIONI_CATTEDRA: [
      {
        CLASSE_ID: '5A',
        MATERIA_ID: 'MAT',
        VECCHIO_TITOLARE: 'rossi@s.it',
        NUOVO_TITOLARE: 'bianchi@s.it',
        DATA_DECORRENZA: '2025-10-01'
      }
    ]
  });
  const classe = new ClasseRepository(db).findById(ClasseId.of('5A'))!;
  const resolver = new CattedraResolver(db);

  const result = resolver.resolveConsiglio(classe, new Date('2025-11-01'));
  expect(result).toHaveLength(2);
  const main = result.find((a) => !a.isItp)!;
  const itp = result.find((a) => a.isItp)!;
  expect(main.titolare.id).toBe('bianchi@s.it'); // main-slot variazione applied
  expect(itp.titolare.id).toBe('verdi@s.it'); // itp slot untouched, variazione was for the main slot
});

test('resolvePermanenti ignores an active supplenza (SOLO_TITOLARI semantics)', () => {
  const db = new FakeDatabase(seed());
  const classe = new ClasseRepository(db).findById(ClasseId.of('5A'))!;
  const resolver = new CattedraResolver(db);
  // 2025-11-15: bianchi (variazione) has an active supplente verdi.
  expect(
    resolver.resolvePermanenti(classe, MAT, new Date('2025-11-15')).map((d) => d.id)
  ).toEqual(['bianchi@s.it']);
});

test('resolveCattedra pairs the permanent holder with the active supplente, or null', () => {
  const db = new FakeDatabase(seed());
  const classe = new ClasseRepository(db).findById(ClasseId.of('5A'))!;
  const resolver = new CattedraResolver(db);
  const withSupplente = resolver.resolveCattedra(classe, MAT, new Date('2025-11-15'));
  expect(withSupplente).toHaveLength(1);
  expect(withSupplente[0]!.titolare.id).toBe('bianchi@s.it');
  expect(withSupplente[0]!.supplente!.id).toBe('verdi@s.it');

  const withoutSupplente = resolver.resolveCattedra(classe, MAT, new Date('2025-10-15'));
  expect(withoutSupplente[0]!.titolare.id).toBe('bianchi@s.it');
  expect(withoutSupplente[0]!.supplente).toBeNull();
});

test('resolveConsiglio excludes IS_RELIGIONE_ALT materie by default, includes them when asked', () => {
  const db = new FakeDatabase({
    MATERIE: [
      { ID: 'MAT' },
      { ID: 'IRC', IS_RELIGIONE_ALT: true }
    ],
    DOCENTI: [
      { EMAIL: 'rossi@s.it', COGNOME: 'ROSSI', NOME: 'M', GENERE: 'M' },
      { EMAIL: 'bianchi@s.it', COGNOME: 'BIANCHI', NOME: 'L', GENERE: 'F' }
    ],
    CLASSI: [{ ID: '5A', ANNO: 5, INDIRIZZO: 'SCI', MAT: 'rossi@s.it', IRC: 'bianchi@s.it' }]
  });
  const classe = new ClasseRepository(db).findById(ClasseId.of('5A'))!;
  const resolver = new CattedraResolver(db);

  const defaultResult = resolver.resolveConsiglio(classe, new Date('2025-09-15'));
  expect(defaultResult.map((a) => a.materia.value)).toEqual(['MAT']);

  const withReligione = resolver.resolveConsiglio(classe, new Date('2025-09-15'), {
    includeReligioneAlt: true
  });
  expect(withReligione.map((a) => a.materia.value).sort()).toEqual(['IRC', 'MAT']);
});

test('resolveCattedra partner-routes an articulated PARENT class for a split subject, never resolving against the parent itself', () => {
  const db = new FakeDatabase(fixtureTables());
  const classe = new ClasseRepository(db).findById(ClasseId.of('1F'))!; // the articulated parent
  const resolver = new CattedraResolver(db);

  // FISI is split: 1F-LSO=bianchi, 1F-LSS=verdi. The parent '1F' itself has no
  // FISI column at all. Before this fix, resolving directly against the parent
  // returned []; now it merges both partners' holders.
  const fisi = resolver.resolveCattedra(classe, MateriaId.of('FISI'), new Date('2026-01-15'));
  expect(fisi.map((a) => a.titolare.id).sort()).toEqual(['bianchi@school.it', 'verdi@school.it']);

  // MATE is shared (COMUNE): both partners nominally hold rossi -> one merged entry, not two.
  const mate = resolver.resolveCattedra(classe, MateriaId.of('MATE'), new Date('2026-01-15'));
  expect(mate.map((a) => a.titolare.id)).toEqual(['rossi@school.it']);
});

test('resolveCattedra falls back to direct resolution for a non-articulated class', () => {
  const db = new FakeDatabase(fixtureTables());
  const classe = new ClasseRepository(db).findById(ClasseId.of('5A'))!;
  const resolver = new CattedraResolver(db);
  // 5A is not articulated -- unchanged behavior, same as before this task.
  expect(
    resolver.resolveCattedra(classe, MateriaId.of('MATE'), new Date('2026-01-15')).map((a) => a.titolare.id)
  ).toEqual(['bianchi@school.it']);
});
