import { ValidationError } from '../errors/DomainError';

/** CoreUtilsLib.UtilsService.isValidEmail needs no injected sleepFn for this call, so it's safe to use directly (ambient global, ref ALDO_GLF_AUDIT_RESULTS.md B-1). */
const utils = new UtilsService();

export class Email {
  private constructor(public readonly value: string) {}
  static of(raw: string): Email {
    if (typeof raw !== 'string' || !utils.isValidEmail(raw.trim())) {
      throw new ValidationError(`Email non valida: "${raw}"`);
    }
    return new Email(raw.trim());
  }
  equals(other: Email): boolean {
    return this.value === other.value;
  }
}
