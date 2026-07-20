import { ValidationError } from '../errors/DomainError';

/**
 * Supply-teaching period [dal, al] (ref 03 §PeriodoSupplenza). Invariant: dal ≤ al.
 * An open-ended supplenza (no AL) is modelled with al = +∞ (far-future date).
 * Backed by CoreUtilsLib.DateRange, an ambient global (ref ALDO_GLF_AUDIT_RESULTS.md B-2)
 * — see DateRange for the containment/duration/overlap/open-ended-sentinel logic.
 */
export class PeriodoSupplenza {
  private constructor(private readonly range: DateRange) {}

  get dal(): Date {
    return this.range.start;
  }
  get al(): Date {
    return this.range.end;
  }

  static of(dal: Date, al: Date | null): PeriodoSupplenza {
    if (Number.isNaN(dal.getTime()))
      throw new ValidationError('PeriodoSupplenza: DAL non è una data valida');
    if (al !== null && Number.isNaN(al.getTime()))
      throw new ValidationError('PeriodoSupplenza: AL non è una data valida');
    // Ordering is validated explicitly here (rather than by catching whatever
    // DateRange throws) because DOCS_LIBS/CoreUtilsLib_docs.md does not document
    // DateRange's error type/shape for invalid construction — matching on a
    // caught error would be fragile and could mislabel unrelated failures.
    if (al !== null && dal.getTime() > al.getTime())
      throw new ValidationError('PeriodoSupplenza: deve valere DAL ≤ AL');
    try {
      return new PeriodoSupplenza(new DateRange(dal, al));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new ValidationError(`PeriodoSupplenza: costruzione DateRange fallita — ${message}`);
    }
  }

  contiene(data: Date): boolean {
    return this.range.contains(data);
  }

  durata(): number {
    return this.range.durationInDays();
  }

  /** True when this period and `other` share at least one instant. */
  overlaps(other: PeriodoSupplenza): boolean {
    return this.range.overlaps(other.range);
  }

  isAttiva(oggi: Date): boolean {
    return this.contiene(oggi);
  }
  isTerminata(oggi: Date): boolean {
    return this.al.getTime() < oggi.getTime();
  }
}
