import type { DocenteCdcVM } from './Cdu';

/** One column of `focus.classe.elencoMaterieConPermessi` (MAT_NON_STANDARD §1/§2.A). */
export interface ElencoMateriaConPermessiVM {
  sigla: string;
  specificita?: string | null;
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
 * alphabetically by sigla. The GLF projection excludes `IRC`/`ALT` from the
 * ordinary columns before prepending the special display group.
 * `hasAlt` (whether the class has an ALT column value) decides the special
 * column's label/roles — degrades to "REL"/["IRC"] when there is no ALT.
 */
export function buildElencoMaterieConPermessi(
  consiglioDiClasse: DocenteCdcVM[],
  hasAlt: boolean
): ElencoMateriaConPermessiVM[] {
  const special: ElencoMateriaConPermessiVM = {
    sigla: hasAlt ? 'REL/ALT' : 'REL',
    nome: hasAlt ? 'Religione/Alternativa' : 'Religione',
    isSpecial: true,
    roles: hasAlt ? ['IRC', 'ALT'] : ['IRC'],
    colore: SPECIAL_COLORE
  };
  const registry = new ProjectionRegistry().register('aldoMateriaPermessiVm', (value) =>
    (value as Array<{ sigla: string; specificita?: string | null; nome: string }>).map(
      (materia) => ({
        sigla: materia.sigla,
        specificita: materia.specificita,
        nome: materia.nome,
        isSpecial: false,
        roles: [materia.sigla],
        // SubjectVM (Task 8) carries colore1/colore2, not a flat `colore` — this
        // column color has never been sourced from the materia (was hardcoded ''
        // pre-Task-8 too); keep it blank rather than leak SubjectVM's extra fields.
        colore: ''
      })
    )
  );
  const projector = new CollectionProjector({
    registry,
    expressionEngine: new ExpressionEngineService({ logger: new LoggerService() }),
    logger: new LoggerService()
  });
  return projector.project(
    consiglioDiClasse,
    [
      { type: 'flatMap', path: 'materie' },
      { type: 'filter', expression: '{{sigla}} != "IRC" && {{sigla}} != "ALT"' },
      { type: 'distinctBy', keys: ['sigla', 'specificita'] },
      {
        type: 'sortBy',
        keys: [
          { path: 'sigla', direction: 'ASC' },
          { path: 'specificita', direction: 'ASC' }
        ]
      },
      { type: 'strategy', name: 'aldoMateriaPermessiVm' },
      { type: 'prepend', value: special }
    ],
    { targetPath: 'focus.classe.elencoMaterieConPermessi' }
  ).value as ElencoMateriaConPermessiVM[];
}
