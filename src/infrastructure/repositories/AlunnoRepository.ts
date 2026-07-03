import { Alunno } from '../../domain/entities/Alunno';
import { AlunniInClasseSpec } from '../../domain/specifications/AlunnoSpecs';
import { CarenzaRepository } from './CarenzaRepository';
import { PianoRepository } from './PianoRepository';
import { OreASLRepository } from './OreASLRepository';
import { MovimentoAlunnoRepository } from './MovimentoAlunnoRepository';
import type { Carenza } from '../../domain/entities/Carenza';
import type { Piano } from '../../domain/entities/Piano';
import type { MovimentoAlunno } from '../../domain/entities/MovimentoAlunno';
import type { ClasseId } from '../../domain/value-objects/ClasseId';
import type { Email } from '../../domain/value-objects/Email';
import type { MateriaId } from '../../domain/value-objects/MateriaId';
import type { AnnoScolastico } from '../../domain/value-objects/AnnoScolastico';
import { TABLE } from '../../config/schema';

/**
 * ALUNNI repository on the DomainRepositoryLib Repository base — the Alunno
 * aggregate root (ref 06 §1). ALUNNI is an operational table, loaded on demand
 * and never cached whole. Aggregate navigation into the member tables delegates
 * to their repositories, built over the same database. The ClasseRepository-
 * dependent methods (getClasse/getIndirizzoStudente/articolazione) land in R2.
 */
export class AlunnoRepository extends Repository<Alunno> {
  private readonly carenze: CarenzaRepository;
  private readonly piani: PianoRepository;
  private readonly oreAsl: OreASLRepository;
  private readonly movimenti: MovimentoAlunnoRepository;

  constructor(database: RepositoryDatabase) {
    super(database, TABLE.ALUNNI, Alunno);
    this.carenze = new CarenzaRepository(database);
    this.piani = new PianoRepository(database);
    this.oreAsl = new OreASLRepository(database);
    this.movimenti = new MovimentoAlunnoRepository(database);
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

  /** Students with at least one BES plan (ref 06 §1). Delegates to PianoRepository. */
  findConBES(): Alunno[] {
    const besEmails = this.piani.getStudentiConBESEmails();
    return this.findAll().filter((a) => besEmails.has(a.email.value)).sort((x, y) => this.byCognomeNome(x, y));
  }

  getTutors(alunno: Alunno): Email[] {
    return alunno.getTutors();
  }

  getCurriculum(alunno: Alunno): Map<MateriaId, string[]> {
    return alunno.getCurriculum();
  }

  // --- Aggregate navigation (ref 06 §1) ---

  /** Shortfalls of the student, optionally filtered by school year. */
  getCarenze(alunno: Alunno, options?: { annoScolastico?: AnnoScolastico }): Carenza[] {
    return this.carenze.findByAlunno(alunno, options);
  }

  /** Personalized plans of the student. */
  getPiani(alunno: Alunno): Piano[] {
    return this.piani.findByAlunno(alunno.email);
  }

  /** Total ASL/PCTO hours across all the student's years. */
  getOreASLTotali(alunno: Alunno): number {
    return this.oreAsl.getTotaleOre(alunno);
  }

  /** Full mobility history, most recent first. */
  getStoricoMovimenti(alunno: Alunno): MovimentoAlunno[] {
    return this.movimenti.findByAlunno(alunno);
  }
}
