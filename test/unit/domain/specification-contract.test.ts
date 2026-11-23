import { Alunno } from '../../../src/domain/entities/Alunno';
import { Carenza } from '../../../src/domain/entities/Carenza';
import { Classe } from '../../../src/domain/entities/Classe';
import { Docente } from '../../../src/domain/entities/Docente';
import { MovimentoAlunno } from '../../../src/domain/entities/MovimentoAlunno';
import { OreASL } from '../../../src/domain/entities/OreASL';
import { Piano } from '../../../src/domain/entities/Piano';
import { Progetto } from '../../../src/domain/entities/Progetto';
import { VariazioneCattedra } from '../../../src/domain/entities/VariazioneCattedra';
import { AlunniAttiviSpec } from '../../../src/domain/specifications/AlunniAttiviSpec';
import { AlunniInClasseSpec } from '../../../src/domain/specifications/AlunnoSpecs';
import {
  CarenzePerAlunnoSpec,
  CarenzePerClasseSpec
} from '../../../src/domain/specifications/CarenzaSpecs';
import { ClassiAttiveSpec } from '../../../src/domain/specifications/ClasseSpecs';
import { DocentiPerDipartimentoSpec } from '../../../src/domain/specifications/DocenteSpecs';
import { MovimentiPerAlunnoSpec } from '../../../src/domain/specifications/MovimentoAlunnoSpecs';
import { OreASLPerAlunnoSpec } from '../../../src/domain/specifications/OreASLSpecs';
import { PianiPerAlunnoSpec } from '../../../src/domain/specifications/PianoSpecs';
import { ProgettiPerClasseSpec } from '../../../src/domain/specifications/ProgettoSpecs';
import { VariazioniPerTitolareSpec } from '../../../src/domain/specifications/VariazioneCattedraSpecs';
import { ClasseId } from '../../../src/domain/value-objects/ClasseId';
import { DipartimentoId } from '../../../src/domain/value-objects/DipartimentoId';
import { Email } from '../../../src/domain/value-objects/Email';

type Row = Record<string, unknown>;
type PushdownCase = [string, Specification<unknown>, Row[], (row: Row) => unknown];

export function assertSpecificationContractTypecheck(): void {
  const specWithoutQueryObject: QueryableSpecification<unknown> = {
    isSatisfiedBy: () => true
  };
  // @ts-expect-error The runtime guard calls toQueryObject unconditionally.
  assertSpecificationContract(specWithoutQueryObject, [], (row) => row);
}

const hydrateAlunno = (row: Row) => Alunno.fromData(row);
const hydrateCarenza = (row: Row) => Carenza.fromData(row);
const hydrateMovimento = (row: Row) => MovimentoAlunno.fromData(row);
const hydrateOreASL = (row: Row) => OreASL.fromData(row);
const hydratePiano = (row: Row) => Piano.fromData(row);
const hydrateProgetto = (row: Row) => Progetto.fromData(row);
const hydrateVariazione = (row: Row) => VariazioneCattedra.fromData(row);

const SPEC_PUSHDOWN: PushdownCase[] = [
  [
    'AlunniAttiviSpec',
    new AlunniAttiviSpec(),
    [{ ATTIVO: true }, { ATTIVO: false }, { ATTIVO: 'true' }, {}],
    hydrateAlunno
  ],
  [
    'AlunniInClasseSpec',
    new AlunniInClasseSpec(ClasseId.of('3A')),
    [{ CLASSE: '3A' }, { CLASSE: '3B' }, { CLASSE: 3 }],
    hydrateAlunno
  ],
  [
    'CarenzePerAlunnoSpec',
    new CarenzePerAlunnoSpec(Email.of('a@x.it')),
    [{ STUDENTE: 'a@x.it' }, { STUDENTE: 'b@x.it' }, { STUDENTE: 1 }],
    hydrateCarenza
  ],
  [
    'CarenzePerClasseSpec',
    new CarenzePerClasseSpec(ClasseId.of('3A')),
    [{ CLASSE: '3A' }, { CLASSE: '3B' }, { CLASSE: 3 }],
    hydrateCarenza
  ],
  [
    'ClassiAttiveSpec',
    new ClassiAttiveSpec(),
    [
      { ID: '3A', ANNO: 3, INDIRIZZO: 'LICEO', ATTIVA: true },
      { ID: '3B', ANNO: 3, INDIRIZZO: 'LICEO', ATTIVA: false },
      { ID: '3C', ANNO: '3', INDIRIZZO: 'LICEO' },
      { ID: '3D', ANNO: 3, INDIRIZZO: 'LICEO', ATTIVA: 'true' }
    ],
    (row) => {
      const classe = Classe.fromData(row);
      classe.setDynamicColumn('ATTIVA', row.ATTIVA);
      return classe;
    }
  ],
  [
    'MovimentiPerAlunnoSpec',
    new MovimentiPerAlunnoSpec(Email.of('a@x.it')),
    [{ STUDENTE: 'a@x.it' }, { STUDENTE: 'b@x.it' }, { STUDENTE: 1 }],
    hydrateMovimento
  ],
  [
    'OreASLPerAlunnoSpec',
    new OreASLPerAlunnoSpec(Email.of('a@x.it')),
    [{ STUDENTE: 'a@x.it' }, { STUDENTE: 'b@x.it' }, { STUDENTE: 1 }],
    hydrateOreASL
  ],
  [
    'PianiPerAlunnoSpec',
    new PianiPerAlunnoSpec(Email.of('a@x.it')),
    [{ STUDENTE: 'a@x.it' }, { STUDENTE: 'b@x.it' }, { STUDENTE: 1 }],
    hydratePiano
  ],
  [
    'ProgettiPerClasseSpec',
    new ProgettiPerClasseSpec(ClasseId.of('3A')),
    [{ CLASSE: '3A' }, { CLASSE: '3B' }, { CLASSE: 3 }],
    hydrateProgetto
  ],
  [
    'VariazioniPerTitolareSpec',
    new VariazioniPerTitolareSpec(Email.of('a@x.it')),
    [{ TITOLARE: 'a@x.it' }, { TITOLARE: 'b@x.it' }],
    hydrateVariazione
  ]
];

it.each(SPEC_PUSHDOWN)('%s: pushdown e in-memory concordano', (_name, spec, rows, hydrate) => {
  const criteria = spec.toQueryObject();
  expect(criteria).not.toBeNull();

  const queryMatches = rows.map((row) =>
    Object.entries(criteria!).every(([column, value]) => row[column] === value)
  );
  expect(queryMatches).toContain(true);
  expect(queryMatches).toContain(false);
  expect(assertSpecificationContract(spec, rows, hydrate).divergenti).toEqual([]);
});

test('DocentiPerDipartimentoSpec resta in memoria per preservare la normalizzazione del VO', () => {
  const spec = new DocentiPerDipartimentoSpec(DipartimentoId.of('LETTERE'));

  expect(spec.toQueryObject()).toBeNull();
  expect(spec.isSatisfiedBy(Docente.fromData({ DIPART: 'LETTERE' }))).toBe(true);
  expect(spec.isSatisfiedBy(Docente.fromData({ DIPART: ' LETTERE ' }))).toBe(true);
  expect(spec.isSatisfiedBy(Docente.fromData({ DIPART: 'SCIENZE' }))).toBe(false);
});
