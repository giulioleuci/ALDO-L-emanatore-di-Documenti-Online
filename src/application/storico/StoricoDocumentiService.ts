import type { StoricoDatabaseProvider } from './StoricoDatabaseProvider';
import { LogDocumentoRepository } from '../../infrastructure/repositories/LogDocumentoRepository';
import type { ILogDocumentoRepository } from '../../domain/repositories/ILogDocumentoRepository';
import { Email } from '../../domain/value-objects/Email';

export interface DocumentoStorico {
  anno: string;
  nome: string;
  link: string;
}

/** Historical LOG_DOCS metadata used by both generic-document and personalized-plan boxes. */
export interface DocumentoStoricoConTipo extends DocumentoStorico {
  /** LOG_DOCS.TIPO, the document family. */
  tipo: string;
  /** LOG_DOCS.SOTTOTIPO, used to separate PEI/PDP plan history. */
  sottotipo: string;
  /** LOG_DOCS.ID_GEN, retained for generic document-history matching. */
  idGen: string;
  /** Set by class-level aggregation to retain the source student's identity. */
  studenteEmail?: string;
}

/**
 * StoricoDocumentiService (13 §4): documents already generated for a student
 * for a given generator id (matched against `LOG_DOCS.ID_GEN`) in prior school
 * years. Family (`LOG_DOCS.TIPO`), subtype, and generator id remain separate
 * metadata in `perAlunnoConTipo`. Feeds the `documenti` box's
 * `arricchisciConStorico` mode (11 §11, 14 §3) as
 * `{ corrente, storico: LazyRef }` — the LazyRef wrapping is the caller's job
 * (`DocumentiStoricoProvider`).
 */
export class StoricoDocumentiService {
  constructor(private readonly provider: StoricoDatabaseProvider) {}

  perAlunno(alunnoEmail: string, tipo: string, profondita = 1): DocumentoStorico[] {
    return this.tutti(alunnoEmail, profondita)
      .filter((d) => d.idGen === tipo)
      .map(({ anno, nome, link }) => ({ anno, nome, link }));
  }

  /** Every prior-year document, with family, subtype and generator id kept separate. */
  perAlunnoConTipo(alunnoEmail: string, profondita = 1): DocumentoStoricoConTipo[] {
    return this.tutti(alunnoEmail, profondita);
  }

  private tutti(alunnoEmail: string, profondita: number): DocumentoStoricoConTipo[] {
    const out: DocumentoStoricoConTipo[] = [];
    for (const { anno, db } of this.provider.anniStorici(profondita)) {
      const logDocs: ILogDocumentoRepository = new LogDocumentoRepository(db);
      for (const doc of logDocs.findByUtente(Email.of(alunnoEmail))) {
        out.push({
          anno,
          nome: doc.nome,
          link: doc.getLink(),
          tipo: doc.tipo,
          sottotipo: doc.getSottotipo(),
          idGen: doc.idGen
        });
      }
    }
    return out;
  }
}
