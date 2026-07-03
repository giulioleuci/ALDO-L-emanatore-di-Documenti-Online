import { ValidationError } from '../errors/DomainError';

/** DIPART.ID — non-empty string (ref 03). */
export class DipartimentoId {
  private constructor(public readonly value: string) {}
  static of(raw: string): DipartimentoId {
    if (typeof raw !== 'string' || raw.trim().length === 0) {
      throw new ValidationError(`DipartimentoId non valido: "${raw}"`);
    }
    return new DipartimentoId(raw.trim());
  }
  equals(other: DipartimentoId): boolean {
    return this.value === other.value;
  }
}
