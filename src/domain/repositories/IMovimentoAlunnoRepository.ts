import type { MovimentoAlunno } from '../entities/MovimentoAlunno';
import type { Alunno } from '../entities/Alunno';

export interface IMovimentoAlunnoRepository {
  /** Movements of a student, most recent first (ref 06 §15). */
  findByAlunno(alunno: Alunno): MovimentoAlunno[];
  /** All movements through the inclusive date, most recent first. */
  findEntro(dataInclusiva: string): MovimentoAlunno[];
}
