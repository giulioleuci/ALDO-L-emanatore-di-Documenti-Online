import type { MasterConfig } from '../entities/MasterConfig';

export interface IMasterSheetRepository {
  /** Current-year config: the first (top) row of the descending-ordered sheet (ref 06 §0). */
  findConfigAnnoCorrente(): MasterConfig;
  /** Up to `limit` historical years — the rows after the first (ref 06 §0). */
  findAnniStorici(limit: number): MasterConfig[];
}
