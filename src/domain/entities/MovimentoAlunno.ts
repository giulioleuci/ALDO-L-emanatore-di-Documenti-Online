import { Email } from '../value-objects/Email';
import { TipoMovimento } from '../value-objects/enums';
import { COL_MOV_ALUNNI } from '../../config/schema';

export interface MovimentoAlunnoData {
  [key: string]: unknown;
}

/**
 * MOV_ALUNNI entity — append-only student-mobility record. Composite PK
 * (STUDENTE, TIPO, DATA); no single-column id (ref 01/04 §16). Part of the
 * Alunno aggregate (its mobility history).
 */
export class MovimentoAlunno extends Entity {
  public readonly studente: string;
  public readonly tipo: TipoMovimento;
  public readonly data: string;
  public readonly da: string;
  public readonly a: string;

  constructor(data: MovimentoAlunnoData = {}) {
    super(data);
    this.studente = typeof data[COL_MOV_ALUNNI.STUDENTE] === 'string' ? (data[COL_MOV_ALUNNI.STUDENTE] as string) : '';
    this.tipo = data[COL_MOV_ALUNNI.TIPO] as TipoMovimento;
    this.data = typeof data[COL_MOV_ALUNNI.DATA] === 'string' ? (data[COL_MOV_ALUNNI.DATA] as string) : '';
    this.da = typeof data[COL_MOV_ALUNNI.DA] === 'string' ? (data[COL_MOV_ALUNNI.DA] as string) : '';
    this.a = typeof data[COL_MOV_ALUNNI.A] === 'string' ? (data[COL_MOV_ALUNNI.A] as string) : '';
    this.id = this.studente && this.tipo && this.data ? `${this.studente}::${this.tipo}::${this.data}` : null;
  }

  get studenteEmail(): Email { return Email.of(this.studente); }

  isIngresso(): boolean { return this.tipo === TipoMovimento.IN; }
  isUscita(): boolean { return this.tipo === TipoMovimento.OUT; }
  isCambioClasse(): boolean { return this.tipo === TipoMovimento.CAMBIO; }

  override toData(): EntityData {
    return {
      [COL_MOV_ALUNNI.STUDENTE]: this.studente,
      [COL_MOV_ALUNNI.TIPO]: this.tipo,
      [COL_MOV_ALUNNI.DATA]: this.data,
      [COL_MOV_ALUNNI.DA]: this.da,
      [COL_MOV_ALUNNI.A]: this.a
    };
  }

  static fromData(data: MovimentoAlunnoData): MovimentoAlunno {
    return new MovimentoAlunno(data);
  }
}
