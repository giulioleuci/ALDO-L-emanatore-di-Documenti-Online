import type { OreASL } from '../entities/OreASL';
import type { Alunno } from '../entities/Alunno';
import type { AnnoScolastico } from '../value-objects/AnnoScolastico';

export interface IOreASLRepository {
  /** Existing record, or a fresh in-memory record with ORE = 0 (ref 06 §16). */
  getOrCreate(alunno: Alunno, anno: AnnoScolastico): OreASL;
  /** Sum of hours across all the student's years (ref 06 §16). */
  getTotaleOre(alunno: Alunno): number;
}
