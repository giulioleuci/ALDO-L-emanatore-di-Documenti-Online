import type { ContextProvider } from '../ContextProvider';
import type { Cdu } from '../Cdu';
import type { ILogDocumentoRepository } from '../../../domain/repositories/ILogDocumentoRepository';
import { getAlunnoEntity } from '../techEntities';

const TIPO_PIANO_PERS = 'PIANO_PERS';

/**
 * Fills `focus.alunno.didattica.pianiPersonalizzati` from LOG_DOCS via
 * LogDocumentoRepository.findByUtente(), filtered to TIPO === 'PIANO_PERS'
 * (11 §11 new, deliberately independent of DocumentiProvider so the existing
 * `documenti`/`cartelle` boxes keep their documented empty-outside-
 * FAMIGLIA_COMPLETO behaviour, ref BOX_CONF_GUIDE.md §2). Active in
 * ALUNNO_COMPLETO and FAMIGLIA_COMPLETO.
 */
export class PianiPersAlunnoProvider implements ContextProvider {
  constructor(private readonly logDocs: ILogDocumentoRepository) {}

  provide(cdu: Cdu): void {
    const focusAlunno = cdu.focus.alunno;
    if (focusAlunno === undefined) return;
    const items = this.logDocs
      .findByUtente(getAlunnoEntity(cdu).email)
      .filter((l) => l.tipo === TIPO_PIANO_PERS)
      .map((l) => ({
        id: l.id ?? undefined,
        nome: l.nome,
        link: l.getLink(),
        tipo: l.tipo,
        sottotipo: l.getSottotipo(),
        idGen: l.idGen,
        stato: l.getStato(),
        dataCreazione: l.getDataCreazione(),
        notificato: l.isNotificato()
      }));
    focusAlunno.didattica.pianiPersonalizzati = { items };
  }
}
