import type { ContextProvider } from '../ContextProvider';
import type { Cdu } from '../Cdu';
import type { BuildParams, RecipeOptions } from '../Recipe';
import type { StoricoDatabaseProvider } from '../../storico/StoricoDatabaseProvider';
import { StoricoAlunniService } from '../../storico/StoricoAlunniService';
import { LazyRef } from '../../storico/LazyRef';

/**
 * Lazy loader for previous-years data (09 §8, 13 §2). When `includiStorico` is
 * false the provider is skipped entirely and no LazyRef is inserted — no
 * historical database is even opened. When true and a student is in focus, it
 * attaches `focus.alunno.didattica.storico` as a `LazyRef`: the actual
 * StoricoAlunniService query (which opens the prior-year databases) runs only
 * on first read of the LazyRef, never during CDU assembly.
 */
export class StoricoProvider implements ContextProvider {
  constructor(private readonly databases: StoricoDatabaseProvider) {}

  provide(cdu: Cdu, _params: BuildParams, options: RecipeOptions): void {
    if (!options.includiStorico) return;
    const alunno = cdu.focus.alunno;
    if (alunno === undefined) return;
    const email = alunno.anagrafica.email;
    const profondita = options.profonditaAnniStorico;
    const service = new StoricoAlunniService(this.databases);
    alunno.didattica.storico = new LazyRef(() => service.perAlunno(email, profondita));
  }
}
