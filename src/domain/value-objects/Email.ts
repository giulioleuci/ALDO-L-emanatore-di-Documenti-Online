import { ValidationError } from '../errors/DomainError';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class Email {
  private constructor(public readonly value: string) {}
  static of(raw: string): Email {
    if (typeof raw !== 'string' || !EMAIL_RE.test(raw.trim())) {
      throw new ValidationError(`Email non valida: "${raw}"`);
    }
    return new Email(raw.trim());
  }
  equals(other: Email): boolean {
    return this.value === other.value;
  }
}
