import type { ContextProvider } from '../ContextProvider';
import type { Cdu } from '../Cdu';
import type { BuildParams, RecipeOptions } from '../Recipe';
import type { StoricoDatabaseProvider } from '../../storico/StoricoDatabaseProvider';
import { StoricoAlunniService } from '../../storico/StoricoAlunniService';
import { buildStudentStoricoVm } from '../mappers/storicoMapper';

/**
 * Lazy loader for the focused student's previous-years data (02 §4.2, §8.6,
 * 13 §2). When `includiStorico` is false the provider is skipped entirely —
 * no historical database is even opened. When true, attaches
 * `focus.alunno.storico` as a `LazyRef<StudentStoricoVM>`: the actual
 * StoricoAlunniService query and VM mapping run only on first read.
 */
export class StoricoProvider implements ContextProvider {
  constructor(private readonly databases: StoricoDatabaseProvider) {}

  provide(cdu: Cdu, _params: BuildParams, options: RecipeOptions): void {
    if (!options.includiStorico || options.profonditaAnniStorico <= 0) return;
    const alunno = cdu.focus.alunno;
    if (alunno === undefined) return;
    const email = alunno.anagrafica.email;
    const profondita = options.profonditaAnniStorico;
    const service = new StoricoAlunniService(this.databases);
    alunno.storico = new LazyRef(() => buildStudentStoricoVm(service.perAlunno(email, profondita)));
  }
}
