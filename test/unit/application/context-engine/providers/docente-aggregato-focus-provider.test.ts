import { DocenteAggregatoFocusProvider } from '../../../../../src/application/context-engine/providers/DocenteAggregatoFocusProvider';
import type { Cdu } from '../../../../../src/application/context-engine/Cdu';
import type { BuildParams } from '../../../../../src/application/context-engine/Recipe';
import { ClasseRepository } from '../../../../../src/infrastructure/repositories/ClasseRepository';
import { MateriaRepository } from '../../../../../src/infrastructure/repositories/MateriaRepository';
import { AldoTeachingAssignmentResolver } from '../../../../../src/infrastructure/role-resolution/AldoTeachingAssignmentResolver';
import type {
  ITeachingAssignmentResolver,
  TeachingAssignment
} from '../../../../../src/application/ports/ITeachingAssignmentResolver';
import { Docente } from '../../../../../src/domain/entities/Docente';
import { MateriaId } from '../../../../../src/domain/value-objects/MateriaId';
import { PipelineError } from '../../../../../src/domain/errors/DomainError';
import { FakeDatabase } from '../../../../fakes/FakeDatabase';
import { fixtureTables } from '../../../../fixtures/tables';

function emptyCdu(): Cdu {
  return { meta: { parametriInput: {} } as never, focus: {}, tech: {} as never };
}

function makeProvider(
  tables = fixtureTables(),
  assignments?: TeachingAssignment[]
): DocenteAggregatoFocusProvider {
  const db = new FakeDatabase(tables);
  const classi = new ClasseRepository(db);
  const materie = new MateriaRepository(db);
  const teachingAssignments =
    assignments === undefined
      ? new AldoTeachingAssignmentResolver(db)
      : ({ resolveConsiglio: () => assignments } as unknown as ITeachingAssignmentResolver);
  return new DocenteAggregatoFocusProvider(classi, materie, teachingAssignments);
}

describe('DocenteAggregatoFocusProvider', () => {
  it('aggregates cattedre across every class in params.classiCompetenza for the target docente', () => {
    // fixtureTables(): bianchi@school.it is the effective MATE holder in 5A
    // (VARIAZIONI_CATTEDRA decorsa 2025-10-01) as well as 5A's nominal FISI
    // and IRC holder, and the nominal FISI holder of 1F-LSO (one of '1F's
    // articulated partners) — so classiCompetenza ['5A', '1F'] gives bianchi
    // one cattedra per class, 5A carrying three materie and 1F carrying one.
    const provider = makeProvider();
    const cdu = emptyCdu();
    const params = {
      docenteCorrente: 'bianchi@school.it',
      classiCompetenza: ['5A', '1F'],
      now: new Date('2026-07-01T09:00:00Z')
    } as BuildParams;

    provider.provide(cdu, params);

    const docente = cdu.focus.docente!;
    const cattedre = docente.cattedre!;
    expect(docente.email).toBe('bianchi@school.it');
    expect(cattedre).toHaveLength(2);
    const cattedra5A = cattedre.find((c) => c.classeNome === '5A')!;
    const cattedra1F = cattedre.find((c) => c.classeNome === '1F')!;
    expect(cattedra5A.materie.map((m) => m.sigla).sort()).toEqual(['FISI', 'IRC', 'MATE']);
    expect(cattedra1F.materie.map((m) => m.sigla)).toEqual(['FISI']);
  });

  it('throws PipelineError when the docente has no assignment in any listed class', () => {
    const provider = makeProvider();
    const cdu = emptyCdu();
    const params = {
      docenteCorrente: 'nessuno@school.it',
      classiCompetenza: ['5A', '1F'],
      now: new Date('2026-07-01T09:00:00Z')
    } as BuildParams;

    expect(() => provider.provide(cdu, params)).toThrow(PipelineError);
  });

  it('dedupes repeated subject slots with MAIN taking precedence over ITP', () => {
    const docente = new Docente({
      EMAIL: 'bianchi@school.it',
      COGNOME: 'BIANCHI',
      NOME: 'LUCIA',
      GENERE: 'F'
    });
    const assignment = (kind: 'MAIN' | 'ITP') =>
      ({
        slot: { materia: MateriaId.of('MATE'), kind, specifica: null },
        docenteEffettivo: docente
      }) as unknown as TeachingAssignment;
    const provider = makeProvider(fixtureTables(), [assignment('ITP'), assignment('MAIN')]);
    const cdu = emptyCdu();

    provider.provide(cdu, {
      docenteCorrente: 'bianchi@school.it',
      classiCompetenza: ['5A'],
      now: new Date('2026-07-01T09:00:00Z')
    } as BuildParams);

    expect(cdu.focus.docente?.cattedre?.[0]?.materie).toEqual([
      expect.objectContaining({ sigla: 'MATE', isITP: false })
    ]);
  });
});
