import type { AnnoAlunnoStorico } from '../../storico/StoricoAlunniService';
import { tipoPianoLabel } from './labels';
import type { TipoPiano } from '../../../domain/value-objects/enums';

export interface StudentStoricoVM {
  anni: Array<{ annoScolastico: string; classe: string; esito: AnnoAlunnoStorico['esito'] }>;
  pianiPrimoAnnoPrecedente: Array<{ tipo: string; tipoLabel: string }>;
  pianiSecondoAnnoPrecedente: Array<{ tipo: string; tipoLabel: string }>;
  bocciature: Array<{ annoScolastico: string; classe: string }>;
  hasBocciature: boolean;
}

/**
 * Builds StudentStoricoVM (02 §8.6) from StoricoAlunniService.perAlunno's raw
 * per-year rows — index 0 is the immediately-prior year, index 1 two years
 * back (matches `pianiPrimoAnnoPrecedente`/`pianiSecondoAnnoPrecedente`).
 */
export function buildStudentStoricoVm(anni: AnnoAlunnoStorico[]): StudentStoricoVM {
  const mapped = anni.map((a) => ({ annoScolastico: a.anno, classe: a.classe ?? '', esito: a.esito }));
  const bocciature = mapped
    .filter((a) => a.esito === 'NON_PROMOSSO')
    .map(({ annoScolastico, classe }) => ({ annoScolastico, classe }));
  const pianiFor = (index: number): Array<{ tipo: string; tipoLabel: string }> =>
    (anni[index]?.piani ?? []).map((tipo) => ({ tipo, tipoLabel: tipoPianoLabel(tipo as TipoPiano) }));
  return {
    anni: mapped,
    pianiPrimoAnnoPrecedente: pianiFor(0),
    pianiSecondoAnnoPrecedente: pianiFor(1),
    bocciature,
    hasBocciature: bocciature.length > 0
  };
}
