import type { ContextProvider } from '../ContextProvider';
import type { Cdu, CduAlunno } from '../Cdu';
import type { BuildParams, RecipeOptions } from '../Recipe';
import type { IAlunnoRepository } from '../../../domain/repositories/IAlunnoRepository';
import type { IClasseRepository } from '../../../domain/repositories/IClasseRepository';
import type { IOreASLRepository } from '../../../domain/repositories/IOreASLRepository';
import type { IMateriaRepository } from '../../../domain/repositories/IMateriaRepository';
import type { Alunno } from '../../../domain/entities/Alunno';
import type { ITeachingAssignmentResolver } from '../../ports/ITeachingAssignmentResolver';
import type { StoricoDatabaseProvider } from '../../storico/StoricoDatabaseProvider';
import { AlunnoRepository } from '../../../infrastructure/repositories/AlunnoRepository';
import {
  createTeachingCouncilProjection,
  materieDistinteConsiglioFiltrato,
  prepareStudentCouncilAssignments,
  resolveCouncilForProjection
} from '../TeachingCouncilProjection';
import { AnnoScolastico } from '../../../domain/value-objects/AnnoScolastico';
import { setAlunnoEntity } from '../techEntities';
import { curriculumArray } from '../mappers/carenzeMapper';
import { religioneLabel } from '../mappers/labels';
import { presenteTuttoAnno } from '../../storico/presenza';
import { EntityNotFoundError } from '../../../domain/errors/DomainError';

/**
 * Populates `focus.alunno` anagrafica/status/curriculum/classe and the didattica
 * skeleton incl. ASL hours (09 §4). `status.isBes` is initialised to false as a
 * placeholder — PianiProvider (which reads PIANI, later in the recipe) flips it
 * to true when the student has a BES plan. Carenze and piani sub-sections are
 * filled by their own providers. Stashes the live Alunno entity in tech.entita.
 * `status.presenteAnnoPrecedente`/`presenteTuttoAnno` mirror the historical
 * per-year fields on `StudentStoricoVM.anni[]` (ANALYSIS_HISTORIC_ENRICH_EXTENSION.md
 * §4/§5) but for the CURRENT year: presenteAnnoPrecedente looks one year back
 * through `storicoDb` (cheap — that provider caches opened databases by
 * spreadsheet id across the whole CDU build), presenteTuttoAnno reads this
 * year's own MOV_ALUNNI via `IAlunnoRepository.getStoricoMovimenti`.
 * presenteAnnoPrecedente is gated behind `options.includiStorico`, like every
 * other historical-data provider in the recipe (StoricoProvider,
 * DocumentiStoricoProvider, PianiPers*StoricoProvider) — `storicoDb` is only
 * ever touched when the caller opted into historical data, so a plain
 * ALUNNO_DETTAGLIATO/CLASSE_COMPLETA build (includiStorico defaults to false)
 * never opens a second database. Unlike those other providers it always looks
 * exactly one year back (`anniStorici(1)`) regardless of
 * `options.profonditaAnniStorico`, since "was the student here last year" is
 * intrinsically a depth-1 question. Stays a plain `boolean`, not a `LazyRef`
 * (unlike `focus.alunno.storico`) — per SPECS_ALDO/02_CDU_STRUTTURA.md:1584,
 * `status.*` fields must stay template-renderable plain values, so gating is
 * done in the provider, not by deferring resolution to the consumer.
 */
export class AlunnoProvider implements ContextProvider {
  private readonly projection: CollectionProjectionInterceptor;

  constructor(
    private readonly alunni: IAlunnoRepository,
    private readonly classi: IClasseRepository,
    private readonly oreAsl: IOreASLRepository,
    private readonly materie: IMateriaRepository,
    private readonly storicoDb: StoricoDatabaseProvider,
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
        isRappresentante: alunno.isRappresentante(),
        presenteAnnoPrecedente: this.presenteAnnoPrecedente(alunno, options),
        presenteTuttoAnno: presenteTuttoAnno(this.alunni.getStoricoMovimenti(alunno))
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
      focusAlunno.elencoMaterieFiltrate = materieDistinteConsiglioFiltrato(
        focusAlunno.consiglioDiClasseFiltrato
      );
    }
  }

  private oreAnnoCorrente(cdu: Cdu, alunno: Alunno): number {
    const anno = cdu.istituto?.organizzazione.annoScolastico;
    if (anno === undefined || anno === '') return 0;
    return this.oreAsl.getOrCreate(alunno, AnnoScolastico.of(anno)).getOre();
  }

  private presenteAnnoPrecedente(alunno: Alunno, options: RecipeOptions): boolean {
    if (!options.includiStorico) return false;
    const annoPrecedente = this.storicoDb.anniStorici(1)[0];
    if (annoPrecedente === undefined) return false;
    return new AlunnoRepository(annoPrecedente.db).findById(alunno.email.value) !== null;
  }
}
