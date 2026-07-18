import type { ContextProvider } from '../ContextProvider';
import type { Cdu } from '../Cdu';
import type { BuildParams, RecipeOptions } from '../Recipe';
import type { StoricoDatabaseProvider } from '../../storico/StoricoDatabaseProvider';
import type { DocumentoStoricoConTipo } from '../../storico/StoricoDocumentiService';
import { StoricoDocumentiService } from '../../storico/StoricoDocumentiService';
import { LazyRef } from '../../storico/LazyRef';

/**
 * Fills `focus.classe.didattica.pianiPersonalizzati.storico` (11 §11 new): one
 * LazyRef merging every distinct current-year student's prior-year documents,
 * each tagged with its ID_GEN. Deliberately a simple per-student loop (not a
 * batched cross-year query) — the number of BES/PDP students per class is
 * small, so this trades a small amount of historical-DB-open overhead for
 * reusing StoricoDocumentiService as-is. Mirrors PianiPersAlunnoStoricoProvider.
 */
export class PianiPersClasseStoricoProvider implements ContextProvider {
  constructor(private readonly databases: StoricoDatabaseProvider) {}

  provide(cdu: Cdu, _params: BuildParams, options: RecipeOptions): void {
    if (!options.includiStorico) return;
    const classe = cdu.focus.classe;
    if (classe === undefined || classe.didattica === undefined) return;
    const profondita = options.profonditaAnniDocumenti;
    const service = new StoricoDocumentiService(this.databases);
    const emails = [
      ...new Set(
        classe.didattica.pianiPersonalizzati.items
          .map((i) => i.studente?.email ?? '')
          .filter((e) => e !== '')
      )
    ];
    classe.didattica.pianiPersonalizzati.storico = new LazyRef(() =>
      emails.flatMap((email): DocumentoStoricoConTipo[] => service.perAlunnoConTipo(email, profondita))
    );
  }
}
