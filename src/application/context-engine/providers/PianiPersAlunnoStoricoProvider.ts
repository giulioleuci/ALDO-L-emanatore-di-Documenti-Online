import type { ContextProvider } from '../ContextProvider';
import type { Cdu } from '../Cdu';
import type { BuildParams, RecipeOptions } from '../Recipe';
import type { StoricoDatabaseProvider } from '../../storico/StoricoDatabaseProvider';
import { StoricoDocumentiService } from '../../storico/StoricoDocumentiService';
import { withFocusAlunno } from '../techEntities';

const TIPO_PIANO_PERS = 'PIANO_PERS';

/**
 * Fills `focus.alunno.didattica.pianiPersonalizzati.storico` (11 §11 new) with
 * a LazyRef over prior-year PIANO_PERS documents, preserving each subtype for
 * `piani_pers_da_inviare` history matching. Mirrors
 * DocumentiStoricoProvider: skipped entirely when `includiStorico` is false.
 * Runs after `pianiPersAlunno` in the recipe.
 */
export class PianiPersAlunnoStoricoProvider implements ContextProvider {
  constructor(private readonly databases: StoricoDatabaseProvider) {}

  provide(cdu: Cdu, _params: BuildParams, options: RecipeOptions): void {
    if (!options.includiStorico) return;
    withFocusAlunno(cdu, (alunno) => {
      if (alunno.didattica.pianiPersonalizzati === undefined) return;
      const email = alunno.anagrafica.email;
      const profondita = options.profonditaAnniDocumenti;
      const service = new StoricoDocumentiService(this.databases);
      alunno.didattica.pianiPersonalizzati.storico = new LazyRef(() =>
        service
          .perAlunnoConTipo(email, profondita)
          .filter((documento) => documento.tipo === TIPO_PIANO_PERS)
      );
    });
  }
}
