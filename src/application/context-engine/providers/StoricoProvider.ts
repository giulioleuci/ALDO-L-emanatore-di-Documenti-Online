import type { ContextProvider } from '../ContextProvider';
import type { Cdu } from '../Cdu';
import type { BuildParams, RecipeOptions } from '../Recipe';
import type { StoricoDatabaseProvider } from '../../storico/StoricoDatabaseProvider';
import { StoricoAlunniService } from '../../storico/StoricoAlunniService';
import { buildStudentStoricoVm } from '../mappers/storicoMapper';
import { getAlunnoEntity, withFocusAlunno } from '../techEntities';

/**
 * Lazy loader for the focused student's previous-years data (02 §4.2, §8.6,
 * 13 §2). When `includiStorico` is false the provider is skipped entirely —
 * no historical database is even opened. When true, attaches
 * `focus.alunno.storico` as a `LazyRef<StudentStoricoVM>`: the actual
 * StoricoAlunniService query and VM mapping run only on first read. The
 * current-year `Alunno` entity (stashed by AlunnoProvider, which always runs
 * first) resolves the most recent historical year's esito via its
 * RIPETENTE flag (ANALYSIS_HISTORIC_ENRICH_EXTENSION.md §2).
 */
export class StoricoProvider implements ContextProvider {
  constructor(private readonly databases: StoricoDatabaseProvider) {}

  provide(cdu: Cdu, _params: BuildParams, options: RecipeOptions): void {
    if (!options.includiStorico || options.profonditaAnniStorico <= 0) return;
    withFocusAlunno(cdu, (alunno) => {
      const email = alunno.anagrafica.email;
      const profondita = options.profonditaAnniStorico;
      const service = new StoricoAlunniService(this.databases);
      const alunnoCorrente = getAlunnoEntity(cdu);
      alunno.storico = new LazyRef(() =>
        buildStudentStoricoVm(service.perAlunno(email, profondita, alunnoCorrente))
      );
    });
  }
}
