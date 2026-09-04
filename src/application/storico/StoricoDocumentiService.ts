import type { StoricoDatabaseProvider } from './StoricoDatabaseProvider';
import { Email } from '../../domain/value-objects/Email';
import { ValidationError } from '../../domain/errors/DomainError';

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

function matchesLogDocsCriterion(
  doc: import('../../domain/entities/LogDocumento').LogDocumento,
  column: string,
  value: string
): boolean {
  switch (column) {
    case 'UTENTI':
      return value === '' || doc.containsUtente(value);
    case 'CLASSI':
      return value === '' || doc.containsClasse(value);
    case 'MATERIE':
      return value === '' || doc.containsMateria(value);
    case 'ID_GEN':
      return doc.idGen === value;
    case 'TIPO':
      return doc.tipo === value;
    case 'SOTTOTIPO':
      return doc.getSottotipo() === value;
    default:
      throw new ValidationError(`Unsupported LOG_DOCS criterion: ${column}`);
  }
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

  idsMatching(criteri: Record<string, string>, profondita: number): string[] {
    return this.provider.anniStorici(profondita).flatMap(({ logDocs }) =>
      logDocs.findAll().flatMap((doc) =>
        doc.id !== null &&
        Object.entries(criteri).every(([column, value]) =>
          matchesLogDocsCriterion(doc, column, value)
        )
          ? [doc.id]
          : []
      )
    );
  }

  private tutti(alunnoEmail: string, profondita: number): DocumentoStoricoConTipo[] {
    const out: DocumentoStoricoConTipo[] = [];
    for (const { anno, logDocs } of this.provider.anniStorici(profondita)) {
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
