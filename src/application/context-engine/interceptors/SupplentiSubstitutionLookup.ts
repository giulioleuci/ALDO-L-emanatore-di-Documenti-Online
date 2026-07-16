import type { Cdu, DocenteCdcVM } from '../Cdu';
import type { RecipeOptions } from '../Recipe';
import type { DocenteRepository } from '../../../infrastructure/repositories/DocenteRepository';
import type { SupplenzaRepository } from '../../../infrastructure/repositories/SupplenzaRepository';
import type { Classe } from '../../../domain/entities/Classe';
import type { Docente } from '../../../domain/entities/Docente';
import { MateriaId } from '../../../domain/value-objects/MateriaId';
import { GestioneSupplenti } from '../../../domain/value-objects/enums';

/**
 * `substitutionLookup` policy function for the library's generalized
 * `SwapAndEnrichInterceptor` (`targetPaths` mode — see
 * `GasLibraryFactory/ContextEngine/src/interceptors/SwapAndEnrichInterceptor.js`,
 * vendored via `vendor/gaslibs.Code.js`).
 *
 * This is the ALDO-specific POLICY half of the split the library's
 * `_forEachAt` plumbing enables: the library walks
 * `cdu.focus.classe.consiglioDiClasse[]`/`cdu.focus.alunno.consiglioDiClasseFiltrato[]`
 * item-by-item and applies whatever outcome this function returns; this
 * function decides, for one `DocenteCdcVM` item at a time, whether/how it
 * should swap under the `GestioneSupplenti` (09 §5) rule:
 *   - `SOLO_SUPPLENTI` → returns an `annotate` outcome that overwrites both
 *     `stato` and `anagrafica` with the resolved supplente.
 *   - `ENTRAMBI`       → returns an `annotate` outcome that only overwrites
 *     `stato` (keeps the titolare's `anagrafica`, records who substitutes).
 *   - `SOLO_TITOLARI` (default) or no active supplenza → returns `null` (no
 *     swap for this item) — this is the 3-way decision the library's own
 *     boolean `optionFlag`/`_shouldIntercept` gate cannot express, which is
 *     exactly why that gate is skipped automatically once `targetPaths` is
 *     configured (see the library's JSDoc for the "why").
 *
 * Deliberately a plain module-level function (not a class): all it needs is
 * two repositories closed over at construction time, and the library's
 * `SwapAndEnrichInterceptor` already owns array-walking/outcome-application
 * (`_forEachAt`), name/provider scoping (`targetProviders`) and the
 * intercept/logging template method — there is nothing left here to
 * encapsulate in a subclass.
 */
export function createSupplentiSubstitutionLookup(
  docenti: DocenteRepository,
  supplenze: SupplenzaRepository
): (
  item: unknown,
  context: unknown,
  options: unknown
) => null | { action: 'annotate'; meta: Partial<DocenteCdcVM> } {
  return (item, context, options) => {
    const vm = item as DocenteCdcVM;
    const cdu = context as Cdu;
    const rule = (options as RecipeOptions | undefined)?.['gestioneSupplenti'] as
      GestioneSupplenti | undefined;
    if (rule !== GestioneSupplenti.SOLO_SUPPLENTI && rule !== GestioneSupplenti.ENTRAMBI)
      return null;

    const classe = cdu.tech.entita.classe as Classe | undefined;
    if (classe === undefined) return null;
    const date = new Date(cdu.meta.date.oggi.iso);

    const titolare = docenti.findById(vm.anagrafica.email);
    if (titolare === null) return null;
    const supplenteEmail = effettivoSupplente(vm, titolare, classe, date, supplenze);
    if (supplenteEmail === null) return null;
    const supplenteDoc = docenti.findById(supplenteEmail);
    if (supplenteDoc === null) return null;

    if (rule === GestioneSupplenti.SOLO_SUPPLENTI) {
      return {
        action: 'annotate',
        meta: {
          stato: {
            isSupplente: true,
            sostituisce: { nome: titolare.getNomeCompleto(), email: titolare.id ?? '' }
          },
          anagrafica: {
            nome: supplenteDoc.nome,
            cognome: supplenteDoc.cognome,
            email: supplenteDoc.id ?? '',
            genere: supplenteDoc.genere,
            appellativo: supplenteDoc.getAppellativo()
          }
        }
      };
    }

    // ENTRAMBI: keep the titolare's anagrafica, only record who substitutes.
    return {
      action: 'annotate',
      meta: {
        stato: {
          isSupplente: false,
          sostituisce: { nome: supplenteDoc.getNomeCompleto(), email: supplenteDoc.id ?? '' }
        }
      }
    };
  };
}

/** Final substitute email for any subject the docente teaches in this class, or null. */
function effettivoSupplente(
  vm: DocenteCdcVM,
  titolare: Docente,
  classe: Classe,
  date: Date,
  supplenze: SupplenzaRepository
): string | null {
  for (const m of vm.materie) {
    const supp = supplenze.findSupplenzaSpecifica(
      titolare,
      date,
      classe.classeId,
      MateriaId.of(m.sigla)
    );
    if (supp !== null) return supp.supplente;
  }
  return null;
}
