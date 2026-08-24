import { IndirizzoId } from './IndirizzoId';

interface EsameConfigJson {
  primaProva?: string[];
  secondaProva?: string[];
}

/**
 * MATERIE.ESAME_CFG — which indirizzi have this subject as first/second exam
 * paper (ref 03). Built from the raw JSON string; null when absent.
 */
export class EsameConfig {
  private constructor(
    private readonly primaProva: string[],
    private readonly secondaProva: string[]
  ) {}

  static fromJson(json: string | null | undefined): EsameConfig | null {
    if (json === null || json === undefined || json.trim() === '') return null;
    const parsed = JSON.parse(json) as EsameConfigJson;
    return new EsameConfig(parsed.primaProva ?? [], parsed.secondaProva ?? []);
  }

  isPrimaProvaPerIndirizzo(ind: IndirizzoId): boolean {
    return this.primaProva.some((raw) => EsameConfig.matches(raw, ind));
  }

  isSecondaProvaPerIndirizzo(ind: IndirizzoId): boolean {
    return this.secondaProva.some((raw) => EsameConfig.matches(raw, ind));
  }

  /**
   * ESAME_CFG is a human-editable JSON cell with no schema-level validation
   * (ref 01 — no Vincoli entry, unlike DIPART). A malformed entry must not
   * abort the whole match: treat it as a non-match instead of throwing.
   */
  private static matches(raw: string, ind: IndirizzoId): boolean {
    try {
      return IndirizzoId.of(raw).equals(ind);
    } catch {
      return false;
    }
  }
}
