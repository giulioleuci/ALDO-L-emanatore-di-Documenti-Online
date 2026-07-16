import type { ContextProvider } from '../ContextProvider';
import type { Cdu, CduClasse } from '../Cdu';
import type { BuildParams } from '../Recipe';
import type { ClasseRepository } from '../../../infrastructure/repositories/ClasseRepository';
import type { AlunnoRepository } from '../../../infrastructure/repositories/AlunnoRepository';
import type { Classe } from '../../../domain/entities/Classe';
import { setClasseEntity } from '../techEntities';
import { EntityNotFoundError, ValidationError } from '../../../domain/errors/DomainError';

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
    private readonly classi: ClasseRepository,
    private readonly alunni?: AlunnoRepository
  ) {}

  provide(cdu: Cdu, params: BuildParams): void {
    const classe = this.resolveClasse(params);
    setClasseEntity(cdu, classe);

    const indirizzo = this.classi.getIndirizzo(classe);
    const anno = classe.anno;
    const isArticolata = this.classi.isArticolata(classe);

    const focusClasse: CduClasse = {
      anagrafica: {
        nome: classe.nome,
        anno: anno.value,
        sezione: classe.nome.replace(/^\d+/, ''),
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
      coordinatori: this.classi.getCoordinatori(classe).map((d) => ({
        nome: d.getNomeCompleto(),
        email: d.id ?? '',
        materia: this.classi.getMateriaDocente(classe, d.id ?? '') ?? '',
        appellativo: d.getAppellativo()
      }))
    };

    if (isArticolata) focusClasse.articolazione = this.buildArticolazione(classe);

    cdu.focus.classe = focusClasse;
  }

  private resolveClasse(params: BuildParams): Classe {
    if (params.tipoTarget === 'alunno') {
      if (this.alunni === undefined)
        throw new ValidationError('ClasseProvider: un target alunno richiede AlunnoRepository');
      const alunno = this.alunni.findById(params.target);
      if (alunno === null) throw new EntityNotFoundError(`Alunno ${params.target} non trovato`);
      const classe = this.classi.findById(alunno.classe);
      if (classe === null)
        throw new EntityNotFoundError(
          `Classe ${alunno.classe} dell'alunno ${params.target} non trovata`
        );
      return classe;
    }
    const classe = this.classi.findById(params.target);
    if (classe === null) throw new EntityNotFoundError(`Classe ${params.target} non trovata`);
    return classe;
  }

  private buildArticolazione(classe: Classe): NonNullable<CduClasse['articolazione']> {
    const config = this.classi.getArticolazione(classe);
    const materie = this.classi.getMaterieArticolazione(classe);
    return {
      partner: config?.partner?.value ?? null,
      partners: config?.isParent() === true ? config.partners.map((p) => p.value) : null,
      parent: config?.parent?.value ?? null,
      materieCondivise: materie?.condivise ?? [],
      materieSeparatePrimoGruppo: materie?.separatePrimoGruppo ?? [],
      materieSeparateSecondoGruppo: materie?.separateSecondoGruppo ?? []
    };
  }
}
