import type { ContextProvider } from '../ContextProvider';
import type { Cdu } from '../Cdu';
import type { BuildParams, RecipeOptions } from '../Recipe';
import type { IClasseRepository } from '../../../domain/repositories/IClasseRepository';
import type { ILogDocumentoRepository } from '../../../domain/repositories/ILogDocumentoRepository';
import type { StoricoDatabaseProvider } from '../../storico/StoricoDatabaseProvider';
import { ClasseId } from '../../../domain/value-objects/ClasseId';
import { StoricoDocumentiService } from '../../storico/StoricoDocumentiService';
import { buildDocumentoLogVm, buildDocumentoStoricoVm } from '../mappers/documentoVmMapper';
import { elencoVm } from '../mappers/elencoVm';

/**
 * Fills `focus.classe.documenti` (11 §11 new) by aggregating LOG_DOCS across
 * every class in `params.classiCompetenza` (falling back to the single
 * `params.target` class when absent), mirroring `PianiPersClasseProvider`'s
 * multi-class aggregation so a coordinatore covering several classes sees one
 * combined list. `storico` aggregates every distinct current-year student's
 * prior-year documents (same per-student-loop trade-off `PianiPersClasseProvider`
 * makes: BES/PDP-class rosters are small, so this reuses `StoricoDocumentiService`
 * as-is rather than a batched cross-year query), attached lazily. Active in
 * DOCENTE_COMPLETO (PER_COORDINATORE/PER_DOCENTE/PER_CDC).
 */
export class DocumentiClasseProvider implements ContextProvider {
  constructor(
    private readonly classi: IClasseRepository,
    private readonly logDocs: ILogDocumentoRepository,
    private readonly storicoDb: StoricoDatabaseProvider
  ) {}

  provide(cdu: Cdu, params: BuildParams, options: RecipeOptions): void {
    const focusClasse = cdu.focus.classe;
    if (focusClasse === undefined) return;
    const classIds = params.classiCompetenza ?? [params.target];
    const emails = new Set<string>();
    const elenco = classIds.flatMap((id) => {
      const classe = this.classi.findById(ClasseId.of(id));
      if (classe === null) return [];
      return this.logDocs.findByClasse(classe).map((l) => {
        for (const email of l.getUtenti()) emails.add(email);
        return buildDocumentoLogVm(l);
      });
    });
    const includiStorico = options.includiStorico;
    const profondita = options.profonditaAnniDocumenti;
    const service = new StoricoDocumentiService(this.storicoDb);
    focusClasse.documenti = {
      ...elencoVm(elenco),
      storico: new LazyRef(() =>
        includiStorico
          ? [...emails].flatMap((email) =>
              service.perAlunnoConTipo(email, profondita).map(buildDocumentoStoricoVm)
            )
          : []
      )
    };
  }
}
