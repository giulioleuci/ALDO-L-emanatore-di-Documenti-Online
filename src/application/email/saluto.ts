import type { Docente } from '../../domain/entities/Docente';
import type { Alunno } from '../../domain/entities/Alunno';

/**
 * A logical email recipient produced by EmailNotificationService enumeration
 * (11 §3) and consumed by the NotificaPipeline steps: the CDU entry point plus
 * the candidate addresses before supplente resolution (11 §7).
 */
export interface EmailTarget {
  tipo: 'docente' | 'cdc' | 'alunno' | 'genitori';
  tipoTarget: 'classe' | 'alunno';
  /** ClasseId value or alunno email — the CDU build entry point. */
  target: string;
  /** For docente targets: the titolare being addressed. */
  docenteEmail?: string;
  /** Raw candidate emails (docente / CdC docenti / alunno / tutors). */
  emails: string[];
  /** For coordinatore multi-classe: every coordinated class id (11 §12). */
  classiCompetenza: string[];
  /** For the PER_CARENZA pipeline: the CARENZE progressivo in focus (02 §4.3). */
  carenzaProgressivo?: number;
}

/**
 * Polymorphic greeting (11 §6): single docente with appellativo, single alunno
 * by name, plural for families and CdC groups, `Gentile Utente` when there is
 * nobody to address, `Gentili Destinatari` when a multiple is not uniform.
 */
export function salutoPerTarget(target: EmailTarget, docente: Docente | null, alunno: Alunno | null): string {
  if (target.emails.length === 0) return 'Gentile Utente';
  switch (target.tipo) {
    case 'genitori':
      return 'Gentili Genitori';
    case 'cdc':
      return 'Gentili Docenti';
    case 'docente':
      return docente === null ? 'Gentili Destinatari' : `Gentile ${docente.getNomeCompletoConAppellativo()}`;
    case 'alunno':
      return alunno === null ? 'Gentili Destinatari' : `Gentile ${alunno.cognomeNome}`;
  }
}
