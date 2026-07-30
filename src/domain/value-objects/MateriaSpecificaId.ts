import { ValidationError } from '../errors/DomainError';
import { MateriaId } from './MateriaId';

const MATERIA_SPECIFICA_RE = /^([A-Z]{2,10})\.([A-Z][A-Z0-9_]{1,19})$/;

/**
 * `MATERIA.SPECIFICA` composite id (e.g. `INTERPRET.CHITARRA`), distinct from
 * bare `MateriaId` at the type level (design 2026-07-30 §Identifier shape).
 */
export class MateriaSpecificaId {
  private constructor(
    public readonly value: string,
    private readonly materiaPart: string,
    private readonly specificaPart: string
  ) {}

  static of(raw: string): MateriaSpecificaId {
    const match = typeof raw === 'string' ? MATERIA_SPECIFICA_RE.exec(raw) : null;
    if (match === null) {
      throw new ValidationError(`MateriaSpecificaId non valido (MATERIA.SPECIFICA): "${raw}"`);
    }
    return new MateriaSpecificaId(raw, match[1]!, match[2]!);
  }

  materia(): MateriaId {
    return MateriaId.of(this.materiaPart);
  }

  specifica(): string {
    return this.specificaPart;
  }

  equals(other: MateriaSpecificaId): boolean {
    return this.value === other.value;
  }
}
