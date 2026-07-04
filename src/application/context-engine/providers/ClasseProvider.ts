import type { ContextProvider } from '../ContextProvider';
import type { Cdu, CduClasse } from '../Cdu';
import type { BuildParams } from '../Recipe';
import type { ClasseRepository } from '../../../infrastructure/repositories/ClasseRepository';
import type { Classe } from '../../../domain/entities/Classe';
import { setClasseEntity } from '../techEntities';
import { EntityNotFoundError } from '../../../domain/errors/DomainError';

/**
 * Populates `focus.classe.anagrafica`, `flags`, `articolazione` and
 * `coordinatori` (09 §4/§9). Resolves the focus class from `params.target` and
 * stashes the live Classe entity in `tech.entita.classe` for later providers
 * (tutor, consiglio, students).
 */
export class ClasseProvider implements ContextProvider {
  constructor(private readonly classi: ClasseRepository) {}

  provide(cdu: Cdu, params: BuildParams): void {
    const classe = this.classi.findById(params.target);
    if (classe === null) throw new EntityNotFoundError(`Classe ${params.target} non trovata`);
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
