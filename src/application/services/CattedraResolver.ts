import { ClasseRepository } from '../../infrastructure/repositories/ClasseRepository';
import { DocenteRepository } from '../../infrastructure/repositories/DocenteRepository';
import { SupplenzaRepository } from '../../infrastructure/repositories/SupplenzaRepository';
import { VariazioneCattedraRepository } from '../../infrastructure/repositories/VariazioneCattedraRepository';
import type { Classe } from '../../domain/entities/Classe';
import type { Docente } from '../../domain/entities/Docente';
import type { MateriaId } from '../../domain/value-objects/MateriaId';

/**
 * Resolves the teacher(s) actually in charge of a (class, subject) at a given
 * date, applying the three-tier role-resolution hierarchy (ref 01 §4, CLAUDE.md):
 *
 *   Priority 1 — SUPPLENZE:          an active supplenza's (chain-resolved)
 *                                    substitute overrides everything
 *   Priority 2 — VARIAZIONI_CATTEDRA: a variation with DATA_DECORRENZA ≤ date
 *                                    replaces the nominal CLASSI holder
 *   Priority 3 — CLASSI (fallback):  the teacher in the subject column
 *
 * The first priority that produces a match wins; lower priorities are not
 * consulted for that holder.
 *
 * Deliberately not built on `RoleResolutionLib`: that library models generic,
 * explicitly-registered actor delegation chains (Alice→Bob→Charlie style
 * `RoleRegistry`/`DelegationSource`/`RoutingPolicy`), not a date-scoped
 * priority lookup across three differently-shaped Sheet tables (SUPPLENZE /
 * VARIAZIONI_CATTEDRA / CLASSI). The one place this class's neighbourhood
 * *does* fit the library's model — the transitive supply-of-supply crawl
 * within a single SUPPLENZE chain — is delegated correctly via
 * `SupplenzaRepository.findSupplenzaSpecifica` -> `RoleResolutionLib.getDelegationChain`.
 * Wrapping the outer 3-source chain itself would require extending the
 * library with a "priority-ordered source list" resolution mode that can
 * wrap heterogeneous data sources as `DelegationSource`-like adapters; until
 * that exists (or is judged not worth building), this hierarchy stays here.
 */
export class CattedraResolver {
  private readonly classi: ClasseRepository;
  private readonly docenti: DocenteRepository;
  private readonly supplenze: SupplenzaRepository;
  private readonly variazioni: VariazioneCattedraRepository;

  constructor(database: RepositoryDatabase) {
    this.classi = new ClasseRepository(database);
    this.docenti = new DocenteRepository(database);
    this.supplenze = new SupplenzaRepository(database);
    this.variazioni = new VariazioneCattedraRepository(database);
  }

  /**
   * Effective teachers for the class/subject at `data`. Starts from the nominal
   * CLASSI holders (Priority 3), swaps in the variation's new holder if one is
   * in force (Priority 2), then redirects each holder to the active substitute
   * following the supply chain (Priority 1).
   */
  resolveTitolari(classe: Classe, materia: MateriaId, data: Date): Docente[] {
    const nominali = this.baseTitolari(classe, materia, data);
    const effettivi: Docente[] = [];
    const seen = new Set<string>();
    for (const titolare of nominali) {
      const risolto = this.applicaSupplenza(titolare, classe, materia, data);
      if (risolto.id != null && !seen.has(risolto.id)) {
        seen.add(risolto.id);
        effettivi.push(risolto);
      }
    }
    return effettivi;
  }

  /** First effective teacher, or null when the subject has no holder. */
  resolveTitolare(classe: Classe, materia: MateriaId, data: Date): Docente | null {
    return this.resolveTitolari(classe, materia, data)[0] ?? null;
  }

  // Priority 2 over Priority 3.
  private baseTitolari(classe: Classe, materia: MateriaId, data: Date): Docente[] {
    const variazione = this.variazioni
      .findByClasse(classe.classeId)
      .find((v) => v.applicaAMateria(materia) && v.isDecorsaA(data));
    if (variazione !== undefined) {
      const nuovo = this.docenti.findById(variazione.nuovoTitolare);
      return nuovo === null ? [] : [nuovo];
    }
    return this.classi.getDocentiPerMateria(classe, materia);
  }

  // Priority 1: redirect a holder to the chain-resolved active substitute.
  private applicaSupplenza(titolare: Docente, classe: Classe, materia: MateriaId, data: Date): Docente {
    const supplenza = this.supplenze.findSupplenzaSpecifica(titolare, data, classe.classeId, materia);
    if (supplenza === null) return titolare;
    return this.docenti.findById(supplenza.supplente) ?? titolare;
  }
}
