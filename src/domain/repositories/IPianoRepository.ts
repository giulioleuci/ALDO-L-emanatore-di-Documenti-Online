import type { Piano } from '../entities/Piano';
import type { Email } from '../value-objects/Email';
import type { TipoPiano } from '../value-objects/enums';

export interface IPianoRepository {
  findByAlunno(email: Email): Piano[];
  /** Sets PIANI.GENERATO=TRUE for the plan (STUDENTE, TIPO); joins the open transaction. */
  markGenerato(studente: string, tipo: TipoPiano): void;
}
