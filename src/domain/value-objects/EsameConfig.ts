import type { IndirizzoId } from './IndirizzoId';

interface EsameConfigJson {
  prima_prova?: string[];
  seconda_prova?: string[];
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
    return new EsameConfig(parsed.prima_prova ?? [], parsed.seconda_prova ?? []);
  }

  isPrimaProvaPerIndirizzo(ind: IndirizzoId): boolean {
    return this.primaProva.includes(ind.value);
  }

  isSecondaProvaPerIndirizzo(ind: IndirizzoId): boolean {
    return this.secondaProva.includes(ind.value);
  }
}
