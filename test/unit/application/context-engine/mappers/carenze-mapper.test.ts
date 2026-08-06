import {
  carenzeDettaglioSemplice,
  curriculumArray
} from '../../../../../src/application/context-engine/mappers/carenzeMapper';
import { Carenza } from '../../../../../src/domain/entities/Carenza';
import { Alunno } from '../../../../../src/domain/entities/Alunno';
import { Materia } from '../../../../../src/domain/entities/Materia';
import { COL_ALUNNI, COL_MATERIE } from '../../../../../src/config/schema';

describe('carenzeDettaglioSemplice', () => {
  test('emits one entry per non-empty subject cell', () => {
    const carenza = new Carenza({ STUDENTE: 'a1@school.it', PROGRESSIVO: 1, MATE: 5, FISI: '' });
    const out = carenzeDettaglioSemplice([carenza], ['MATE', 'FISI']);
    expect(out).toEqual([{ materia: 'MATE', voto: '5' }]);
  });

  test('skips empty-string and whitespace-only cells', () => {
    const carenza = new Carenza({ STUDENTE: 'a1@school.it', PROGRESSIVO: 1, MATE: '   ', FISI: 'NC' });
    const out = carenzeDettaglioSemplice([carenza], ['MATE', 'FISI']);
    expect(out).toEqual([{ materia: 'FISI', voto: 'NC' }]);
  });

  test('skips cells that are not string/number/boolean (object, undefined, null)', () => {
    const carenza = new Carenza({
      STUDENTE: 'a1@school.it',
      PROGRESSIVO: 1,
      MATE: { nested: true },
      FISI: undefined,
      STOR: null
    });
    const out = carenzeDettaglioSemplice([carenza], ['MATE', 'FISI', 'STOR']);
    expect(out).toEqual([]);
  });

  test('includes boolean cells stringified', () => {
    const carenza = new Carenza({ STUDENTE: 'a1@school.it', PROGRESSIVO: 1, MATE: true });
    const out = carenzeDettaglioSemplice([carenza], ['MATE']);
    expect(out).toEqual([{ materia: 'MATE', voto: 'true' }]);
  });

  test('flattens across multiple carenza rows preserving order', () => {
    const c1 = new Carenza({ STUDENTE: 'a1@school.it', PROGRESSIVO: 1, MATE: 4 });
    const c2 = new Carenza({ STUDENTE: 'a1@school.it', PROGRESSIVO: 2, MATE: 6 });
    const out = carenzeDettaglioSemplice([c1, c2], ['MATE']);
    expect(out).toEqual([
      { materia: 'MATE', voto: '4' },
      { materia: 'MATE', voto: '6' }
    ]);
  });

  test('empty carenze array and empty sigle both yield []', () => {
    expect(carenzeDettaglioSemplice([], ['MATE'])).toEqual([]);
    const carenza = new Carenza({ STUDENTE: 'a1@school.it', PROGRESSIVO: 1, MATE: 5 });
    expect(carenzeDettaglioSemplice([carenza], [])).toEqual([]);
  });
});

describe('curriculumArray', () => {
  test('converts the CURRICULUM map into an array of CurriculumVM, resolving materiaSigla/materiaNome', () => {
    const alunno = Alunno.fromData({
      [COL_ALUNNI.EMAIL]: 'a1@school.it',
      [COL_ALUNNI.CURRICULUM]: JSON.stringify({ INTERPRET: ['chitarra', 'flauto'] })
    });
    const materie = {
      findByIdCached: (id: { value: string }) =>
        id.value === 'INTERPRET'
          ? Materia.fromData({
              [COL_MATERIE.ID]: 'INTERPRET',
              [COL_MATERIE.NOME]: 'Esecuzione ed interpretazione'
            })
          : null
    };
    const result = curriculumArray(alunno, materie as never);
    expect(result).toEqual([
      {
        materiaId: 'INTERPRET',
        materiaSigla: 'INTERPRET',
        materiaNome: 'Esecuzione ed interpretazione',
        specifiche: [{ nome: 'chitarra' }, { nome: 'flauto' }]
      }
    ]);
  });

  test('falls back to the raw sigla for materiaSigla/materiaNome when the materia is unknown', () => {
    const alunno = Alunno.fromData({
      [COL_ALUNNI.EMAIL]: 'a1@school.it',
      [COL_ALUNNI.CURRICULUM]: JSON.stringify({ MATE: ['AVANZATO'] })
    });
    const result = curriculumArray(alunno, { findByIdCached: () => null } as never);
    expect(result).toEqual([
      { materiaId: 'MATE', materiaSigla: 'MATE', materiaNome: 'MATE', specifiche: [{ nome: 'AVANZATO' }] }
    ]);
  });

  test('returns an empty array when CURRICULUM is absent', () => {
    const alunno = Alunno.fromData({ [COL_ALUNNI.EMAIL]: 'a1@school.it' });
    expect(curriculumArray(alunno, { findByIdCached: () => null } as never)).toEqual([]);
  });
});
