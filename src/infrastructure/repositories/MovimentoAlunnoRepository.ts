import { MovimentoAlunno } from '../../domain/entities/MovimentoAlunno';
import { MovimentiPerAlunnoSpec, MovimentiPerTipoSpec } from '../../domain/specifications/MovimentoAlunnoSpecs';
import type { Alunno } from '../../domain/entities/Alunno';
import type { TipoMovimento } from '../../domain/value-objects/enums';
import { TABLE } from '../../config/schema';

/**
 * MOV_ALUNNI repository on the DomainRepositoryLib Repository base. Composite PK
 * (STUDENTE, TIPO, DATA) — base single-key findById does not apply (ref 06 §15);
 * queries load rows and filter in memory. Append-only table.
 */
export class MovimentoAlunnoRepository extends Repository<MovimentoAlunno> {
  constructor(database: RepositoryDatabase) {
    super(database, TABLE.MOV_ALUNNI, MovimentoAlunno);
  }

  /** Movements of a student, most recent first (ref 06 §15). */
  findByAlunno(alunno: Alunno): MovimentoAlunno[] {
    const spec = new MovimentiPerAlunnoSpec(alunno.email);
    return this.findAll().filter((m) => spec.isSatisfiedBy(m)).sort((a, b) => b.data.localeCompare(a.data));
  }

  /** Movements of a given type (ref 06 §15). */
  findByTipo(tipo: TipoMovimento): MovimentoAlunno[] {
    const spec = new MovimentiPerTipoSpec(tipo);
    return this.findAll().filter((m) => spec.isSatisfiedBy(m));
  }
}
