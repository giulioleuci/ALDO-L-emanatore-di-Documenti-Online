import type { DocenteCdcVM } from './Cdu';

/** One column of `focus.classe.elencoMaterieConPermessi` (MAT_NON_STANDARD §1/§2.A). */
export interface ElencoMateriaConPermessiVM {
  sigla: string;
  nome: string;
  isSpecial: boolean;
  /** Materia sigle (or ["IRC","ALT"]/["IRC"] for the special column) the ACL step resolves per column. */
  roles: string[];
  colore: string;
}

const SPECIAL_COLORE = '#E0E0E0';

/**
 * Builds `focus.classe.elencoMaterieConPermessi` (MAT_NON_STANDARD §2.A): the
 * REL/ALT merge is prepended, followed by every other CDC subject sorted
 * alphabetically by sigla. `IRC`/`ALT` never actually appear in
 * `consiglioDiClasse.materie` (ConsiglioClasseProvider/CdcAssembler only walk
 * the standard subject columns — ref ClasseRepository.getAllDocentiCDC), so the
 * spec's IRC/ALT exclusion filter here is defensive, not load-bearing.
 * `hasAlt` (whether the class has an ALT column value) decides the special
 * column's label/roles — degrades to "REL"/["IRC"] when there is no ALT.
 */
export function buildElencoMaterieConPermessi(consiglioDiClasse: DocenteCdcVM[], hasAlt: boolean): ElencoMateriaConPermessiVM[] {
  const bySigla = new Map<string, { sigla: string; nome: string; colore: string }>();
  for (const docente of consiglioDiClasse) {
    for (const m of docente.materie) {
      if (m.sigla === 'IRC' || m.sigla === 'ALT') continue;
      if (!bySigla.has(m.sigla)) bySigla.set(m.sigla, { sigla: m.sigla, nome: m.nome, colore: m.colore });
    }
  }
  const materie: ElencoMateriaConPermessiVM[] = [...bySigla.values()]
    .sort((a, b) => a.sigla.localeCompare(b.sigla))
    .map((m) => ({ ...m, isSpecial: false, roles: [m.sigla] }));
  const special: ElencoMateriaConPermessiVM = {
    sigla: hasAlt ? 'REL/ALT' : 'REL',
    nome: hasAlt ? 'Religione/Alternativa' : 'Religione',
    isSpecial: true,
    roles: hasAlt ? ['IRC', 'ALT'] : ['IRC'],
    colore: SPECIAL_COLORE
  };
  return [special, ...materie];
}
