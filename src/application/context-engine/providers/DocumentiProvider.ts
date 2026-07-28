import type { ContextProvider } from '../ContextProvider';
import type { Cdu } from '../Cdu';
import type { ILogDocumentoRepository } from '../../../domain/repositories/ILogDocumentoRepository';
import { getAlunnoEntity } from '../techEntities';

/**
 * Fills `focus.alunno.didattica.documenti` from LOG_DOCS via
 * LogDocumentoRepository.findByUtente() (09 §4, 02 §4.2). Active in the
 * ALUNNO_DETTAGLIATO and FAMIGLIA_COMPLETO recipes.
 */
export class DocumentiProvider implements ContextProvider {
  constructor(private readonly logDocs: ILogDocumentoRepository) {}

  provide(cdu: Cdu): void {
    const focusAlunno = cdu.focus.alunno;
    if (focusAlunno === undefined) return;
    const items = this.logDocs.findByUtente(getAlunnoEntity(cdu).email).map((l) => ({
      id: l.id ?? undefined,
      nome: l.nome,
      link: l.getLink(),
      tipo: l.tipo,
      idGen: l.idGen,
      stato: l.getStato(),
      dataCreazione: l.getDataCreazione()
    }));
    focusAlunno.didattica.documenti = { items, hasDocumenti: items.length > 0 };
  }
}
