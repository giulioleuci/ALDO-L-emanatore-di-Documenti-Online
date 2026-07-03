import { Progetto } from '../../domain/entities/Progetto';
import { ProgettiPerClasseSpec, ProgettiPerTipoSpec } from '../../domain/specifications/ProgettoSpecs';
import type { Classe } from '../../domain/entities/Classe';
import type { TipoProgetto } from '../../domain/value-objects/enums';
import { TABLE } from '../../config/schema';

/**
 * PROGETTI repository on the DomainRepositoryLib Repository base. Composite PK
 * (CLASSE, TIPO, NOME) — base single-key findById does not apply (ref 06 §13);
 * queries load rows and filter in memory.
 */
export class ProgettoRepository extends Repository<Progetto> {
  constructor(database: RepositoryDatabase) {
    super(database, TABLE.PROGETTI, Progetto);
  }

  /** Projects assigned to a class (ref 06 §13). */
  findByClasse(classe: Classe): Progetto[] {
    const spec = new ProgettiPerClasseSpec(classe.classeId);
    return this.findAll().filter((p) => spec.isSatisfiedBy(p));
  }

  /** Projects of a given type (ref 06 §13). */
  findByTipo(tipo: TipoProgetto): Progetto[] {
    const spec = new ProgettiPerTipoSpec(tipo);
    return this.findAll().filter((p) => spec.isSatisfiedBy(p));
  }
}
