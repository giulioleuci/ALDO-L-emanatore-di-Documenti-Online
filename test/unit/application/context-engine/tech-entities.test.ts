import {
  setClasseEntity,
  getClasseEntity,
  setAlunnoEntity,
  getAlunnoEntity
} from '../../../../src/application/context-engine/techEntities';
import type { Cdu } from '../../../../src/application/context-engine/Cdu';
import { Classe } from '../../../../src/domain/entities/Classe';
import { Alunno } from '../../../../src/domain/entities/Alunno';
import { ClasseId } from '../../../../src/domain/value-objects/ClasseId';
import { AnnoCorso } from '../../../../src/domain/value-objects/AnnoCorso';
import { EntityNotFoundError } from '../../../../src/domain/errors/DomainError';
import { COL_ALUNNI } from '../../../../src/config/schema';

function emptyCdu(): Cdu {
  return { tech: { entita: {}, servizi: [], pipeline: { statoCorrente: '', stepEseguiti: [], errori: [], logEsecuzione: [] } } } as unknown as Cdu;
}

describe('techEntities: classe entity slot', () => {
  test('getClasseEntity throws EntityNotFoundError when never set', () => {
    const cdu = emptyCdu();
    expect(() => getClasseEntity(cdu)).toThrow(EntityNotFoundError);
  });

  test('setClasseEntity then getClasseEntity round-trips the same instance', () => {
    const cdu = emptyCdu();
    const classe = Classe.create(ClasseId.of('5A'), AnnoCorso.of(5), 'SCIENTIFICO');
    setClasseEntity(cdu, classe);
    expect(getClasseEntity(cdu)).toBe(classe);
  });

  test('cdu.tech.entita.classe carries the raw entity (not serialized)', () => {
    const cdu = emptyCdu();
    const classe = Classe.create(ClasseId.of('1F'), AnnoCorso.of(1), 'LICEO');
    setClasseEntity(cdu, classe);
    expect(cdu.tech.entita.classe).toBe(classe);
  });
});

describe('techEntities: alunno entity slot', () => {
  test('getAlunnoEntity throws EntityNotFoundError when never set', () => {
    const cdu = emptyCdu();
    expect(() => getAlunnoEntity(cdu)).toThrow(EntityNotFoundError);
  });

  test('setAlunnoEntity then getAlunnoEntity round-trips the same instance', () => {
    const cdu = emptyCdu();
    const alunno = new Alunno({ [COL_ALUNNI.EMAIL]: 'a1@school.it', [COL_ALUNNI.COGNOMENOME]: 'VERDI ANNA' });
    setAlunnoEntity(cdu, alunno);
    expect(getAlunnoEntity(cdu)).toBe(alunno);
  });

  test('classe and alunno slots are independent', () => {
    const cdu = emptyCdu();
    const classe = Classe.create(ClasseId.of('5A'), AnnoCorso.of(5), 'SCIENTIFICO');
    const alunno = new Alunno({ [COL_ALUNNI.EMAIL]: 'a1@school.it' });
    setClasseEntity(cdu, classe);
    expect(() => getAlunnoEntity(cdu)).toThrow(EntityNotFoundError);
    setAlunnoEntity(cdu, alunno);
    expect(getClasseEntity(cdu)).toBe(classe);
    expect(getAlunnoEntity(cdu)).toBe(alunno);
  });
});
