import { ValidationError } from '../errors/DomainError';

/** INDIRIZZI.ID — non-empty string, no pattern constraint (ref 03). */
export class IndirizzoId {
  private constructor(public readonly value: string) {}
  static of(raw: string): IndirizzoId {
    if (typeof raw !== 'string' || raw.trim().length === 0) {
      throw new ValidationError(`IndirizzoId non valido: "${raw}"`);
    }
    return new IndirizzoId(raw.trim());
  }
  equals(other: IndirizzoId): boolean {
    return this.value === other.value;
  }
}
