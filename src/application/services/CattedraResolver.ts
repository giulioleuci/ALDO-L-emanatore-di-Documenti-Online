import { ClasseRepository } from '../../infrastructure/repositories/ClasseRepository';
import { DocenteRepository } from '../../infrastructure/repositories/DocenteRepository';
import { SupplenzaRepository } from '../../infrastructure/repositories/SupplenzaRepository';
import { VariazioneCattedraRepository } from '../../infrastructure/repositories/VariazioneCattedraRepository';
import type { ISupplenzaRepository } from '../../domain/repositories/ISupplenzaRepository';
import type { IVariazioneCattedraRepository } from '../../domain/repositories/IVariazioneCattedraRepository';
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
 * Priority 2-over-3 ("resolve the nominal holder") is a
 * `RoleResolutionLib.PriorityChainResolver` over two heterogeneous sources
 * (ref REPORT_GLF.md B3) — the first source that "applies" (returns non-null,
 * even an empty array) wins, distinct from a plain `??` fallback because a
 * matched-but-unresolved variazione must NOT fall through to CLASSI. Priority
 * 1 ("redirect to the active substitute") stays a separate step: it doesn't
 * choose between independent sources, it redirects whichever holder Priority
 * 2/3 already produced, via the library's transitive delegation crawl
 * (`SupplenzaRepository.findSupplenzaSpecifica` -> `RoleResolutionLib.getDelegationChain`).
 */
export class CattedraResolver {
  private readonly classi: ClasseRepository;
  private readonly docenti: DocenteRepository;
  private readonly supplenze: ISupplenzaRepository;
  private readonly variazioni: IVariazioneCattedraRepository;

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

  // Priority 2 over Priority 3, via PriorityChainResolver (ref REPORT_GLF.md B3).
  private baseTitolari(classe: Classe, materia: MateriaId, data: Date): Docente[] {
    const resolver = new PriorityChainResolver<[Classe, MateriaId, Date], Docente[]>([
      (c, m, d) => this.daVariazione(c, m, d),
      (c, m) => this.classi.getDocentiPerMateria(c, m)
    ]);
    return resolver.resolve(classe, materia, data) ?? [];
  }

  /**
   * Priority 2 source: null (defer to Priority 3) when no variazione applies;
   * otherwise the resolved holder — possibly `[]` if VARIAZIONI_CATTEDRA points
   * at a docente that no longer exists, which correctly stops the chain rather
   * than falling through to the CLASSI nominal holder.
   */
  private daVariazione(classe: Classe, materia: MateriaId, data: Date): Docente[] | null {
    const variazione = this.variazioni
      .findByClasse(classe.classeId)
      .find((v) => v.applicaAMateria(materia) && v.isDecorsaA(data));
    if (variazione === undefined) return null;
    const nuovo = this.docenti.findById(variazione.nuovoTitolare);
    return nuovo === null ? [] : [nuovo];
  }

  // Priority 1: redirect a holder to the chain-resolved active substitute.
  private applicaSupplenza(
    titolare: Docente,
    classe: Classe,
    materia: MateriaId,
    data: Date
  ): Docente {
    const supplenza = this.supplenze.findSupplenzaSpecifica(
      titolare,
      data,
      classe.classeId,
      materia
    );
    if (supplenza === null) return titolare;
    return this.docenti.findById(supplenza.supplente) ?? titolare;
  }
}
