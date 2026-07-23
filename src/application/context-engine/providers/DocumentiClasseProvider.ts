import type { ContextProvider } from '../ContextProvider';
import type { Cdu } from '../Cdu';
import type { BuildParams } from '../Recipe';
import type { IClasseRepository } from '../../../domain/repositories/IClasseRepository';
import type { ILogDocumentoRepository } from '../../../domain/repositories/ILogDocumentoRepository';
import { ClasseId } from '../../../domain/value-objects/ClasseId';

/**
 * Fills `focus.classe.didattica.documenti` (11 §11 new) by aggregating LOG_DOCS
 * across every class in `params.classiCompetenza` (falling back to the single
 * `params.target` class when absent), mirroring `PianiPersClasseProvider`'s
 * multi-class aggregation so a coordinatore covering several classes sees one
 * combined list. Active in DOCENTE_COMPLETO (PER_COORDINATORE/PER_DOCENTE/
 * PER_CDC) — gives the `documenti`/`cartelle` email boxes a classe-scoped data
 * source alongside their existing alunno-scoped one (`DocumentiProvider`).
 */
export class DocumentiClasseProvider implements ContextProvider {
  constructor(
    private readonly classi: IClasseRepository,
    private readonly logDocs: ILogDocumentoRepository
  ) {}

  provide(cdu: Cdu, params: BuildParams): void {
    const focusClasse = cdu.focus.classe;
    if (focusClasse === undefined) return;
    const classIds = params.classiCompetenza ?? [params.target];
    const items = classIds.flatMap((id) => {
      const classe = this.classi.findById(ClasseId.of(id));
      if (classe === null) return [];
      return this.logDocs.findByClasse(classe).map((l) => ({
        nome: l.nome,
        link: l.getLink(),
        tipo: l.tipo,
        idGen: l.idGen,
        stato: l.getStato(),
        dataCreazione: l.getDataCreazione()
      }));
    });
    const documenti = { items, hasDocumenti: items.length > 0 };
    if (focusClasse.didattica === undefined) {
      focusClasse.didattica = { pianiPersonalizzati: { items: [] }, documenti };
    } else {
      focusClasse.didattica.documenti = documenti;
    }
  }
}
