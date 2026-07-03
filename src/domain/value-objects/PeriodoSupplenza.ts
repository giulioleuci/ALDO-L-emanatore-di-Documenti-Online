import { ValidationError } from '../errors/DomainError';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Supply-teaching period [dal, al] (ref 03 §PeriodoSupplenza). Invariant: dal ≤ al.
 * An open-ended supplenza (no AL) is modelled with al = +∞ (far-future date).
 */
export class PeriodoSupplenza {
  private constructor(public readonly dal: Date, public readonly al: Date) {}

  static of(dal: Date, al: Date | null): PeriodoSupplenza {
    if (Number.isNaN(dal.getTime())) throw new ValidationError('PeriodoSupplenza: DAL non è una data valida');
    const fine = al === null ? new Date(8640000000000000) : al;
    if (Number.isNaN(fine.getTime())) throw new ValidationError('PeriodoSupplenza: AL non è una data valida');
    if (dal.getTime() > fine.getTime()) throw new ValidationError('PeriodoSupplenza: deve valere DAL ≤ AL');
    return new PeriodoSupplenza(dal, fine);
  }

  contiene(data: Date): boolean {
    return data.getTime() >= this.dal.getTime() && data.getTime() <= this.al.getTime();
  }

  durata(): number {
    return Math.floor((this.al.getTime() - this.dal.getTime()) / MS_PER_DAY);
  }

  isAttiva(oggi: Date): boolean { return this.contiene(oggi); }
  isTerminata(oggi: Date): boolean { return this.al.getTime() < oggi.getTime(); }
}
