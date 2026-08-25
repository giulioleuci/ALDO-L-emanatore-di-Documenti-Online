import { ValidationError } from '../errors/DomainError';

export function stringId(name: string, pattern?: RegExp) {
  return class StringId {
    protected constructor(public readonly value: string) {}

    static of(raw: string): StringId {
      const value = typeof raw === 'string' ? raw.trim() : '';
      if (value.length === 0 || (pattern !== undefined && !pattern.test(value))) {
        throw new ValidationError(`${name} non valido: "${raw}"`);
      }
      return new this(value);
    }

    equals(other: { value: string }): boolean {
      return this.value === other.value;
    }
  };
}
