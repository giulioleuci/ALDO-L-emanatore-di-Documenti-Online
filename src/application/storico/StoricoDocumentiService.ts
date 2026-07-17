import type { StoricoDatabaseProvider } from './StoricoDatabaseProvider';
import { LogDocumentoRepository } from '../../infrastructure/repositories/LogDocumentoRepository';
import type { ILogDocumentoRepository } from '../../domain/repositories/ILogDocumentoRepository';
import { Email } from '../../domain/value-objects/Email';

export interface DocumentoStorico {
  anno: string;
  nome: string;
  link: string;
}

/** `DocumentoStorico` tagged with its generator id (`LOG_DOCS.ID_GEN`, matched against `CONF_DOC.TIPO`) — feeds `perAlunnoConTipo` (11 §11). */
export interface DocumentoStoricoConTipo extends DocumentoStorico {
  tipo: string;
}

/**
 * StoricoDocumentiService (13 §4): documents already generated for a student
 * of a given type (`CONF_DOC.TIPO`, matched against `LOG_DOCS.ID_GEN`) in
 * prior school years. Feeds the `documenti` box's `arricchisciConStorico`
 * mode (11 §11, 14 §3) as `{ corrente, storico: LazyRef }` — the LazyRef
 * wrapping is the caller's job (`DocumentiStoricoProvider`).
 */
export class StoricoDocumentiService {
  constructor(private readonly provider: StoricoDatabaseProvider) {}

  perAlunno(alunnoEmail: string, tipo: string, profondita = 1): DocumentoStorico[] {
    return this.tutti(alunnoEmail, profondita)
      .filter((d) => d.tipo === tipo)
      .map(({ anno, nome, link }) => ({ anno, nome, link }));
  }

  /** Every prior-year document regardless of TIPO, each tagged with its ID_GEN — the `documenti` box groups these by the current item's `idGen` at render time (11 §11). */
  perAlunnoConTipo(alunnoEmail: string, profondita = 1): DocumentoStoricoConTipo[] {
    return this.tutti(alunnoEmail, profondita);
  }

  private tutti(alunnoEmail: string, profondita: number): DocumentoStoricoConTipo[] {
    const out: DocumentoStoricoConTipo[] = [];
    for (const { anno, db } of this.provider.anniStorici(profondita)) {
      const logDocs: ILogDocumentoRepository = new LogDocumentoRepository(db);
      for (const doc of logDocs.findByUtente(Email.of(alunnoEmail))) {
        out.push({ anno, nome: doc.nome, link: doc.getLink(), tipo: doc.idGen });
      }
    }
    return out;
  }
}
