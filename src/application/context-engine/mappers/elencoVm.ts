import type { ElencoVM } from '../Cdu';

export function elencoVm<T>(elenco: T[]): ElencoVM<T> {
  return { elenco, hasElenco: elenco.length > 0, numero: elenco.length };
}
