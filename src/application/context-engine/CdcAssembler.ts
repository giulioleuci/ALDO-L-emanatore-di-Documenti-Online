import type { DocenteCdcVM } from './Cdu';
import type { ClasseRepository } from '../../infrastructure/repositories/ClasseRepository';
import type { MateriaRepository } from '../../infrastructure/repositories/MateriaRepository';
import type { Classe } from '../../domain/entities/Classe';
import type { Docente } from '../../domain/entities/Docente';
import { MateriaId } from '../../domain/value-objects/MateriaId';
import { ReligioneScelta } from '../../domain/value-objects/enums';

const RUOLO_TUTOR_ASL = 'TUTOR_ASL';
const RUOLO_TUTOR_ORIENT = 'TUTOR_ORIENT';

/**
 * Builds docente-in-CDC view models (02 §4.1/§4.2), shared by
 * ConsiglioClasseProvider (full class council) and AlunnoProvider (the per-alunno
 * filtered council, CDCFilterAlunnoStrategy — 14 §1.3). Keeps the VM shape and
 * the articulation tagging (COMUNE/SEPARATO_*) in one place.
 */
export class CdcAssembler {
  constructor(private readonly classi: ClasseRepository, private readonly materie: MateriaRepository) {}

  /** Full council of the class (09 §4): articulated councils span the whole group. */
  assembleForClasse(classe: Classe): DocenteCdcVM[] {
    const isArticolata = this.classi.isArticolata(classe);
    const docenti = isArticolata ? this.classi.getAllDocentiCDCArticolata(classe) : this.classi.getAllDocentiCDC(classe);
    return this.toVMs(docenti, classe, isArticolata);
  }

  /**
   * Council filtered for a specific student (14 §1.3): the subject teachers, plus
   * the IRC teacher when the student chose religion (SI) or the ALT teacher when
   * ALT (neither for NO). Specificity filtering by `focus.alunno.curriculum`
   * applies only where specificity columns exist in the cattedra matrix — that
   * matrix has none yet, so specificity filtering is deferred (14 §1.3).
   */
  assembleFiltrato(classe: Classe, religione: ReligioneScelta): DocenteCdcVM[] {
    const byEmail = new Map<string, Docente>();
    const add = (docenti: Docente[]): void => { for (const d of docenti) if (d.id !== null) byEmail.set(d.id, d); };
    add(this.classi.getAllDocentiCDC(classe));
    if (religione === ReligioneScelta.SI) add(this.classi.getDocentiIRC(classe));
    else if (religione === ReligioneScelta.ALT) add(this.classi.getDocentiALT(classe));
    const docenti = [...byEmail.values()].sort((a, b) => a.cognome.localeCompare(b.cognome));
    return this.toVMs(docenti, classe, this.classi.isArticolata(classe));
  }

  private toVMs(docenti: Docente[], classe: Classe, isArticolata: boolean): DocenteCdcVM[] {
    const coord = new Set(this.classi.getCoordinatori(classe).map((d) => d.id ?? ''));
    const tutorAsl = new Set(this.classi.getDocentiRuolo(classe, RUOLO_TUTOR_ASL).map((d) => d.id ?? ''));
    const tutorOrient = new Set(this.classi.getDocentiRuolo(classe, RUOLO_TUTOR_ORIENT).map((d) => d.id ?? ''));
    const partners = this.orderedPartners(classe);
    return docenti.map((d, i) => this.buildVM(d, classe, isArticolata, partners, coord, tutorAsl, tutorOrient, i < docenti.length - 1));
  }

  private buildVM(
    d: Docente, classe: Classe, isArticolata: boolean, partners: Classe[],
    coord: Set<string>, tutorAsl: Set<string>, tutorOrient: Set<string>, isNotLast: boolean
  ): DocenteCdcVM {
    const email = d.id ?? '';
    const materieRaw = this.materieRawOf(classe, email, isArticolata);
    const isCoordinatore = coord.has(email);
    const isTutorAsl = tutorAsl.has(email);
    const isTutorOrientamento = tutorOrient.has(email);
    return {
      anagrafica: { nome: d.nome, cognome: d.cognome, email, genere: d.genere, appellativo: d.getAppellativo() },
      materie: materieRaw.map((m) => ({
        sigla: m.sigla,
        nome: this.materie.findByIdCached(MateriaId.of(m.sigla))?.nome ?? m.sigla,
        colore: '',
        specificita: null
      })),
      ruoli: {
        isCoordinatore,
        isTutorAsl,
        isTutorOrientamento,
        descrizione: this.descrizione(isCoordinatore, isTutorAsl, isTutorOrientamento)
      },
      stato: { isSupplente: false, sostituisce: null },
      tipoArticolazione: this.tipoArticolazione(isArticolata, partners, email),
      isITP: materieRaw.some((m) => m.isItp),
      flags: { isNotLast }
    };
  }

  private materieRawOf(classe: Classe, email: string, isArticolata: boolean): Array<{ sigla: string; isItp: boolean }> {
    if (!isArticolata) return this.classi.getMaterieDelDocente(classe, email);
    const byMateria = new Map<string, boolean>();
    for (const g of this.classi.getGruppoArticolazione(classe)) {
      for (const m of this.classi.getMaterieDelDocente(g, email)) {
        byMateria.set(m.sigla, (byMateria.get(m.sigla) ?? false) || m.isItp);
      }
    }
    return [...byMateria].map(([sigla, isItp]) => ({ sigla, isItp }));
  }

  private tipoArticolazione(isArticolata: boolean, partners: Classe[], email: string): DocenteCdcVM['tipoArticolazione'] {
    if (!isArticolata || partners.length < 2) return null;
    const inPrimo = this.classi.getMaterieDelDocente(partners[0]!, email).length > 0;
    const inSecondo = this.classi.getMaterieDelDocente(partners[1]!, email).length > 0;
    if (inPrimo && inSecondo) return 'COMUNE';
    if (inPrimo) return 'SEPARATO_PRIMO';
    if (inSecondo) return 'SEPARATO_SECONDO';
    return null;
  }

  private descrizione(isCoordinatore: boolean, isTutorAsl: boolean, isTutorOrientamento: boolean): string[] {
    const out: string[] = [];
    if (isCoordinatore) out.push('Coordinatore');
    if (isTutorAsl) out.push('Tutor ASL');
    if (isTutorOrientamento) out.push('Tutor Orientamento');
    out.push('Docente');
    return out;
  }

  private orderedPartners(classe: Classe): Classe[] {
    const config = this.classi.getArticolazione(classe);
    if (config === null) return [];
    const parent = config.isParent() ? classe : this.classi.getClasseParent(classe);
    if (parent === null) return [];
    return this.classi.getClassiPartner(parent);
  }
}
