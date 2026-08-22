import type { ContextProvider } from '../ContextProvider';
import { attachCduArticolazionePartners } from '../CduInternalMetadata';
import type { Cdu, CduClasse } from '../Cdu';
import type { BuildParams } from '../Recipe';
import type { IClasseRepository } from '../../../domain/repositories/IClasseRepository';
import type { IAlunnoRepository } from '../../../domain/repositories/IAlunnoRepository';
import type { IMateriaRepository } from '../../../domain/repositories/IMateriaRepository';
import type { Classe } from '../../../domain/entities/Classe';
import type { Materia } from '../../../domain/entities/Materia';
import type { ArticolazioneConfig } from '../../../domain/value-objects/ArticolazioneConfig';
import { ClasseId } from '../../../domain/value-objects/ClasseId';
import { MateriaId } from '../../../domain/value-objects/MateriaId';
import { IndirizzoId } from '../../../domain/value-objects/IndirizzoId';
import { setClasseEntity } from '../techEntities';
import { EntityNotFoundError, ValidationError } from '../../../domain/errors/DomainError';
import type { SubjectVM } from '../mappers/subjectVmMapper';
import { buildSubjectVm } from '../mappers/subjectVmMapper';
import type { PersonVM } from '../mappers/personVmMapper';
import { buildPersonVmFromDocente, coordinatoriVerbs, declinePersonGroup } from '../mappers/personVmMapper';

/**
 * Populates `focus.classe.anagrafica`, `flags`, `articolazione` and
 * `coordinatori` (09 §4/§9). Resolves the focus class from `params.target` —
 * directly for a class target, or via the student's own class for an alunno
 * target (alunno recipes place `class` before `student`) — and stashes the live
 * Classe entity in `tech.entita.classe` for later providers (tutor, consiglio,
 * students).
 */
export class ClasseProvider implements ContextProvider {
  constructor(
    private readonly classi: IClasseRepository,
    private readonly alunni?: IAlunnoRepository,
    private readonly materie?: IMateriaRepository
  ) {}

  provide(cdu: Cdu, params: BuildParams): void {
    const classe = this.resolveClasse(params);
    setClasseEntity(cdu, classe);

    const indirizzo = this.classi.getIndirizzo(classe);
    const anno = classe.anno;
    const isArticolata = this.classi.isArticolata(classe);
    const annoScolastico = cdu.istituto?.organizzazione.annoScolastico ?? '';

    const focusClasse: CduClasse = {
      anagrafica: {
        nome: classe.nome,
        anno: anno.value,
        sezione: classe.sezione,
        annoScolastico,
        indirizzo: {
          nome: indirizzo.nome,
          nomeSintetico: indirizzo.nomeSintetico,
          sigla: classe.indirizzo,
          tipo: indirizzo.tipo
        }
      },
      flags: {
        isClassePrima: anno.isPrima(),
        isTriennio: anno.value >= 3,
        isPrimoBiennio: anno.isPrimoBiennio(),
        isTerminale: anno.isTerminale(),
        isArticolata
      },
      coordinatori: this.buildCoordinatori(classe)
    };

    if (isArticolata) {
      const articolazione = this.buildArticolazione(classe);
      focusClasse.articolazione = attachCduArticolazionePartners(
        articolazione,
        this.classi.orderedPartners(classe).map((partner) => partner.id ?? '')
      );
    }

    cdu.focus.classe = focusClasse;
  }

  private resolveClasse(params: BuildParams): Classe {
    if (params.tipoTarget === 'alunno') {
      if (this.alunni === undefined)
        throw new ValidationError('ClasseProvider: un target alunno richiede AlunnoRepository');
      const alunno = this.alunni.findById(params.target);
      if (alunno === null) throw new EntityNotFoundError(`Alunno ${params.target} non trovato`);
      const classe = this.classi.findById(alunno.classeId);
      if (classe === null)
        throw new EntityNotFoundError(
          `Classe ${alunno.classe} dell'alunno ${params.target} non trovata`
        );
      return classe;
    }
    const classe = this.classi.findById(ClasseId.of(params.target));
    if (classe === null) throw new EntityNotFoundError(`Classe ${params.target} non trovata`);
    return classe;
  }

  private buildCoordinatori(classe: Classe): NonNullable<CduClasse['coordinatori']> {
    const config = this.classi.getArticolazione(classe);
    const sources: Classe[] =
      config?.isParent() === true ? [classe, ...this.classi.getClassiPartner(classe)] : [classe];
    // Materia is resolved per-source (not against the parent `classe`): each partner
    // holds its own MATE/FISI-style column, so a partner-only coordinator's subject
    // would otherwise resolve to null when looked up against the parent's row.
    const elenco: PersonVM[] = sources.flatMap((source) =>
      this.classi
        .getCoordinatori(source)
        .map((d) => buildPersonVmFromDocente(d, this.classi.getMateriaDocente(source, d.id ?? '') ?? null))
    );
    const declension = declinePersonGroup(elenco);
    return {
      ...(declension === undefined ? {} : { ...declension, ...coordinatoriVerbs(elenco.length) }),
      elenco
    };
  }

  private buildArticolazione(classe: Classe): NonNullable<CduClasse['articolazione']> {
    const config = this.classi.getArticolazione(classe);
    const materie = this.classi.getMaterieArticolazione(classe);
    return {
      partner: config?.partner?.value ?? null,
      partners: config?.isParent() === true ? config.partners.map((partner) => partner.value) : null,
      parent: this.buildParent(config),
      materieCondivise: this.buildMaterieVm(materie?.condivise ?? [], classe),
      materieSeparatePrimoGruppo: this.buildMaterieVm(materie?.separatePrimoGruppo ?? [], classe),
      materieSeparateSecondoGruppo: this.buildMaterieVm(materie?.separateSecondoGruppo ?? [], classe)
    };
  }

  /** Descriptive parent (id, anno, ordered partner indirizzi) for an articulated partner class. */
  private buildParent(
    config: ArticolazioneConfig | null
  ): NonNullable<CduClasse['articolazione']>['parent'] {
    const parentId = config?.parent?.value ?? null;
    if (parentId === null) return null;
    const parentClasse = this.classi.findById(ClasseId.of(parentId));
    if (parentClasse === null) return null;
    const indirizzi = this.classi.orderedPartners(parentClasse).map((partner) => {
      const ind = this.classi.getIndirizzo(partner);
      return { sigla: partner.indirizzo, nome: ind.nome, nomeSintetico: ind.nomeSintetico, tipo: ind.tipo };
    });
    return { id: parentId, anno: parentClasse.anno.value, indirizzi };
  }

  /** Resolves articolazione subject sigle to SubjectVM via MATERIE, silently dropping unknown sigle. */
  private buildMaterieVm(sigle: string[], classe: Classe): SubjectVM[] {
    const materie = this.materie;
    if (materie === undefined) return [];
    const indirizzo = IndirizzoId.of(classe.indirizzo);
    return sigle
      .map((sigla) => materie.findByIdCached(MateriaId.of(sigla)))
      .filter((materia): materia is Materia => materia !== null)
      .map((materia) => buildSubjectVm(materia, { indirizzo }));
  }
}
