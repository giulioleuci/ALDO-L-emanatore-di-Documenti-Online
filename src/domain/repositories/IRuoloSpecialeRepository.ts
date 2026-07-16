import type { RuoloSpeciale } from '../entities/RuoloSpeciale';

export interface IRuoloSpecialeRepository {
  findAllCached(): RuoloSpeciale[];
  /** Inherited from GasLibraryFactory's ambient base `Repository<RuoloSpeciale>`. */
  findById(id: string): RuoloSpeciale | null;
}
