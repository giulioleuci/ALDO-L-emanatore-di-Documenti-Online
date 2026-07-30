import type { ContextProvider } from '../ContextProvider';
import type { Cdu, AlunnoContestoVM } from '../Cdu';
import type { IClasseRepository } from '../../../domain/repositories/IClasseRepository';
import type { IAlunnoRepository } from '../../../domain/repositories/IAlunnoRepository';
import type { IMateriaRepository } from '../../../domain/repositories/IMateriaRepository';
import type { Alunno } from '../../../domain/entities/Alunno';
import type { Classe } from '../../../domain/entities/Classe';
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
  constructor(
    private readonly classi: IClasseRepository,
    private readonly alunni: IAlunnoRepository,
    private readonly materie: IMateriaRepository
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
        const vms = this.classi
          .getStudenti(partner)
          .filter((alunno) => alunno.isAttivo())
          .map((alunno) => this.buildVM(alunno, partner));
        const sigla = partner.indirizzo;
        if (!(sigla in perIndirizzo)) {
          perIndirizzo[sigla] = [];
          indirizziPresenti.push(sigla);
        }
        perIndirizzo[sigla]!.push(...vms);
        listaCompleta.push(...vms);
      }
      focusClasse.studenti = { listaCompleta, perIndirizzo, indirizziPresenti };
    } else {
      focusClasse.studenti = {
        listaCompleta: this.classi
          .getStudenti(classe)
          .filter((alunno) => alunno.isAttivo())
          .map((alunno) => this.buildVM(alunno, classe))
      };
    }
  }

  private buildVM(alunno: Alunno, classe: Classe): AlunnoContestoVM {
    const indirizzo = this.classi.getIndirizzo(classe);
    const dettaglio = carenzeDettaglioSemplice(
      this.alunni.getCarenze(alunno),
      this.materie.findAllSigle()
    );
    const pianiItems = this.alunni
      .getPiani(alunno)
      .map((p) => ({ tipo: p.tipo, isBes: p.isBES() }));
    const hasBes = pianiItems.some((p) => p.isBes);
    return {
      anagrafica: { nomeCompleto: alunno.cognomeNome, email: alunno.email.value },
      genitori: alunno.getTutors().map((email) => ({ email: email.value })),
      status: {
        isBes: hasBes,
        isRipetente: alunno.isRipetente(),
        isRappresentante: alunno.isRappresentante(),
        religione: alunno.religione
      },
      curriculum: curriculumRecord(alunno),
      indirizzo: { sigla: classe.indirizzo, nome: indirizzo.nome, nomeSintetico: indirizzo.nomeSintetico },
      didattica: {
        carenze: { hasCarenze: dettaglio.length > 0, numero: dettaglio.length, dettaglio },
        piani: { hasPiani: pianiItems.length > 0, hasBes, items: pianiItems },
        pcto: { oreCumulate: this.alunni.getOreASLTotali(alunno) }
      }
    };
  }
}
