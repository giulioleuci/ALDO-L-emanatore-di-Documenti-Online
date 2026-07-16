import type { StoricoDatabaseProvider } from './StoricoDatabaseProvider';
import { LogDocumentoRepository } from '../../infrastructure/repositories/LogDocumentoRepository';
import type { ILogDocumentoRepository } from '../../domain/repositories/ILogDocumentoRepository';
import { Email } from '../../domain/value-objects/Email';

export interface DocumentoStorico {
  anno: string;
  nome: string;
  link: string;
}

/**
 * StoricoDocumentiService (13 §4): documents already generated for a student
 * of a given type (`CONF_DOC.TIPO`, matched against `LOG_DOCS.ID_GEN`) in
 * prior school years. Feeds the `documenti` box's `arricchisciConStorico` mode
 * (11 §11, 14 §3) as `{ corrente, storico: LazyRef<DocumentoStorico[]> }` —
 * the LazyRef wrapping is the caller's job (StoricoProvider/AggregatoreStorico).
 */
export class StoricoDocumentiService {
  constructor(private readonly provider: StoricoDatabaseProvider) {}

  perAlunno(alunnoEmail: string, tipo: string, profondita = 1): DocumentoStorico[] {
    const out: DocumentoStorico[] = [];
    for (const { anno, db } of this.provider.anniStorici(profondita)) {
      const logDocs: ILogDocumentoRepository = new LogDocumentoRepository(db);
      for (const doc of logDocs.findByUtente(Email.of(alunnoEmail))) {
        if (doc.idGen !== tipo) continue;
        out.push({ anno, nome: doc.nome, link: doc.getLink() });
      }
    }
    return out;
  }
}
