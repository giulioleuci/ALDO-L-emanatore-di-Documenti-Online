import type { ContextProvider } from '../ContextProvider';
import type { Cdu } from '../Cdu';
import type { BuildParams, RecipeOptions } from '../Recipe';
import type { StoricoDatabaseProvider } from '../../storico/StoricoDatabaseProvider';
import { StoricoDocumentiService } from '../../storico/StoricoDocumentiService';
import { LazyRef } from '../../storico/LazyRef';

/**
 * Fills `focus.alunno.didattica.documenti.storico` (11 §11, 13 §4) with a
 * LazyRef over every prior-year document tagged with its ID_GEN, feeding the
 * `documenti` box's `arricchisciConStorico` render mode. Runs after
 * `documenti` in the recipe (needs `focus.alunno.didattica.documenti`
 * already populated). Mirrors `StoricoProvider`: skipped entirely when
 * `includiStorico` is false, so no historical database is opened.
 */
export class DocumentiStoricoProvider implements ContextProvider {
  constructor(private readonly databases: StoricoDatabaseProvider) {}

  provide(cdu: Cdu, _params: BuildParams, options: RecipeOptions): void {
    if (!options.includiStorico) return;
    const alunno = cdu.focus.alunno;
    if (alunno === undefined || alunno.didattica.documenti === undefined) return;
    const email = alunno.anagrafica.email;
    const profondita = options.profonditaAnniDocumenti;
    const service = new StoricoDocumentiService(this.databases);
    alunno.didattica.documenti.storico = new LazyRef(() =>
      service.perAlunnoConTipo(email, profondita)
    );
  }
}
