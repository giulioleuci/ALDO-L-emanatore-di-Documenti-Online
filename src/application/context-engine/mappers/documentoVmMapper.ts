import type { LogDocumento } from '../../../domain/entities/LogDocumento';
import type { DocumentoLogVM, DocumentoStoricoVM } from '../Cdu';
import type { DocumentoStoricoConTipo } from '../../storico/StoricoDocumentiService';
import { statoDocumentoLabel } from './labels';
import { formatOggi } from '../dates';

/** Canonical LOG_DOCS -> DocumentoLogVM mapping, shared by every provider that surfaces documents. */
export function buildDocumentoLogVm(l: LogDocumento): DocumentoLogVM {
  const sottotipo = l.getSottotipo();
  const dataCreazione = l.getDataCreazione();
  return {
    id: l.id,
    hasId: l.id !== null,
    nome: l.nome,
    link: l.getLink(),
    tipo: l.tipo,
    tipoLabel: l.tipo,
    sottotipo,
    sottotipoLabel: sottotipo,
    hasSottotipo: sottotipo !== '',
    generatoreId: l.idGen,
    stato: l.getStato(),
    statoLabel: statoDocumentoLabel(l.getStato()),
    isNotificato: l.isNotificato(),
    dataCreazione,
    dataCreazioneBreve: dataCreazione === '' ? '' : formatOggi(new Date(dataCreazione)).breve
  };
}

/** Canonical historical LOG_DOCS row -> DocumentoStoricoVM mapping (prior-year metadata only, no live id/stato). */
export function buildDocumentoStoricoVm(item: DocumentoStoricoConTipo): DocumentoStoricoVM {
  return {
    annoScolastico: item.anno,
    documento: {
      id: null,
      hasId: false,
      nome: item.nome,
      link: item.link,
      tipo: item.tipo,
      tipoLabel: item.tipo,
      sottotipo: item.sottotipo,
      sottotipoLabel: item.sottotipo,
      hasSottotipo: item.sottotipo !== '',
      generatoreId: item.idGen,
      stato: '',
      statoLabel: '',
      isNotificato: false,
      dataCreazione: '',
      dataCreazioneBreve: ''
    }
  };
}
