import type { CduMeta } from './Cdu';

const MESI = [
  'gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno',
  'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'
];

function due(n: number): string { return n < 10 ? `0${n}` : String(n); }

/**
 * Formats the CDU `meta.date.oggi` block (02 §2). All fields are derived in UTC
 * so assembly is deterministic and independent of the host timezone.
 */
export function formatOggi(d: Date): CduMeta['date']['oggi'] {
  const giorno = due(d.getUTCDate());
  const mese = due(d.getUTCMonth() + 1);
  const anno = String(d.getUTCFullYear());
  const ora = `${due(d.getUTCHours())}:${due(d.getUTCMinutes())}`;
  return {
    breve: `${giorno}/${mese}/${anno}`,
    estesa: `${giorno} ${MESI[d.getUTCMonth()]} ${anno}`,
    iso: `${anno}-${mese}-${giorno}`,
    giorno,
    mese,
    anno,
    ora
  };
}
