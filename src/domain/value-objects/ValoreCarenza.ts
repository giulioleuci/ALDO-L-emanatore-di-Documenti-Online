import { ValidationError } from '../errors/DomainError';

export type TipoValoreCarenza = 'VOTO' | 'NOTA';

/**
 * A single cell of the CARENZE matrix (ref 03 §ValoreCarenza). A numeric cell is
 * a `VOTO` (decimal grade); any non-empty text is a `NOTA`. Invariant: VOTO
 * carries a number, NOTA a non-empty string.
 */
export class ValoreCarenza {
  private constructor(
    public readonly tipo: TipoValoreCarenza,
    public readonly valore: number | string
  ) {}

  static voto(valore: number): ValoreCarenza {
    if (typeof valore !== 'number' || !Number.isFinite(valore)) {
      throw new ValidationError(
        `ValoreCarenza VOTO: valore numerico richiesto, ricevuto "${valore}"`
      );
    }
    return new ValoreCarenza('VOTO', valore);
  }

  static nota(valore: string): ValoreCarenza {
    if (typeof valore !== 'string' || valore.trim().length === 0) {
      throw new ValidationError('ValoreCarenza NOTA: stringa non vuota richiesta');
    }
    return new ValoreCarenza('NOTA', valore);
  }

  /**
   * Classifies a raw matrix cell: a value parseable as a number becomes a VOTO,
   * any other non-empty text a NOTA. Empty/null cells yield null (no carenza).
   */
  static fromCella(raw: unknown): ValoreCarenza | null {
    if (raw === null || raw === undefined) return null;
    if (typeof raw === 'number') return Number.isFinite(raw) ? ValoreCarenza.voto(raw) : null;
    if (typeof raw !== 'string' && typeof raw !== 'boolean') return null;
    const s = String(raw).trim();
    if (s.length === 0) return null;
    const n = Number(s);
    return Number.isFinite(n) && s !== '' ? ValoreCarenza.voto(n) : ValoreCarenza.nota(s);
  }

  isNota(): boolean {
    return this.tipo === 'NOTA';
  }
  toString(): string {
    return String(this.valore);
  }
}
