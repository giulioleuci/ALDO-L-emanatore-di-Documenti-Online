import type { ContextProvider } from '../ContextProvider';
import type { Cdu, DocenteCdcVM } from '../Cdu';
import type { BuildParams, RecipeOptions } from '../Recipe';
import type { SubjectVM } from '../mappers/subjectVmMapper';
import { docentiDescrizione as joinDocenti } from '../mappers/subjectVmMapper';
import { buildMateriePerPrincipale } from '../mappers/materiePerPrincipaleMapper';
import { buildContinuita } from '../mappers/continuitaMapper';
import type { IMateriaRepository } from '../../../domain/repositories/IMateriaRepository';
import type { IDocenteRepository } from '../../../domain/repositories/IDocenteRepository';
import type { IClasseRepository } from '../../../domain/repositories/IClasseRepository';
import type { StoricoDatabaseProvider } from '../../storico/StoricoDatabaseProvider';
import { StoricoClassiService } from '../../storico/StoricoClassiService';
import { getClasseEntity } from '../techEntities';

interface RuoliCorrente {
  titolare: string | null;
  itp: string | null;
}

/**
 * Builds `focus.classe.materie[]` (02 §2.8, §4.1) — the flat, deduped subject
 * catalog of the class council — plus `materiePerPrincipale`. Runs AFTER
 * `consiglio` (Recipe.ts token order): it derives everything from
 * `focus.classe.consiglioDiClasse`, never re-queries teaching assignments.
 *
 * When `includiStorico` is true and `docenti`/`storicoDb`/`classi`/`materie`
 * are all supplied, also attaches `continuita` (02 §8.3) to every subject via
 * `ContinuitaVM` — teaching continuity across the last few prior years.
 */
export class MaterieClasseProvider implements ContextProvider {
  constructor(
    private readonly materie?: IMateriaRepository,
    private readonly docenti?: IDocenteRepository,
    private readonly storicoDb?: StoricoDatabaseProvider,
    private readonly classi?: IClasseRepository
  ) {}

  provide(cdu: Cdu, _params: BuildParams, options: RecipeOptions): void {
    const focusClasse = cdu.focus.classe;
    if (focusClasse === undefined) return;
    const consiglio = focusClasse.consiglioDiClasse ?? [];
    const { materie, ruoli } = this.buildCatalog(consiglio);
    focusClasse.materie = materie;
    if (this.materie !== undefined) {
      focusClasse.materiePerPrincipale = buildMateriePerPrincipale(materie);
    }
    this.attachContinuita(cdu, materie, ruoli, options);
  }

  private buildCatalog(
    consiglio: DocenteCdcVM[]
  ): { materie: SubjectVM[]; ruoli: Map<string, RuoliCorrente> } {
    const bySubject = new Map<string, SubjectVM>();
    const ruoli = new Map<string, RuoliCorrente>();
    for (const docente of consiglio) {
      for (const materia of docente.materie) {
        const key = `${materia.sigla}::${materia.specificita ?? ''}`;
        const existing = bySubject.get(key);
        const docenti = [...(existing?.docenti ?? []), docente.anagrafica];
        bySubject.set(key, {
          ...materia,
          docenti,
          docentiDescrizione: joinDocenti(docenti),
          hasItp: (existing?.hasItp ?? false) || materia.isITP
        });

        const ruoliCorrente = ruoli.get(key) ?? { titolare: null, itp: null };
        if (materia.isITP) {
          if (ruoliCorrente.itp === null) ruoliCorrente.itp = docente.anagrafica.email;
        } else if (ruoliCorrente.titolare === null) {
          ruoliCorrente.titolare = docente.anagrafica.email;
        }
        ruoli.set(key, ruoliCorrente);
      }
    }
    return { materie: Array.from(bySubject.values()), ruoli };
  }

  /** Resolves `anniStorici` once and attaches `continuita` per subject (02 §8.3), skipped entirely unless every dependency is available. */
  private attachContinuita(
    cdu: Cdu,
    materie: SubjectVM[],
    ruoli: Map<string, RuoliCorrente>,
    options: RecipeOptions
  ): void {
    if (
      !options.includiStorico ||
      this.docenti === undefined ||
      this.storicoDb === undefined ||
      this.classi === undefined ||
      this.materie === undefined ||
      materie.length === 0
    ) {
      return;
    }
    const classe = getClasseEntity(cdu);
    const anniStorici = new StoricoClassiService(this.storicoDb).perClasse(
      this.classi.getStorico(classe),
      options.profonditaAnniStorico
    );
    const annoCorsoCorrente = classe.anno.value;

    for (const subjectVm of materie) {
      const materiaCorrente = this.materie.findById(subjectVm.sigla);
      if (materiaCorrente === null) continue;
      const key = `${subjectVm.sigla}::${subjectVm.specificita ?? ''}`;
      const { titolare, itp } = ruoli.get(key) ?? { titolare: null, itp: null };
      subjectVm.continuita = buildContinuita({
        siglaCorrente: subjectVm.sigla,
        hasItp: subjectVm.hasItp ?? false,
        titolareCorrenteEmail: titolare,
        itpCorrenteEmail: itp,
        annoCorsoCorrente,
        anniStorici,
        materiaCorrente,
        docenti: this.docenti
      });
    }
  }
}
