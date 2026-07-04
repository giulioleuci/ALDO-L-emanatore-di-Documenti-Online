import type { ContextProvider } from '../ContextProvider';
import type { Cdu } from '../Cdu';
import type { BuildParams, RecipeOptions } from '../Recipe';

/**
 * Lazy loader for previous-years data (09 §8). When `includiStorico` is false the
 * provider is skipped entirely and no LazyRef is inserted. The actual lazy
 * historical loading (LazyRef over prior-year spreadsheets via SheetDBLib) is the
 * responsibility of the 13_SERVIZI_STORICI subsystem and is wired there; until
 * then this provider is a no-op even when historical data is requested.
 */
export class StoricoProvider implements ContextProvider {
  provide(_cdu: Cdu, _params: BuildParams, options: RecipeOptions): void {
    if (!options.includiStorico) return;
    // includiStorico === true: LazyRef insertion deferred to 13_SERVIZI_STORICI.
  }
}
