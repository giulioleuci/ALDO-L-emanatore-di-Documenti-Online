import type { DataStampabileVM } from './Cdu';

const MESI = [
  'gennaio',
  'febbraio',
  'marzo',
  'aprile',
  'maggio',
  'giugno',
  'luglio',
  'agosto',
  'settembre',
  'ottobre',
  'novembre',
  'dicembre'
];

const utils = new UtilsService();

/**
 * Formats the CDU `meta.date.oggi` block (02 §2). Token formatting is delegated
 * to CoreUtilsLib's UtilsService.formatDate with `utc:true`, so assembly is
 * deterministic and independent of the host timezone; only the Italian
 * extended-month wording required by the spec is domain knowledge here.
 */
export function formatOggi(d: Date): DataStampabileVM {
  const fmt = (pattern: string): string => utils.formatDate(d, pattern, { utc: true }) ?? '';
  return {
    breve: fmt('DD/MM/YYYY'),
    estesa: `${fmt('DD')} ${MESI[d.getUTCMonth()]} ${fmt('YYYY')}`,
    giorno: fmt('DD'),
    mese: fmt('MM'),
    meseNome: MESI[d.getUTCMonth()]!,
    anno: fmt('YYYY'),
    ora: fmt('HH:mm')
  };
}
