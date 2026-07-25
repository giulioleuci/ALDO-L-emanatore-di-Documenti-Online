import { ClasseRepository } from '../../infrastructure/repositories/ClasseRepository';
import type { IClasseRepository } from '../../domain/repositories/IClasseRepository';
import { DocenteRepository } from '../../infrastructure/repositories/DocenteRepository';
import { SupplenzaRepository } from '../../infrastructure/repositories/SupplenzaRepository';
import { VariazioneCattedraRepository } from '../../infrastructure/repositories/VariazioneCattedraRepository';
import type { ISupplenzaRepository } from '../../domain/repositories/ISupplenzaRepository';
import type { IVariazioneCattedraRepository } from '../../domain/repositories/IVariazioneCattedraRepository';
import type { IDocenteRepository } from '../../domain/repositories/IDocenteRepository';
import type { Classe } from '../../domain/entities/Classe';
import type { Docente } from '../../domain/entities/Docente';
import type { VariazioneCattedra } from '../../domain/entities/VariazioneCattedra';
import type { MateriaId } from '../../domain/value-objects/MateriaId';
import {
  AmbiguousVariazioneCattedraError,
  VariazioneCattedraInconsistenteError,
  VariazioneCattedraTitolareNonTrovatoError
} from '../../domain/errors/DomainError';

/** One resolved cattedra slot: the effective permanent holder plus any active substitute (Task 4 adds `materia`/`isItp` fan-out via resolveConsiglio). */
export interface CattedraAssignment {
  titolare: Docente;
  isItp: boolean;
  supplente: Docente | null;
}

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
 */
export class CattedraResolver {
  private readonly classi: IClasseRepository;
  private readonly docenti: IDocenteRepository;
  private readonly supplenze: ISupplenzaRepository;
  private readonly variazioni: IVariazioneCattedraRepository;

  constructor(database: RepositoryDatabase) {
    this.classi = new ClasseRepository(database);
    this.docenti = new DocenteRepository(database);
    this.supplenze = new SupplenzaRepository(database);
    this.variazioni = new VariazioneCattedraRepository(database);
  }

  /** Effective teachers for the class/subject at `data` (main column only until Task 4). */
  resolveTitolari(classe: Classe, materia: MateriaId, data: Date): Docente[] {
    const nominali = this.classi.getDocentiPerMateria(classe, materia);
    const titolari = this.risolviSlot(classe, materia, data, nominali);
    const effettivi: Docente[] = [];
    const seen = new Set<string>();
    for (const titolare of titolari) {
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

  /**
   * Priority 2-over-3 for one nominal slot: `nominali` is the Priority-3 holder
   * set for the slot being resolved (main column here; Task 4 adds the itp
   * column as a second slot). Throws rather than silently falling back on any
   * data inconsistency (confirmed product decision).
   */
  private risolviSlot(
    classe: Classe,
    materia: MateriaId,
    data: Date,
    nominali: Docente[]
  ): Docente[] {
    const decorse = this.variazioni
      .findByClasse(classe.classeId)
      .filter((v) => v.applicaAMateria(materia) && v.isDecorsaA(data));
    if (decorse.length === 0) return nominali;

    const nominaliIds = new Set(nominali.map((d) => d.id));
    const perQuestoSlot = decorse.filter((v) => nominaliIds.has(v.vecchioTitolare));
    if (perQuestoSlot.length === 0) {
      if (this.matchesNoSlotAtAll(decorse, classe, materia)) {
        const v = decorse[0]!;
        throw new VariazioneCattedraInconsistenteError(
          `VARIAZIONI_CATTEDRA ${v.id ?? '?'} (VECCHIO_TITOLARE=${v.vecchioTitolare}) non corrisponde ` +
            `al titolare nominale attuale di ${classe.id ?? '?'}/${materia.value}`
        );
      }
      return nominali; // relevant to another slot only (e.g. itp) — this slot defers to CLASSI
    }

    const maxDecorrenza = Math.max(
      ...perQuestoSlot.map((v) => new Date(v.dataDecorrenza).getTime())
    );
    const vincitrici = perQuestoSlot.filter(
      (v) => new Date(v.dataDecorrenza).getTime() === maxDecorrenza
    );
    if (vincitrici.length > 1) {
      throw new AmbiguousVariazioneCattedraError(
        `Più VARIAZIONI_CATTEDRA con la stessa DATA_DECORRENZA più recente per ` +
          `${classe.id ?? '?'}/${materia.value}: ${vincitrici.map((v) => v.id ?? '?').join(', ')}`
      );
    }
    const vinta = vincitrici[0]!;
    const nuovo = this.docenti.findById(vinta.nuovoTitolare);
    if (nuovo === null) {
      throw new VariazioneCattedraTitolareNonTrovatoError(
        `VARIAZIONI_CATTEDRA ${vinta.id ?? '?'}: NUOVO_TITOLARE ${vinta.nuovoTitolare} non trovato in DOCENTI`
      );
    }
    return [nuovo];
  }

  /** True when every decorsa/scope-matching row also fails to match a hypothetical itp slot — i.e. it's a straight-up bad row, not just "for the other slot" (Task 4 gives this a real itp nominal list to check against; until then any non-main match is treated as inconsistent). */
  private matchesNoSlotAtAll(
    decorse: VariazioneCattedra[],
    classe: Classe,
    materia: MateriaId
  ): boolean {
    void classe;
    void materia;
    return decorse.length > 0;
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
