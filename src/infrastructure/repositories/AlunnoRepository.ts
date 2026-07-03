import { Alunno } from '../../domain/entities/Alunno';
import { AlunniInClasseSpec } from '../../domain/specifications/AlunnoSpecs';
import type { ClasseId } from '../../domain/value-objects/ClasseId';
import type { Email } from '../../domain/value-objects/Email';
import type { MateriaId } from '../../domain/value-objects/MateriaId';
import { TABLE } from '../../config/schema';

/**
 * ALUNNI repository on the DomainRepositoryLib Repository base. ALUNNI is an
 * operational table — loaded on demand, never cached whole (ref 06 §Caching).
 * Aggregate navigation (getCarenze/getPiani/getOreASL…) is wired once the
 * related repositories land later in R1.
 */
export class AlunnoRepository extends Repository<Alunno> {
  constructor(database: RepositoryDatabase) {
    super(database, TABLE.ALUNNI, Alunno);
  }

  private byCognomeNome(a: Alunno, b: Alunno): number {
    return a.cognomeNome.localeCompare(b.cognomeNome);
  }

  findByClasse(classeId: ClasseId): Alunno[] {
    const spec = new AlunniInClasseSpec(classeId);
    return this.findAll().filter((a) => spec.isSatisfiedBy(a)).sort((x, y) => this.byCognomeNome(x, y));
  }

  findAttivi(): Alunno[] {
    return this.findAll().filter((a) => a.isAttivo());
  }

  findAttiviInClasse(classeId: ClasseId): Alunno[] {
    return this.findByClasse(classeId).filter((a) => a.isAttivo());
  }

  getTutors(alunno: Alunno): Email[] {
    return alunno.getTutors();
  }

  getCurriculum(alunno: Alunno): Map<MateriaId, string[]> {
    return alunno.getCurriculum();
  }
}
