import { ValidationError } from '../errors/DomainError';

export class ClasseId {
  private constructor(public readonly value: string) {}
  static of(raw: string): ClasseId {
    if (typeof raw !== 'string' || raw.trim().length === 0) {
      throw new ValidationError(`ClasseId non valido: "${raw}"`);
    }
    return new ClasseId(raw.trim());
  }
  equals(other: ClasseId): boolean {
    return this.value === other.value;
  }
}
