import type { ContextProvider } from '../ContextProvider';
import type { Cdu } from '../Cdu';
import type { BuildParams, RecipeOptions } from '../Recipe';
import type { StoricoDatabaseProvider } from '../../storico/StoricoDatabaseProvider';
import { StoricoDocumentiService } from '../../storico/StoricoDocumentiService';
import { LazyRef } from '../../storico/LazyRef';

/**
 * Fills `focus.alunno.didattica.pianiPersonalizzati.storico` (11 §11 new) with
 * a LazyRef over every prior-year document tagged with its ID_GEN, feeding the
 * `piani_pers_da_inviare` box's default historical row. Mirrors
 * DocumentiStoricoProvider: skipped entirely when `includiStorico` is false.
 * Runs after `pianiPersAlunno` in the recipe.
 */
export class PianiPersAlunnoStoricoProvider implements ContextProvider {
  constructor(private readonly databases: StoricoDatabaseProvider) {}

  provide(cdu: Cdu, _params: BuildParams, options: RecipeOptions): void {
    if (!options.includiStorico) return;
    const alunno = cdu.focus.alunno;
    if (alunno === undefined || alunno.didattica.pianiPersonalizzati === undefined) return;
    const email = alunno.anagrafica.email;
    const profondita = options.profonditaAnniDocumenti;
    const service = new StoricoDocumentiService(this.databases);
    alunno.didattica.pianiPersonalizzati.storico = new LazyRef(() =>
      service.perAlunnoConTipo(email, profondita)
    );
  }
}
