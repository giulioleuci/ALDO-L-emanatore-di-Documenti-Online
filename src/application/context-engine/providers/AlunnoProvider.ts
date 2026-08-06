import type { ContextProvider } from '../ContextProvider';
import type { Cdu, CduAlunno } from '../Cdu';
import type { BuildParams, RecipeOptions } from '../Recipe';
import type { IAlunnoRepository } from '../../../domain/repositories/IAlunnoRepository';
import type { IClasseRepository } from '../../../domain/repositories/IClasseRepository';
import type { IOreASLRepository } from '../../../domain/repositories/IOreASLRepository';
import type { IMateriaRepository } from '../../../domain/repositories/IMateriaRepository';
import type { Alunno } from '../../../domain/entities/Alunno';
import type { ITeachingAssignmentResolver } from '../../ports/ITeachingAssignmentResolver';
import {
  createTeachingCouncilProjection,
  prepareStudentCouncilAssignments,
  resolveCouncilForProjection
} from '../TeachingCouncilProjection';
import { AnnoScolastico } from '../../../domain/value-objects/AnnoScolastico';
import { setAlunnoEntity } from '../techEntities';
import { curriculumArray } from '../mappers/carenzeMapper';
import { religioneLabel } from '../mappers/labels';
import { EntityNotFoundError } from '../../../domain/errors/DomainError';

/**
 * Populates `focus.alunno` anagrafica/status/curriculum/classe and the didattica
 * skeleton incl. ASL hours (09 §4). `status.isBes` is initialised to false as a
 * placeholder — PianiProvider (which reads PIANI, later in the recipe) flips it
 * to true when the student has a BES plan. Carenze and piani sub-sections are
 * filled by their own providers. Stashes the live Alunno entity in tech.entita.
 */
export class AlunnoProvider implements ContextProvider {
  private readonly projection: CollectionProjectionInterceptor;

  constructor(
    private readonly alunni: IAlunnoRepository,
    private readonly classi: IClasseRepository,
    private readonly oreAsl: IOreASLRepository,
    private readonly materie: IMateriaRepository,
    private readonly teachingAssignments?: ITeachingAssignmentResolver
  ) {
    this.projection = createTeachingCouncilProjection(classi, materie).alunno;
  }

  provide(cdu: Cdu, params: BuildParams, options: RecipeOptions): void {
    const alunno = this.alunni.findById(params.target);
    if (alunno === null) throw new EntityNotFoundError(`Alunno ${params.target} non trovato`);
    setAlunnoEntity(cdu, alunno);

    const classe = this.classi.findById(alunno.classeId);
    if (classe === null)
      throw new EntityNotFoundError(
        `Classe ${alunno.classe} dell'alunno ${params.target} non trovata`
      );
    const indirizzo = this.classi.getIndirizzo(classe);

    const focusAlunno: CduAlunno = {
      anagrafica: { nomeCompleto: alunno.cognomeNome, email: alunno.email.value },
      status: {
        religione: alunno.religione,
        religioneLabel: religioneLabel(alunno.religione),
        isBes: false,
        isRipetente: alunno.isRipetente(),
        isRappresentante: alunno.isRappresentante()
      },
      curriculum: curriculumArray(alunno, this.materie),
      classe: {
        nome: classe.nome,
        indirizzoSigla: classe.indirizzo,
        indirizzoNome: indirizzo.nome
      },
      didattica: {
        carenze: { dettaglio: [], numero: 0, hasCarenze: false },
        asl: {
          oreCumulate: this.oreAsl.getTotaleOre(alunno),
          oreAnnoCorrente: this.oreAnnoCorrente(cdu, alunno)
        },
        piani: { items: [], hasPiani: false, hasBes: false }
      }
    };
    // Per-alunno filtered council (14 §1.3): built here because alunno recipes
    // don't run the consiglio provider. Only when the shared port is wired in.
    if (this.teachingAssignments !== undefined) {
      const assignments = resolveCouncilForProjection(
        this.teachingAssignments,
        classe,
        params.now,
        options.gestioneSupplenti
      );
      focusAlunno.consiglioDiClasseFiltrato = prepareStudentCouncilAssignments(
        assignments,
        alunno.religione,
        focusAlunno.curriculum
      ) as never;
    }

    cdu.focus.alunno = focusAlunno;
    if (focusAlunno.consiglioDiClasseFiltrato !== undefined) {
      this.projection.intercept('student', cdu, cdu, options);
    }
  }

  private oreAnnoCorrente(cdu: Cdu, alunno: Alunno): number {
    const anno = cdu.istituto?.organizzazione.annoScolastico;
    if (anno === undefined || anno === '') return 0;
    return this.oreAsl.getOrCreate(alunno, AnnoScolastico.of(anno)).getOre();
  }
}
