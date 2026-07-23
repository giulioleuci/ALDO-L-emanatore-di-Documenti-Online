import { Email } from '../value-objects/Email';
import { ClasseId } from '../value-objects/ClasseId';
import { MateriaId } from '../value-objects/MateriaId';
import { ReligioneScelta } from '../value-objects/enums';
import { COL_ALUNNI } from '../../config/schema';
import { AldoEntity } from './AldoEntity';

export interface AlunnoData {
  [key: string]: unknown;
}

/**
 * ALUNNI entity (PK = EMAIL). Root of the student aggregate (ref 04/05). For
 * articulated classes, CLASSE holds the partner-class id (ref 01).
 */
export class Alunno extends AldoEntity {
  public readonly cognomeNome: string;
  public readonly classe: string;
  public readonly religione: ReligioneScelta;
  private readonly attivo: boolean;
  private readonly ripetente: boolean;
  private readonly rappresentante: boolean;
  private readonly tutor1: string;
  private readonly tutor2: string;
  private readonly rapprGen: string;
  private readonly curriculumRaw: string | null;

  constructor(data: AlunnoData = {}) {
    super(data);
    this.id = (data[COL_ALUNNI.EMAIL] as string) ?? null;
    this.cognomeNome = (data[COL_ALUNNI.COGNOMENOME] as string) ?? '';
    this.classe = (data[COL_ALUNNI.CLASSE] as string) ?? '';
    this.religione = (data[COL_ALUNNI.RELIGIONE] as ReligioneScelta) ?? ReligioneScelta.SI;
    this.attivo = data[COL_ALUNNI.ATTIVO] === true;
    this.ripetente = data[COL_ALUNNI.RIPETENTE] === true;
    this.rappresentante = data[COL_ALUNNI.RAPPR_STUD] === true;
    this.tutor1 =
      typeof data[COL_ALUNNI.TUTOR_1] === 'string' ? (data[COL_ALUNNI.TUTOR_1] as string) : '';
    this.tutor2 =
      typeof data[COL_ALUNNI.TUTOR_2] === 'string' ? (data[COL_ALUNNI.TUTOR_2] as string) : '';
    this.rapprGen =
      typeof data[COL_ALUNNI.RAPPR_GEN] === 'string' ? (data[COL_ALUNNI.RAPPR_GEN] as string) : '';
    this.curriculumRaw =
      typeof data[COL_ALUNNI.CURRICULUM] === 'string'
        ? (data[COL_ALUNNI.CURRICULUM] as string)
        : null;
  }

  get email(): Email {
    return Email.of(this.id ?? '');
  }
  get classeId(): ClasseId {
    return ClasseId.of(this.classe);
  }

  isAttivo(): boolean {
    return this.attivo;
  }
  isRipetente(): boolean {
    return this.ripetente;
  }
  isRappresentante(): boolean {
    return this.rappresentante;
  }

  /** Free-text parent representative name (ALUNNI.RAPPR_GEN); '' when none (ref 01, 02 §4.1). */
  getRappresentanteGenitore(): string {
    return this.rapprGen;
  }

  /** Non-empty tutor emails (TUTOR_1, TUTOR_2). */
  getTutors(): Email[] {
    return [this.tutor1, this.tutor2]
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .map((s) => Email.of(s));
  }

  /** CURRICULUM JSON → map of MateriaId → chosen specificità (ref 01). */
  getCurriculum(): Map<MateriaId, string[]> {
    const map = new Map<MateriaId, string[]>();
    if (this.curriculumRaw === null || this.curriculumRaw.trim() === '') return map;
    const parsed = JSON.parse(this.curriculumRaw) as Record<string, unknown>;
    for (const [materia, specifiche] of Object.entries(parsed)) {
      map.set(MateriaId.of(materia), Array.isArray(specifiche) ? (specifiche as string[]) : []);
    }
    return map;
  }

  override toData(): EntityData {
    return {
      [COL_ALUNNI.EMAIL]: this.id,
      [COL_ALUNNI.COGNOMENOME]: this.cognomeNome,
      [COL_ALUNNI.CLASSE]: this.classe,
      [COL_ALUNNI.RELIGIONE]: this.religione,
      [COL_ALUNNI.CURRICULUM]: this.curriculumRaw,
      [COL_ALUNNI.ATTIVO]: this.attivo,
      [COL_ALUNNI.RIPETENTE]: this.ripetente,
      [COL_ALUNNI.RAPPR_STUD]: this.rappresentante,
      [COL_ALUNNI.TUTOR_1]: this.tutor1,
      [COL_ALUNNI.TUTOR_2]: this.tutor2,
      [COL_ALUNNI.RAPPR_GEN]: this.rapprGen
    };
  }

  static fromData(data: AlunnoData): Alunno {
    return new Alunno(data);
  }
}
