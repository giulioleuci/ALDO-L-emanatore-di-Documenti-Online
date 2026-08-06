import type { ContextProvider } from '../ContextProvider';
import type { Cdu, AlunnoContestoVM } from '../Cdu';
import type { BuildParams, RecipeOptions } from '../Recipe';
import type { IClasseRepository } from '../../../domain/repositories/IClasseRepository';
import type { IAlunnoRepository } from '../../../domain/repositories/IAlunnoRepository';
import type { IMateriaRepository } from '../../../domain/repositories/IMateriaRepository';
import type { Alunno } from '../../../domain/entities/Alunno';
import { getClasseEntity } from '../techEntities';
import { carenzeDettaglioSemplice, curriculumArray } from '../mappers/carenzeMapper';
import { tipoPianoLabel, religioneLabel } from '../mappers/labels';
import { buildPerSpecificita } from '../mappers/specificitaAlunniMapper';

/**
 * Populates `focus.classe.studenti.listaCompleta` (02 §4.1/§8.7). Each item is
 * self-contained: it carries its own classe/indirizzo (Principle 2) so
 * templates never navigate back to `focus.classe.anagrafica` inside a loop.
 * For the parent of an articulated class the roster is the union across both
 * partner classes — no per-indirizzo grouping (moved to `focus.classe.partner`, 02 §2.5).
 */
export class StudentiProvider implements ContextProvider {
  constructor(
    private readonly classi: IClasseRepository,
    private readonly alunni: IAlunnoRepository,
    private readonly materie: IMateriaRepository
  ) {}

  provide(cdu: Cdu, _params: BuildParams, options: RecipeOptions): void {
    const classe = getClasseEntity(cdu);
    const focusClasse = cdu.focus.classe;
    if (focusClasse === undefined) return;

    const config = this.classi.getArticolazione(classe);
    const sourceClassi = config?.isParent() === true ? this.classi.getClassiPartner(classe) : [classe];
    const listaCompleta = sourceClassi.flatMap((source) =>
      this.classi
        .getStudenti(source)
        .filter((alunno) => alunno.isAttivo())
        .map((alunno) => this.buildVM(alunno, focusClasse))
    );
    focusClasse.studenti = {
      listaCompleta,
      ...(options.includiSpecificita ? { perSpecificita: buildPerSpecificita(listaCompleta) } : {})
    };
  }

  private buildVM(alunno: Alunno, focusClasse: NonNullable<Cdu['focus']['classe']>): AlunnoContestoVM {
    const dettaglio = carenzeDettaglioSemplice(
      this.alunni.getCarenze(alunno),
      this.materie.findAllSigle(),
      this.materie
    );
    const pianiItems = this.alunni
      .getPiani(alunno)
      .map((p) => ({ tipo: p.tipo, tipoLabel: tipoPianoLabel(p.tipo), isBes: p.isBES() }));
    const hasBes = pianiItems.some((p) => p.isBes);
    return {
      anagrafica: { nomeCompleto: alunno.cognomeNome, email: alunno.email.value },
      classe: { nome: focusClasse.anagrafica.nome },
      indirizzo: {
        nome: focusClasse.anagrafica.indirizzo.nome,
        nomeSintetico: focusClasse.anagrafica.indirizzo.nomeSintetico
      },
      status: {
        isBes: hasBes,
        isRipetente: alunno.isRipetente(),
        isRappresentante: alunno.isRappresentante(),
        religione: alunno.religione,
        religioneLabel: religioneLabel(alunno.religione)
      },
      curriculum: curriculumArray(alunno, this.materie),
      didattica: {
        carenze: { hasCarenze: dettaglio.length > 0, numero: dettaglio.length, dettaglio },
        piani: { hasPiani: pianiItems.length > 0, hasBes, items: pianiItems },
        pcto: { oreCumulate: this.alunni.getOreASLTotali(alunno) }
      }
    };
  }
}
