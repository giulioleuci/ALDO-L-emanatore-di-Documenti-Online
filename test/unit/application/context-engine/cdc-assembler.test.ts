import { CdcAssembler } from '../../../../src/application/context-engine/CdcAssembler';
import { CattedraResolver } from '../../../../src/application/services/CattedraResolver';
import { ClasseRepository } from '../../../../src/infrastructure/repositories/ClasseRepository';
import { MateriaRepository } from '../../../../src/infrastructure/repositories/MateriaRepository';
import { FakeDatabase } from '../../../fakes/FakeDatabase';
import { ClasseId } from '../../../../src/domain/value-objects/ClasseId';
import { GestioneSupplenti } from '../../../../src/domain/value-objects/enums';

function seed() {
  return {
    MATERIE: [{ ID: 'MAT', NOME: 'Matematica' }, { ID: 'FIS', NOME: 'Fisica' }],
    DOCENTI: [
      { EMAIL: 'rossi@s.it', COGNOME: 'ROSSI', NOME: 'M', GENERE: 'M' },
      { EMAIL: 'bianchi@s.it', COGNOME: 'BIANCHI', NOME: 'L', GENERE: 'F' },
      { EMAIL: 'verdi@s.it', COGNOME: 'VERDI', NOME: 'G', GENERE: 'M' }
    ],
    CLASSI: [
      { ID: '5A', ANNO: 5, INDIRIZZO: 'SCI', COORD: 'rossi@s.it', MAT: 'rossi@s.it', FIS: 'rossi@s.it' }
    ],
    VARIAZIONI_CATTEDRA: [],
    SUPPLENZE: [
      {
        TITOLARE: 'rossi@s.it',
        SUPPLENTE: 'verdi@s.it',
        DAL: '2025-11-01',
        AL: '2025-11-30',
        CLASSI: '5A',
        MATERIE: 'MAT'
      }
    ]
  };
}

function assembler(db: FakeDatabase) {
  const classi = new ClasseRepository(db);
  const materie = new MateriaRepository(db);
  return { assembler: new CdcAssembler(classi, materie, new CattedraResolver(db)), classi };
}

test('SOLO_TITOLARI (default) ignores the active supplenza, one row per titolare', () => {
  const db = new FakeDatabase(seed());
  const { assembler: a, classi } = assembler(db);
  const classe = classi.findById(ClasseId.of('5A'))!;
  const vms = a.assembleForClasse(classe, new Date('2025-11-15'));
  expect(vms).toHaveLength(1);
  expect(vms[0]!.anagrafica.email).toBe('rossi@s.it');
  expect(vms[0]!.materie.map((m) => m.sigla).sort()).toEqual(['FIS', 'MAT']);
  expect(vms[0]!.stato).toEqual({ isSupplente: false, sostituisce: null });
});

test('SOLO_SUPPLENTI splits rows: MAT (active supplenza) separate from FIS (none)', () => {
  const db = new FakeDatabase(seed());
  const { assembler: a, classi } = assembler(db);
  const classe = classi.findById(ClasseId.of('5A'))!;
  const vms = a.assembleForClasse(classe, new Date('2025-11-15'), GestioneSupplenti.SOLO_SUPPLENTI);
  expect(vms).toHaveLength(2);
  const matRow = vms.find((v) => v.materie.some((m) => m.sigla === 'MAT'))!;
  const fisRow = vms.find((v) => v.materie.some((m) => m.sigla === 'FIS'))!;
  expect(matRow.anagrafica.email).toBe('verdi@s.it');
  expect(matRow.stato).toEqual({
    isSupplente: true,
    sostituisce: { nome: 'ROSSI M', email: 'rossi@s.it' }
  });
  expect(matRow.materie.map((m) => m.sigla)).toEqual(['MAT']);
  expect(fisRow.anagrafica.email).toBe('rossi@s.it');
  expect(fisRow.stato).toEqual({ isSupplente: false, sostituisce: null });
  expect(fisRow.materie.map((m) => m.sigla)).toEqual(['FIS']);
});

test('ENTRAMBI splits rows too: rossi (FIS, no substitute) vs rossi+sostituisce verdi (MAT)', () => {
  const db = new FakeDatabase(seed());
  const { assembler: a, classi } = assembler(db);
  const classe = classi.findById(ClasseId.of('5A'))!;
  const vms = a.assembleForClasse(classe, new Date('2025-11-15'), GestioneSupplenti.ENTRAMBI);
  expect(vms).toHaveLength(2);
  const matRow = vms.find((v) => v.materie.some((m) => m.sigla === 'MAT'))!;
  const fisRow = vms.find((v) => v.materie.some((m) => m.sigla === 'FIS'))!;
  expect(matRow.anagrafica.email).toBe('rossi@s.it'); // ENTRAMBI keeps titolare identity
  expect(matRow.stato).toEqual({
    isSupplente: false,
    sostituisce: { nome: 'VERDI G', email: 'verdi@s.it' }
  });
  expect(fisRow.anagrafica.email).toBe('rossi@s.it');
  expect(fisRow.stato).toEqual({ isSupplente: false, sostituisce: null });
});

test('a permanent chair change (VARIAZIONI_CATTEDRA) is reflected under SOLO_TITOLARI', () => {
  const tables = seed();
  tables.VARIAZIONI_CATTEDRA = [
    {
      CLASSE_ID: '5A',
      MATERIA_ID: 'MAT',
      VECCHIO_TITOLARE: 'rossi@s.it',
      NUOVO_TITOLARE: 'bianchi@s.it',
      DATA_DECORRENZA: '2025-10-01'
    }
  ];
  const db = new FakeDatabase(tables);
  const { assembler: a, classi } = assembler(db);
  const classe = classi.findById(ClasseId.of('5A'))!;
  const vms = a.assembleForClasse(classe, new Date('2026-01-15'));
  const matRow = vms.find((v) => v.materie.some((m) => m.sigla === 'MAT'))!;
  expect(matRow.anagrafica.email).toBe('bianchi@s.it');
});
