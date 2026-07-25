import { ClasseRepository } from '../../infrastructure/repositories/ClasseRepository';
import type { IClasseRepository } from '../../domain/repositories/IClasseRepository';
import { DocenteRepository } from '../../infrastructure/repositories/DocenteRepository';
import { SupplenzaRepository } from '../../infrastructure/repositories/SupplenzaRepository';
import { VariazioneCattedraRepository } from '../../infrastructure/repositories/VariazioneCattedraRepository';
import { MateriaRepository } from '../../infrastructure/repositories/MateriaRepository';
import type { ISupplenzaRepository } from '../../domain/repositories/ISupplenzaRepository';
import type { IVariazioneCattedraRepository } from '../../domain/repositories/IVariazioneCattedraRepository';
import type { IDocenteRepository } from '../../domain/repositories/IDocenteRepository';
import type { IMateriaRepository } from '../../domain/repositories/IMateriaRepository';
import type { Classe } from '../../domain/entities/Classe';
import type { Docente } from '../../domain/entities/Docente';
import type { MateriaId } from '../../domain/value-objects/MateriaId';
import {
  AmbiguousVariazioneCattedraError,
  VariazioneCattedraInconsistenteError,
  VariazioneCattedraTitolareNonTrovatoError
} from '../../domain/errors/DomainError';

/** One resolved cattedra slot (main or itp): the effective permanent holder plus any active substitute. */
export interface CattedraAssignment {
  materia: MateriaId;
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
 * consulted for that holder. Each (class, subject) has two independent slots
 * — main and itp (Insegnante Tecnico Pratico) — resolved separately.
 */
export class CattedraResolver {
  private readonly classi: IClasseRepository;
  private readonly docenti: IDocenteRepository;
  private readonly supplenze: ISupplenzaRepository;
  private readonly variazioni: IVariazioneCattedraRepository;
  private readonly materie: IMateriaRepository;

  constructor(database: RepositoryDatabase) {
    this.classi = new ClasseRepository(database);
    this.docenti = new DocenteRepository(database);
    this.supplenze = new SupplenzaRepository(database);
    this.variazioni = new VariazioneCattedraRepository(database);
    this.materie = new MateriaRepository(database);
  }

  /** Effective teachers for the class/subject at `data`, across both main and itp slots. */
  resolveTitolari(classe: Classe, materia: MateriaId, data: Date): Docente[] {
    const effettivi: Docente[] = [];
    const seen = new Set<string>();
    for (const a of this.resolveCattedra(classe, materia, data)) {
      const d = a.supplente ?? a.titolare;
      if (d.id != null && !seen.has(d.id)) {
        seen.add(d.id);
        effettivi.push(d);
      }
    }
    return effettivi;
  }

  /** First effective teacher, or null when the subject has no holder. */
  resolveTitolare(classe: Classe, materia: MateriaId, data: Date): Docente | null {
    return this.resolveTitolari(classe, materia, data)[0] ?? null;
  }

  /** Permanent holder(s) only — SOLO_TITOLARI semantics, ignores any active supplenza. */
  resolvePermanenti(classe: Classe, materia: MateriaId, data: Date): Docente[] {
    const seen = new Set<string>();
    const out: Docente[] = [];
    for (const a of this.resolveCattedra(classe, materia, data)) {
      if (a.titolare.id != null && !seen.has(a.titolare.id)) {
        seen.add(a.titolare.id);
        out.push(a.titolare);
      }
    }
    return out;
  }

  /** One assignment per populated slot (main + itp) for (classe, materia, date). */
  resolveCattedra(classe: Classe, materia: MateriaId, data: Date): CattedraAssignment[] {
    const out: CattedraAssignment[] = [];
    const mainNominali = this.classi.getDocentiPerMateria(classe, materia);
    const itpNominali = this.classi.getITPPerMateria(classe, materia);
    for (const titolareNominale of this.risolviSlot(classe, materia, data, mainNominali, itpNominali)) {
      out.push({
        materia,
        isItp: false,
        titolare: titolareNominale,
        supplente: this.trovaSupplente(titolareNominale, classe, materia, data)
      });
    }
    for (const titolareNominale of this.risolviSlot(classe, materia, data, itpNominali, mainNominali)) {
      out.push({
        materia,
        isItp: true,
        titolare: titolareNominale,
        supplente: this.trovaSupplente(titolareNominale, classe, materia, data)
      });
    }
    return out;
  }

  /** Class-wide fan-out over every MATERIE column (used by CDU/email enumeration). */
  resolveConsiglio(classe: Classe, data: Date): CattedraAssignment[] {
    const out: CattedraAssignment[] = [];
    for (const materia of this.materie.findAllCached()) {
      out.push(...this.resolveCattedra(classe, materia.materiaId, data));
    }
    return out;
  }

  private trovaSupplente(
    titolare: Docente,
    classe: Classe,
    materia: MateriaId,
    data: Date
  ): Docente | null {
    const risolto = this.applicaSupplenza(titolare, classe, materia, data);
    return risolto.id === titolare.id ? null : risolto;
  }

  /**
   * Priority 2-over-3 for one nominal slot: `nominali` is the Priority-3
   * holder set for the slot being resolved; `nominaliAltroSlot` is the other
   * slot's set, consulted only to distinguish "this variazione belongs to the
   * other slot" from "this variazione is inconsistent data". Throws rather
   * than silently falling back on any data inconsistency (confirmed product
   * decision) — applies independently per slot.
   */
  private risolviSlot(
    classe: Classe,
    materia: MateriaId,
    data: Date,
    nominali: Docente[],
    nominaliAltroSlot: Docente[]
  ): Docente[] {
    const decorse = this.variazioni
      .findByClasse(classe.classeId)
      .filter((v) => v.applicaAMateria(materia) && v.isDecorsaA(data));
    if (decorse.length === 0) return nominali;

    const nominaliIds = new Set(nominali.map((d) => d.id));
    const altroSlotIds = new Set(nominaliAltroSlot.map((d) => d.id));
    const perQuestoSlot = decorse.filter((v) => nominaliIds.has(v.vecchioTitolare));
    if (perQuestoSlot.length === 0) {
      const perAltroSlot = decorse.some((v) => altroSlotIds.has(v.vecchioTitolare));
      if (!perAltroSlot) {
        const v = decorse[0]!;
        throw new VariazioneCattedraInconsistenteError(
          `VARIAZIONI_CATTEDRA ${v.id ?? '?'} (VECCHIO_TITOLARE=${v.vecchioTitolare}) non corrisponde ` +
            `al titolare nominale attuale di ${classe.id ?? '?'}/${materia.value}`
        );
      }
      return nominali; // relevant to the other slot only — this slot defers to CLASSI
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
