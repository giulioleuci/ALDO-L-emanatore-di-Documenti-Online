import { Dipartimento } from '../../domain/entities/Dipartimento';
import type { DipartimentoId } from '../../domain/value-objects/DipartimentoId';
import type { MateriaId } from '../../domain/value-objects/MateriaId';
import type { Email } from '../../domain/value-objects/Email';
import { TABLE } from '../../config/schema';

/**
 * DIPART repository on the DomainRepositoryLib Repository base. Small, stable
 * lookup table: loaded once and cached for the session (ref 06 §6/§Caching).
 * getCapo()→Docente and getDocenti() are wired once DocenteRepository lands (R2);
 * here we expose the CAPO email and the department's MateriaId list.
 */
export class DipartimentoRepository extends Repository<Dipartimento> {
  private cache: Dipartimento[] | null = null;

  constructor(database: RepositoryDatabase) {
    super(database, TABLE.DIPART, Dipartimento);
  }

  private all(): Dipartimento[] {
    if (this.cache === null) this.cache = this.findAll();
    return this.cache;
  }

  findAllCached(): Dipartimento[] {
    return this.all().slice();
  }

  findByIdCached(id: DipartimentoId): Dipartimento | null {
    return this.all().find((d) => d.id === id.value) ?? null;
  }

  getCapoEmail(id: DipartimentoId): Email | null {
    return this.findByIdCached(id)?.getCapoEmail() ?? null;
  }

  getMaterieIds(id: DipartimentoId): MateriaId[] {
    return this.findByIdCached(id)?.getMaterieIds() ?? [];
  }
}
