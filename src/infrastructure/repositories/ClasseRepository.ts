import type { IClasseRepository, RepoRow } from '../../domain/repositories/IClasseRepository';
import { Classe } from '../../domain/entities/Classe';
import { Docente } from '../../domain/entities/Docente';
import { ConsiglioDiClasse, type Cattedra } from '../../domain/entities/ConsiglioDiClasse';
import { ClasseId } from '../../domain/value-objects/ClasseId';
import { MateriaId } from '../../domain/value-objects/MateriaId';
import { AlunniAttiviSpec } from '../../domain/specifications/AlunniAttiviSpec';
import { TABLE, COL_DOCENTI, COL_MATERIE, COL_ALUNNI } from '../../config/schema';
import { EntityNotFoundError } from '../../domain/errors/DomainError';

/**
 * CLASSI repository on the DomainRepositoryLib Repository base. Standard CRUD
 * (findById/findAll/find/save…) comes from the base; the SGSA-specific queries
 * below read cross-table rows through the injected database's `tables` seam.
 */
export class ClasseRepository extends Repository<Classe> implements IClasseRepository {
  constructor(database: RepositoryDatabase) {
    super(database, TABLE.CLASSI, Classe);
  }

  // Base findById takes a string PK; accept a ClasseId too for domain callers.
  // Hydration runs Classe.fromData → the constructor fails loud on malformed rows.
  override findById(id: string | ClasseId): Classe | null {
    return super.findById(typeof id === 'string' ? id : id.value);
  }

  getConsiglioDiClasse(id: ClasseId): ConsiglioDiClasse {
    const classe = this.database.tables[TABLE.CLASSI]!.getByPK(id.value);
    if (!classe) throw new EntityNotFoundError(`Classe ${id.value} non trovata`);
    const materie = this.database.tables[TABLE.MATERIE]!.getAllRows();
    const docentiByEmail = this.indexDocenti();
    const cattedre: Cattedra[] = [];
    for (const m of materie) {
      const materiaId = String(m[COL_MATERIE.ID]);
      const cellEmail = classe[materiaId];
      if (typeof cellEmail !== 'string' || cellEmail.trim() === '') continue;
      const docente = docentiByEmail.get(cellEmail.trim());
      if (!docente) throw new EntityNotFoundError(`Docente ${cellEmail} (materia ${materiaId}) non in DOCENTI`);
      cattedre.push({ materia: MateriaId.of(materiaId), docente });
    }
    return new ConsiglioDiClasse(cattedre);
  }

  getAlunniAttivi(id: ClasseId): RepoRow[] {
    const spec = new AlunniAttiviSpec();
    const rows = this.database.tables[TABLE.ALUNNI]!.getAllRows() as unknown as RepoRow[];
    return rows.filter((r) => r[COL_ALUNNI.CLASSE] === id.value && spec.isSatisfiedBy(r));
  }

  private indexDocenti(): Map<string, Docente> {
    const map = new Map<string, Docente>();
    for (const d of this.database.tables[TABLE.DOCENTI]!.getAllRows()) {
      map.set(String(d[COL_DOCENTI.EMAIL]), Docente.fromData(d));
    }
    return map;
  }
}
