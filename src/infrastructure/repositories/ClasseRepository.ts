import type { IDatabase } from '../db/Database';
import type { IClasseRepository, RepoRow } from '../../domain/repositories/IClasseRepository';
import { Classe } from '../../domain/entities/Classe';
import { Docente } from '../../domain/entities/Docente';
import { ConsiglioDiClasse, type Cattedra } from '../../domain/entities/ConsiglioDiClasse';
import { ClasseId } from '../../domain/value-objects/ClasseId';
import { AnnoCorso } from '../../domain/value-objects/AnnoCorso';
import { Email } from '../../domain/value-objects/Email';
import { MateriaId } from '../../domain/value-objects/MateriaId';
import { Genere } from '../../domain/value-objects/enums';
import { AlunniAttiviSpec } from '../../domain/specifications/AlunniAttiviSpec';
import { TABLE, COL_CLASSI, COL_DOCENTI, COL_MATERIE, COL_ALUNNI } from '../../config/schema';
import { EntityNotFoundError } from '../../domain/errors/DomainError';

export class ClasseRepository implements IClasseRepository {
  constructor(private readonly db: IDatabase) {}

  findById(id: ClasseId): Classe | null {
    const row = this.db.table(TABLE.CLASSI).find((r) => r[COL_CLASSI.ID] === id.value);
    if (!row) return null;
    return new Classe(id, String(row[COL_CLASSI.ID]), AnnoCorso.of(Number(row[COL_CLASSI.ANNO])), String(row[COL_CLASSI.INDIRIZZO]));
  }

  getConsiglioDiClasse(id: ClasseId): ConsiglioDiClasse {
    const classe = this.db.table(TABLE.CLASSI).find((r) => r[COL_CLASSI.ID] === id.value);
    if (!classe) throw new EntityNotFoundError(`Classe ${id.value} non trovata`);
    const materie = this.db.table(TABLE.MATERIE).findAll();
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
    return this.db.table(TABLE.ALUNNI)
      .findAll()
      .filter((r) => r[COL_ALUNNI.CLASSE] === id.value && spec.isSatisfiedBy(r));
  }

  private indexDocenti(): Map<string, Docente> {
    const map = new Map<string, Docente>();
    for (const d of this.db.table(TABLE.DOCENTI).findAll()) {
      const email = String(d[COL_DOCENTI.EMAIL]);
      map.set(email, new Docente(Email.of(email), String(d[COL_DOCENTI.COGNOME]), String(d[COL_DOCENTI.NOME]), (d[COL_DOCENTI.GENERE] === 'M' ? Genere.M : Genere.F)));
    }
    return map;
  }
}
