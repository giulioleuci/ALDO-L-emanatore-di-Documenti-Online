import type { ContextProvider } from '../ContextProvider';
import type { Cdu } from '../Cdu';
import type { BuildParams, RecipeOptions } from '../Recipe';
import type { ILogDocumentoRepository } from '../../../domain/repositories/ILogDocumentoRepository';
import type { StoricoDatabaseProvider } from '../../storico/StoricoDatabaseProvider';
import { StoricoDocumentiService } from '../../storico/StoricoDocumentiService';
import { buildDocumentoLogVm } from '../mappers/documentoVmMapper';
import { elencoVm } from '../mappers/elencoVm';
import { getAlunnoEntity, withFocusAlunno } from '../techEntities';

/**
 * Fills `focus.alunno.documenti` (11 §11 new) from LOG_DOCS via
 * LogDocumentoRepository.findByUtente() — every document type for this
 * student, unfiltered (personalized-plan documents included: the new
 * contract gives an alunno exactly one documents node, so box rendering
 * filters by `tipo`/`sottotipo` itself instead of a dedicated
 * piani-personalizzati provider). `storico` is always attached as a LazyRef —
 * cheap to construct, so the historical database is only actually opened when
 * a consumer dereferences it with `includiStorico` true (mirrors the old
 * two-provider split's "skipped entirely" behaviour without a second token).
 * Active in ALUNNO_DETTAGLIATO, ALUNNO_COMPLETO, PIANO_PERSONALIZZATO and
 * FAMIGLIA_COMPLETO.
 */
export class DocumentiProvider implements ContextProvider {
  constructor(
    private readonly logDocs: ILogDocumentoRepository,
    private readonly storicoDb: StoricoDatabaseProvider
  ) {}

  provide(cdu: Cdu, _params: BuildParams, options: RecipeOptions): void {
    withFocusAlunno(cdu, (focusAlunno) => {
      const alunno = getAlunnoEntity(cdu);
      const elenco = this.logDocs.findByUtente(alunno.email).map(buildDocumentoLogVm);
      const includiStorico = options.includiStorico;
      const profondita = options.profonditaAnniDocumenti;
      const service = new StoricoDocumentiService(this.storicoDb);
      focusAlunno.documenti = {
        ...elencoVm(elenco),
        storico: new LazyRef(() =>
          includiStorico ? service.perAlunnoConTipo(alunno.email.value, profondita) : []
        )
      };
    });
  }
}
