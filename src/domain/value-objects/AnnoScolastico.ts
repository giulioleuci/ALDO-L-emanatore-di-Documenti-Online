import { ValidationError } from '../errors/DomainError';

const ANNO_RE = /^(\d{4})-(\d{4})$/;

/**
 * School year in `YYYY-YYYY` form (ref 03 §AnnoScolastico). Invariant: the
 * final year must equal the initial year + 1. PK part 2 of the ASL table.
 */
export class AnnoScolastico {
  private constructor(public readonly value: string) {}

  static of(raw: string): AnnoScolastico {
    const m = typeof raw === 'string' ? ANNO_RE.exec(raw.trim()) : null;
    if (m === null) {
      throw new ValidationError(`AnnoScolastico non valido (formato YYYY-YYYY): "${raw}"`);
    }
    const inizio = Number(m[1]);
    const fine = Number(m[2]);
    if (fine !== inizio + 1) {
      throw new ValidationError(`AnnoScolastico: l'anno finale deve essere iniziale+1: "${raw}"`);
    }
    return new AnnoScolastico(`${inizio}-${fine}`);
  }

  getAnnoInizio(): number {
    return Number(ANNO_RE.exec(this.value)![1]);
  }
  getAnnoFine(): number {
    return Number(ANNO_RE.exec(this.value)![2]);
  }

  getAnnoSuccessivo(): AnnoScolastico {
    const i = this.getAnnoInizio() + 1;
    return AnnoScolastico.of(`${i}-${i + 1}`);
  }

  getAnnoPrecedente(): AnnoScolastico {
    const i = this.getAnnoInizio() - 1;
    return AnnoScolastico.of(`${i}-${i + 1}`);
  }

  equals(other: AnnoScolastico): boolean {
    return this.value === other.value;
  }
}
