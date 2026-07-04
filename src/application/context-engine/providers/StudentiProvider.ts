import type { ContextProvider } from '../ContextProvider';
import type { Cdu, AlunnoContestoVM } from '../Cdu';
import type { ClasseRepository } from '../../../infrastructure/repositories/ClasseRepository';
import type { AlunnoRepository } from '../../../infrastructure/repositories/AlunnoRepository';
import type { MateriaRepository } from '../../../infrastructure/repositories/MateriaRepository';
import type { Alunno } from '../../../domain/entities/Alunno';
import { getClasseEntity } from '../techEntities';
import { carenzeDettaglioSemplice, curriculumRecord } from '../mappers/carenzeMapper';

/**
 * Populates `focus.classe.studenti` (09 §4/§10). Builds one alunno-in-context
 * view model per student (anagrafica, status incl. isBes from PIANI, curriculum,
 * and per-student didattica: carenze, piani, PCTO). For the parent of an
 * articulated class the roster is aggregated across both partners and also
 * grouped by indirizzo (`perIndirizzo` / `indirizziPresenti`).
 */
export class StudentiProvider implements ContextProvider {
  private sigleCache: string[] | null = null;

  constructor(
    private readonly classi: ClasseRepository,
    private readonly alunni: AlunnoRepository,
    private readonly materie: MateriaRepository
  ) {}

  provide(cdu: Cdu): void {
    const classe = getClasseEntity(cdu);
    const focusClasse = cdu.focus.classe;
    if (focusClasse === undefined) return;

    const config = this.classi.getArticolazione(classe);
    if (config?.isParent() === true) {
      const perIndirizzo: Record<string, AlunnoContestoVM[]> = {};
      const indirizziPresenti: string[] = [];
      const listaCompleta: AlunnoContestoVM[] = [];
      for (const partner of this.classi.getClassiPartner(classe)) {
        const vms = this.classi.getStudenti(partner).map((a) => this.buildVM(a));
        const sigla = partner.indirizzo;
        if (!(sigla in perIndirizzo)) { perIndirizzo[sigla] = []; indirizziPresenti.push(sigla); }
        perIndirizzo[sigla]!.push(...vms);
        listaCompleta.push(...vms);
      }
      focusClasse.studenti = { listaCompleta, perIndirizzo, indirizziPresenti };
    } else {
      focusClasse.studenti = { listaCompleta: this.classi.getStudenti(classe).map((a) => this.buildVM(a)) };
    }
  }

  private buildVM(alunno: Alunno): AlunnoContestoVM {
    const dettaglio = carenzeDettaglioSemplice(this.alunni.getCarenze(alunno), this.sigle());
    const pianiItems = this.alunni.getPiani(alunno).map((p) => ({ tipo: p.tipo, isBes: p.isBES() }));
    const hasBes = pianiItems.some((p) => p.isBes);
    return {
      anagrafica: { nomeCompleto: alunno.cognomeNome, email: alunno.email.value },
      status: {
        isBes: hasBes,
        isRipetente: alunno.isRipetente(),
        isRappresentante: alunno.isRappresentante(),
        religione: alunno.religione
      },
      curriculum: curriculumRecord(alunno),
      didattica: {
        carenze: { hasCarenze: dettaglio.length > 0, numero: dettaglio.length, dettaglio },
        piani: { hasPiani: pianiItems.length > 0, hasBes, items: pianiItems },
        pcto: { oreCumulate: this.alunni.getOreASLTotali(alunno) }
      }
    };
  }

  private sigle(): string[] {
    if (this.sigleCache === null) {
      this.sigleCache = this.materie.findAllCached().map((m) => m.id ?? '').filter((s) => s !== '');
    }
    return this.sigleCache;
  }
}
