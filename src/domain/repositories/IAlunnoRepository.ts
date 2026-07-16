import type { Alunno } from '../entities/Alunno';
import type { Carenza } from '../entities/Carenza';
import type { Piano } from '../entities/Piano';
import type { AnnoScolastico } from '../value-objects/AnnoScolastico';

export interface IAlunnoRepository {
  /** Inherited from GasLibraryFactory's ambient base `Repository<Alunno>`. */
  findById(id: string): Alunno | null;
  findAttivi(): Alunno[];

  // --- Aggregate navigation (ref 06 §1) ---

  /** Shortfalls of the student, optionally filtered by school year. */
  getCarenze(alunno: Alunno, options?: { annoScolastico?: AnnoScolastico }): Carenza[];
  /** Personalized plans of the student. */
  getPiani(alunno: Alunno): Piano[];
  /** Total ASL/PCTO hours across all the student's years. */
  getOreASLTotali(alunno: Alunno): number;
}
