import { Progetto } from '../../domain/entities/Progetto';
import { ProgettiPerClasseSpec } from '../../domain/specifications/ProgettoSpecs';
import type { Classe } from '../../domain/entities/Classe';
import { TABLE, COL_PROGETTI } from '../../config/schema';

/**
 * PROGETTI repository on the DomainRepositoryLib Repository base. Composite PK
 * (CLASSE, TIPO, NOME) — base single-key findById does not apply (ref 06 §13);
 * queries load rows and filter in memory.
 */
export class ProgettoRepository extends Repository<Progetto> {
  constructor(database: RepositoryDatabase) {
    super(database, TABLE.PROGETTI, Progetto);
    // O(1) hot-lookup index for findByClasse (ref REPORT_GLF.md A2).
    database.tables[TABLE.PROGETTI]!.createIndex(COL_PROGETTI.CLASSE);
  }

  /** Projects assigned to a class (ref 06 §13). */
  findByClasse(classe: Classe): Progetto[] {
    const spec = new ProgettiPerClasseSpec(classe.classeId);
    return this.find(spec);
  }
}
