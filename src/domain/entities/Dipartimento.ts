import { Email } from '../value-objects/Email';
import { MateriaId } from '../value-objects/MateriaId';
import { DipartimentoId } from '../value-objects/DipartimentoId';
import { COL_DIPART } from '../../config/schema';
import { AldoEntity } from './AldoEntity';

export type DipartimentoData = {
  [COL_DIPART.ID]?: string;
  [COL_DIPART.NOME]?: string;
  [COL_DIPART.CAPO]?: string;
  [COL_DIPART.MATERIE]?: string;
};

/**
 * DIPART entity (PK = ID). CAPO is a teacher email; MATERIE is a CSV of MateriaId
 * (ref 01/04). Cross-entity navigation to Docente/Materia is wired by services.
 */
export class Dipartimento extends AldoEntity {
  public readonly nome: string;
  private readonly capoRaw: string;
  private readonly materieRaw: string;

  constructor(data: DipartimentoData = {}) {
    super(data);
    this.id = data[COL_DIPART.ID] ?? null;
    this.nome = data[COL_DIPART.NOME] ?? '';
    const capo = data[COL_DIPART.CAPO];
    this.capoRaw = typeof capo === 'string' ? capo : '';
    const materie = data[COL_DIPART.MATERIE];
    this.materieRaw = typeof materie === 'string' ? materie : '';
  }

  get dipartimentoId(): DipartimentoId {
    return DipartimentoId.of(this.id ?? '');
  }

  getCapoEmail(): Email | null {
    return this.capoRaw.trim().length > 0 ? Email.of(this.capoRaw.trim()) : null;
  }

  getMaterieIds(): MateriaId[] {
    return this.materieRaw
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .map((s) => MateriaId.of(s));
  }

  override toData(): EntityData {
    return {
      [COL_DIPART.ID]: this.id,
      [COL_DIPART.NOME]: this.nome,
      [COL_DIPART.CAPO]: this.capoRaw,
      [COL_DIPART.MATERIE]: this.materieRaw
    };
  }

  static fromData(data: Record<string, unknown>): Dipartimento {
    return new Dipartimento(data);
  }
}
