import type { ContextProvider } from '../ContextProvider';
import type { AlunnoFocusVM, Cdu } from '../Cdu';
import type { BuildParams, RecipeOptions } from '../Recipe';
import type { IAlunnoRepository } from '../../../domain/repositories/IAlunnoRepository';
import type { IClasseRepository } from '../../../domain/repositories/IClasseRepository';
import type { IOreASLRepository } from '../../../domain/repositories/IOreASLRepository';
import type { IMateriaRepository } from '../../../domain/repositories/IMateriaRepository';
import type { Alunno } from '../../../domain/entities/Alunno';
import type { ITeachingAssignmentResolver } from '../../ports/ITeachingAssignmentResolver';
import type { StoricoDatabaseProvider } from '../../storico/StoricoDatabaseProvider';
import { AlunnoRepository } from '../../../infrastructure/repositories/AlunnoRepository';
import { AnnoScolastico } from '../../../domain/value-objects/AnnoScolastico';
import { setAlunnoEntity } from '../techEntities';
import { curriculumArray } from '../mappers/carenzeMapper';
import { religioneLabel, indirizzoTipoLabel } from '../mappers/labels';
import { elencoVm } from '../mappers/elencoVm';
import {
  createTeachingCouncilProjection,
  materieDistinteConsiglioFiltrato,
  prepareStudentCouncilAssignments,
  resolveCouncilForProjection
} from '../TeachingCouncilProjection';
import { EntityNotFoundError } from '../../../domain/errors/DomainError';

export class AlunnoProvider implements ContextProvider {
  private readonly projection: CollectionProjectionInterceptor;

  constructor(
    private readonly alunni: IAlunnoRepository,
    private readonly classi: IClasseRepository,
    private readonly oreAsl: IOreASLRepository,
    private readonly materie: IMateriaRepository,
    private readonly storicoDb: StoricoDatabaseProvider,
    private readonly teachingAssignments: ITeachingAssignmentResolver
  ) {
    this.projection = createTeachingCouncilProjection(classi, materie).alunno;
  }

  provide(cdu: Cdu, params: BuildParams, options: RecipeOptions): void {
    const alunno = this.alunni.findById(params.target);
    if (alunno === null) throw new EntityNotFoundError(`Alunno ${params.target} non trovato`);
    setAlunnoEntity(cdu, alunno);
    const classe = this.classi.findById(alunno.classeId);
    if (classe === null) throw new EntityNotFoundError(`Classe ${alunno.classe} non trovata`);
    const indirizzo = this.classi.getIndirizzo(classe);
    const curriculum = curriculumArray(alunno, this.materie);
    const precedente = this.precedente(alunno, options);
    const focus: AlunnoFocusVM = {
      nomeCompleto: alunno.cognomeNome,
      email: alunno.email.value,
      classe: {
        nome: classe.nome,
        indirizzo: {
          sigla: classe.indirizzo,
          nome: indirizzo.nome,
          nomeSintetico: indirizzo.nomeSintetico,
          tipo: indirizzo.tipo,
          tipoLabel: indirizzoTipoLabel(indirizzo.tipo)
        }
      },
      religione: alunno.religione,
      religioneLabel: religioneLabel(alunno.religione),
      isIrc: String(alunno.religione) === 'IRC',
      isAlt: String(alunno.religione) === 'ALT',
      isSenzaReligione: String(alunno.religione) === 'NO',
      isBes: false,
      isDsa: false,
      isPei: false,
      isPfp: false,
      isRipetente: alunno.isRipetente(),
      isRappresentante: alunno.isRappresentante(),
      presenza: {
        annoPrecedente: precedente,
        isPresenteTuttoAnno: true,
        hasCambiatoClasse: false,
        classePrecedente: null,
        hasClassePrecedente: false
      },
      movimenti: elencoVm([]),
      curriculum,
      hasCurriculum: curriculum.length > 0,
      curriculumDescrizione: curriculum
        .map(
          (item) =>
            `${item.materiaNome}${item.hasSpecifiche ? ` (${item.specificheDescrizione})` : ''}`
        )
        .join(', '),
      carenze: { ...elencoVm([]), elencoDescrizione: '' },
      asl: {
        oreCumulate: this.oreAsl.getTotaleOre(alunno),
        oreAnnoCorrente: this.oreAnnoCorrente(cdu, alunno)
      },
      piani: { ...elencoVm([]), elencoDescrizione: '', hasBes: false }
    };
    cdu.focus.alunno = focus;
    const assignments = resolveCouncilForProjection(
      this.teachingAssignments,
      classe,
      params.now,
      options.gestioneSupplenti
    );
    focus.consiglio = {
      elenco: prepareStudentCouncilAssignments(assignments, alunno.religione, curriculum) as never,
      hasElenco: false,
      numero: 0,
      elencoDescrizione: '',
      materie: [],
      hasMaterie: false,
      materieDescrizione: ''
    };
    this.projection.intercept('student', cdu, cdu, options);
    focus.consiglio.hasElenco = focus.consiglio.elenco.length > 0;
    focus.consiglio.numero = focus.consiglio.elenco.length;
    focus.consiglio.elencoDescrizione = focus.consiglio.elenco
      .map((docente) => docente.appellativoCompleto)
      .join(', ');
    focus.consiglio.materie = materieDistinteConsiglioFiltrato(focus.consiglio.elenco);
    focus.consiglio.hasMaterie = focus.consiglio.materie.length > 0;
    focus.consiglio.materieDescrizione = focus.consiglio.materie
      .map((materia) => materia.nome)
      .join(', ');
  }

  private oreAnnoCorrente(cdu: Cdu, alunno: Alunno): number {
    const anno = cdu.istituto?.annoScolastico;
    return anno === undefined || anno === ''
      ? 0
      : this.oreAsl.getOrCreate(alunno, AnnoScolastico.of(anno)).getOre();
  }

  private precedente(
    alunno: Alunno,
    options: RecipeOptions
  ): { isCalcolato: boolean; isPresente: boolean } {
    if (!options.includiStorico) return { isCalcolato: false, isPresente: false };
    const anno = this.storicoDb.anniStorici(1)[0];
    return anno === undefined
      ? { isCalcolato: false, isPresente: false }
      : {
          isCalcolato: true,
          isPresente: new AlunnoRepository(anno.db).findById(alunno.email.value) !== null
        };
  }
}
