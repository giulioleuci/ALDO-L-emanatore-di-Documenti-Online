import { ValidationError } from '../errors/DomainError';

export class AnnoCorso {
  private constructor(public readonly value: number) {}
  static of(n: number): AnnoCorso {
    if (!Number.isInteger(n) || n < 1 || n > 5) {
      throw new ValidationError(`AnnoCorso fuori range [1,5]: ${n}`);
    }
    return new AnnoCorso(n);
  }
  isPrima(): boolean {
    return this.value === 1;
  }
  isPrimoBiennio(): boolean {
    return this.value === 1 || this.value === 2;
  }
  isSecondoBiennio(): boolean {
    return this.value === 3 || this.value === 4;
  }
  isTerminale(): boolean {
    return this.value === 5;
  }
}
