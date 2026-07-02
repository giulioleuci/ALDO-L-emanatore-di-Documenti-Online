import { ValidationError } from '../errors/DomainError';

const MATERIA_RE = /^[A-Z]{2,10}$/;

export class MateriaId {
  private constructor(public readonly value: string) {}
  static of(raw: string): MateriaId {
    if (typeof raw !== 'string' || !MATERIA_RE.test(raw)) {
      throw new ValidationError(`MateriaId non valido (maiuscolo, 2-10): "${raw}"`);
    }
    return new MateriaId(raw);
  }
  equals(other: MateriaId): boolean {
    return this.value === other.value;
  }
}
