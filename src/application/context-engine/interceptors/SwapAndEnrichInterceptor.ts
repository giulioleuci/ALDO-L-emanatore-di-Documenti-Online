import type { Cdu, DocenteCdcVM } from '../Cdu';
import type { RecipeOptions } from '../Recipe';
import type { DocenteRepository } from '../../../infrastructure/repositories/DocenteRepository';
import type { SupplenzaRepository } from '../../../infrastructure/repositories/SupplenzaRepository';
import type { Classe } from '../../../domain/entities/Classe';
import type { Docente } from '../../../domain/entities/Docente';
import { MateriaId } from '../../../domain/value-objects/MateriaId';
import { GestioneSupplenti } from '../../../domain/value-objects/enums';

/**
 * SwapAndEnrichInterceptor (09 §5) — applied after every provider that produces
 * docente data (here: `consiglio` and `student`). For each CDC docente with an
 * active supplenza in the current class/date, it applies the configured
 * GestioneSupplenti rule (from recipe option `gestioneSupplenti`; default
 * SOLO_TITOLARI = no change):
 *   - SOLO_SUPPLENTI → the titolare VM becomes the (chain-resolved) supplente,
 *     stato.isSupplente=true, stato.sostituisce = the replaced titolare
 *   - ENTRAMBI       → the titolare VM is kept, stato.sostituisce = the supplente
 *   - SOLO_TITOLARI  → no change
 *
 * Built on the ContextEngine library's ContextInterceptor middleware base
 * (validation/timing/logging in the inherited `intercept`).
 */
export class SwapAndEnrichInterceptor extends ContextInterceptor {
  constructor(logger: LoggerService, private readonly docenti: DocenteRepository, private readonly supplenze: SupplenzaRepository) {
    super(logger);
  }

  protected override _performIntercept(name: string, data: unknown, _context: unknown, options?: unknown): unknown {
    if (name !== 'consiglio' && name !== 'student') return data;
    const cdu = data as Cdu;
    const rule = (options as RecipeOptions | undefined)?.['gestioneSupplenti'] as GestioneSupplenti | undefined;
    if (rule !== GestioneSupplenti.SOLO_SUPPLENTI && rule !== GestioneSupplenti.ENTRAMBI) return cdu;

    const classe = cdu.tech.entita.classe as Classe | undefined;
    if (classe === undefined) return cdu;
    const date = new Date(cdu.meta.date.oggi.iso);

    this.swapList(cdu.focus.classe?.consiglioDiClasse, classe, date, rule);
    this.swapList(cdu.focus.alunno?.consiglioDiClasseFiltrato, classe, date, rule);
    return cdu;
  }

  private swapList(list: DocenteCdcVM[] | undefined, classe: Classe, date: Date, rule: GestioneSupplenti): void {
    if (list === undefined) return;
    for (const vm of list) {
      const titolare = this.docenti.findById(vm.anagrafica.email);
      if (titolare === null) continue;
      const supplente = this.effettivoSupplente(vm, titolare, classe, date);
      if (supplente === null) continue;
      const supplenteDoc = this.docenti.findById(supplente);
      if (supplenteDoc === null) continue;
      if (rule === GestioneSupplenti.SOLO_SUPPLENTI) {
        vm.stato = { isSupplente: true, sostituisce: { nome: titolare.getNomeCompleto(), email: titolare.id ?? '' } };
        vm.anagrafica = {
          nome: supplenteDoc.nome, cognome: supplenteDoc.cognome, email: supplenteDoc.id ?? '',
          genere: supplenteDoc.genere, appellativo: supplenteDoc.getAppellativo()
        };
      } else {
        vm.stato = { isSupplente: false, sostituisce: { nome: supplenteDoc.getNomeCompleto(), email: supplenteDoc.id ?? '' } };
      }
    }
  }

  /** Final substitute email for any subject the docente teaches in this class, or null. */
  private effettivoSupplente(vm: DocenteCdcVM, titolare: Docente, classe: Classe, date: Date): string | null {
    for (const m of vm.materie) {
      const supp = this.supplenze.findSupplenzaSpecifica(titolare, date, classe.classeId, MateriaId.of(m.sigla));
      if (supp !== null) return supp.supplente;
    }
    return null;
  }
}
