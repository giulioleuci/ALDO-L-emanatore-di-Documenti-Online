import { CattedraResolver } from '../../../src/application/services/CattedraResolver';
import { ClasseRepository } from '../../../src/infrastructure/repositories/ClasseRepository';
import { FakeDatabase } from '../../../test/fakes/FakeDatabase';
import { ClasseId } from '../../../src/domain/value-objects/ClasseId';
import { MateriaId } from '../../../src/domain/value-objects/MateriaId';

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
      { CLASSE_ID: '5A', MATERIA_ID: 'MAT', VECCHIO_TITOLARE: 'rossi@s.it', NUOVO_TITOLARE: 'bianchi@s.it', DATA_DECORRENZA: '2025-10-01' }
    ],
    SUPPLENZE: [
      { TITOLARE: 'bianchi@s.it', SUPPLENTE: 'verdi@s.it', DAL: '2025-11-01', AL: '2025-11-30', CLASSI: '5A', MATERIE: '*' }
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
  expect(resolver.resolveTitolari(classe, FIS, new Date('2025-11-15')).map((d) => d.id)).toEqual(['verdi@s.it']);
  // before the supply period, the nominal holder stands.
  expect(resolver.resolveTitolare(classe, FIS, new Date('2025-10-15'))!.id).toBe('bianchi@s.it');
});
