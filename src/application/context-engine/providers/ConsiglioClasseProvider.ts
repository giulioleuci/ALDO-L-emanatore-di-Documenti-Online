import type { ContextProvider } from '../ContextProvider';
import type { Cdu, DocenteCdcVM } from '../Cdu';
import type { ClasseRepository } from '../../../infrastructure/repositories/ClasseRepository';
import type { MateriaRepository } from '../../../infrastructure/repositories/MateriaRepository';
import type { Classe } from '../../../domain/entities/Classe';
import type { Docente } from '../../../domain/entities/Docente';
import { MateriaId } from '../../../domain/value-objects/MateriaId';
import { getClasseEntity } from '../techEntities';

const RUOLO_TUTOR_ASL = 'TUTOR_ASL';
const RUOLO_TUTOR_ORIENT = 'TUTOR_ORIENT';

/**
 * Builds `focus.classe.consiglioDiClasse` — one docente-in-CDC view model per
 * teacher of the class council (09 §4, 02 §4.1). For articulated classes the
 * council spans the whole group (getAllDocentiCDCArticolata) and each teacher is
 * tagged COMUNE / SEPARATO_PRIMO / SEPARATO_SECONDO by which partner(s) they
 * teach in (09 §9). Role flags are read from CLASSI (coordinatori, RUOLI tutor
 * keys) directly, so the provider works whether or not the tutor provider ran.
 * The `stato.isSupplente`/`sostituisce` fields are left at the titolare default;
 * the SwapAndEnrichInterceptor overrides them when a supplenza is active (09 §5).
 */
export class ConsiglioClasseProvider implements ContextProvider {
  constructor(private readonly classi: ClasseRepository, private readonly materie: MateriaRepository) {}

  provide(cdu: Cdu): void {
    const classe = getClasseEntity(cdu);
    const focusClasse = cdu.focus.classe;
    if (focusClasse === undefined) return;

    const isArticolata = this.classi.isArticolata(classe);
    const docenti = isArticolata ? this.classi.getAllDocentiCDCArticolata(classe) : this.classi.getAllDocentiCDC(classe);
    const coord = new Set(this.classi.getCoordinatori(classe).map((d) => d.id ?? ''));
    const tutorAsl = new Set(this.classi.getDocentiRuolo(classe, RUOLO_TUTOR_ASL).map((d) => d.id ?? ''));
    const tutorOrient = new Set(this.classi.getDocentiRuolo(classe, RUOLO_TUTOR_ORIENT).map((d) => d.id ?? ''));
    const partners = this.orderedPartners(classe);

    focusClasse.consiglioDiClasse = docenti.map((d, i) =>
      this.buildVM(d, classe, isArticolata, partners, coord, tutorAsl, tutorOrient, i < docenti.length - 1)
    );
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

  /** Subjects taught by the teacher: in the class itself, or unioned across the articulated group. */
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
