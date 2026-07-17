import { MovimentoAlunno } from '../../domain/entities/MovimentoAlunno';
import {
  MovimentiPerAlunnoSpec,
  MovimentiPerTipoSpec
} from '../../domain/specifications/MovimentoAlunnoSpecs';
import type { IMovimentoAlunnoRepository } from '../../domain/repositories/IMovimentoAlunnoRepository';
import type { Alunno } from '../../domain/entities/Alunno';
import type { TipoMovimento } from '../../domain/value-objects/enums';
import { TABLE, COL_MOV_ALUNNI } from '../../config/schema';

/**
 * MOV_ALUNNI repository on the DomainRepositoryLib Repository base. Composite PK
 * (STUDENTE, TIPO, DATA) — base single-key findById does not apply (ref 06 §15);
 * queries load rows and filter in memory. Append-only table.
 */
export class MovimentoAlunnoRepository
  extends Repository<MovimentoAlunno>
  implements IMovimentoAlunnoRepository
{
  constructor(database: RepositoryDatabase) {
    super(database, TABLE.MOV_ALUNNI, MovimentoAlunno);
    // O(1) hot-lookup index for findByAlunno (ref REPORT_GLF.md A2).
    database.tables[TABLE.MOV_ALUNNI]!.createIndex(COL_MOV_ALUNNI.STUDENTE);
  }

  /** Movements of a student, most recent first (ref 06 §15). */
  findByAlunno(alunno: Alunno): MovimentoAlunno[] {
    const spec = new MovimentiPerAlunnoSpec(alunno.email);
    return this.find(spec).sort((a, b) => b.data.localeCompare(a.data));
  }

  /** Movements of a given type (ref 06 §15). */
  findByTipo(tipo: TipoMovimento): MovimentoAlunno[] {
    const spec = new MovimentiPerTipoSpec(tipo);
    return this.find(spec);
  }
}
