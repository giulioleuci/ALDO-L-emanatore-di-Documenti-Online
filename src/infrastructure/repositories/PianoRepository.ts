import { Piano } from '../../domain/entities/Piano';
import { PianiPerAlunnoSpec, PianiPerTipoSpec } from '../../domain/specifications/PianoSpecs';
import type { IPianoRepository } from '../../domain/repositories/IPianoRepository';
import { Email } from '../../domain/value-objects/Email';
import { EntityNotFoundError } from '../../domain/errors/DomainError';
import type { TipoPiano } from '../../domain/value-objects/enums';
import { TABLE, COL_PIANI } from '../../config/schema';

/**
 * PIANI repository on the DomainRepositoryLib Repository base. Composite PK
 * (STUDENTE, TIPO) — the base single-key findById does not apply (ref 06 §12);
 * queries load rows and filter in memory.
 */
export class PianoRepository extends Repository<Piano> implements IPianoRepository {
  constructor(database: RepositoryDatabase) {
    super(database, TABLE.PIANI, Piano);
    // O(1) hot-lookup index for findByAlunno (ref REPORT_GLF.md A2).
    database.tables[TABLE.PIANI]!.createIndex(COL_PIANI.STUDENTE);
  }

  findByAlunno(email: Email): Piano[] {
    const spec = new PianiPerAlunnoSpec(email);
    return this.find(spec);
  }

  findByTipo(tipo: TipoPiano): Piano[] {
    const spec = new PianiPerTipoSpec(tipo);
    return this.find(spec);
  }

  /**
   * Sets GENERATO=TRUE on the (STUDENTE, TIPO) row. Deliberately NOT
   * Repository.save(): that calls database.save(), which throws inside the
   * generation transaction. updateRowWhere only buffers, so the flag commits
   * (or rolls back) together with the LOG_DOCS row.
   */
  markGenerato(studente: string, tipo: TipoPiano): void {
    const piano = this.findByAlunno(Email.of(studente)).find((p) => p.tipo === tipo);
    if (piano === undefined)
      throw new EntityNotFoundError(`Piano ${studente}::${tipo} non trovato`);
    this.database.tables[TABLE.PIANI]!.updateRowWhere(
      { [COL_PIANI.STUDENTE]: studente, [COL_PIANI.TIPO]: tipo },
      { ...piano.toData(), [COL_PIANI.GENERATO]: true }
    );
  }

  /** Emails of students having at least one BES plan (feeds AlunniBESSpec). */
  getStudentiConBESEmails(): Set<string> {
    return new Set(
      this.findAll()
        .filter((p) => p.isBES())
        .map((p) => p.studente)
    );
  }
}
