import { Piano } from '../../domain/entities/Piano';
import { PianiPerAlunnoSpec, PianiPerTipoSpec } from '../../domain/specifications/PianoSpecs';
import type { Email } from '../../domain/value-objects/Email';
import type { TipoPiano } from '../../domain/value-objects/enums';
import { TABLE, COL_PIANI } from '../../config/schema';

/**
 * PIANI repository on the DomainRepositoryLib Repository base. Composite PK
 * (STUDENTE, TIPO) — the base single-key findById does not apply (ref 06 §12);
 * queries load rows and filter in memory.
 */
export class PianoRepository extends Repository<Piano> {
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

  /** Emails of students having at least one BES plan (feeds AlunniBESSpec). */
  getStudentiConBESEmails(): Set<string> {
    return new Set(this.findAll().filter((p) => p.isBES()).map((p) => p.studente));
  }
}
