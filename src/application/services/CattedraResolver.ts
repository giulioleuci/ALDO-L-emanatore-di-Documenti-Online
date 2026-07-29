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
import type { ClasseId } from '../../domain/value-objects/ClasseId';
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
  specifica?: string | null;
  supplente: Docente | null;
  /**
   * The classe this assignment was actually resolved against — the queried
   * classe for a non-articulated class, or the specific partner for a split
   * subject on an articulated parent (the parent itself is never the value
   * here: it has no nominal column of its own for a split subject). Callers
   * that apply their own supplenza routing on top of an already-extracted
   * titolare (ref RisolutoreRuoliService.applicaSupplenze) need this to check
   * SUPPLENZE against the correct classe, not always the originally-queried one.
   */
  classeId: ClasseId;
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

  /**
   * Permanent holder(s) only — SOLO_TITOLARI semantics, ignores any active
   * supplenza. Carries the classe each holder was actually resolved against
   * (the partner class for a split subject on an articulated parent) — needed
   * by callers (RisolutoreRuoliService.docenteMateria/docentiProva) that apply
   * their own supplenza routing afterward, so that routing checks SUPPLENZE
   * against the correct classe instead of the originally-queried one.
   */
  resolvePermanenti(
    classe: Classe,
    materia: MateriaId,
    data: Date
  ): { titolare: Docente; classeId: ClasseId }[] {
    const seen = new Set<string>();
    const out: { titolare: Docente; classeId: ClasseId }[] = [];
    for (const a of this.resolveCattedra(classe, materia, data)) {
      if (a.titolare.id != null && !seen.has(a.titolare.id)) {
        seen.add(a.titolare.id);
        out.push({ titolare: a.titolare, classeId: a.classeId });
      }
    }
    return out;
  }

  /**
   * One assignment per populated slot (main + itp) for (classe, materia, date).
   * For an articulated class, partner-routes internally (never resolves
   * against the parent — the parent legitimately has no nominal value for a
   * subject split per-partner) and merges the two partners' assignments,
   * deduping an identically-held subject (COMUNE) into one entry. This is the
   * single source of truth for articulated-class resolution — CdcAssembler
   * and RisolutoreRuoliService both consume it without reimplementing routing.
   */
  resolveCattedra(classe: Classe, materia: MateriaId, data: Date): CattedraAssignment[] {
    if (this.classi.isArticolata(classe)) {
      const partners = this.classi.orderedPartners(classe);
      if (partners.length >= 2) {
        return this.resolveCattedraArticolata(partners[0]!, partners[1]!, materia, data);
      }
    }
    return this.resolveCattedraDiretta(classe, materia, data);
  }

  private resolveCattedraDiretta(classe: Classe, materia: MateriaId, data: Date): CattedraAssignment[] {
    const out: CattedraAssignment[] = [];
    const mainNominali = this.classi.getDocentiPerMateria(classe, materia);
    const itpNominali = this.classi.getITPPerMateria(classe, materia);
    for (const titolareNominale of this.risolviSlot(classe, materia, data, mainNominali, itpNominali)) {
      out.push({
        materia,
        isItp: false,
        titolare: titolareNominale,
        supplente: this.trovaSupplente(titolareNominale, classe, materia, data),
        classeId: classe.classeId
      });
    }
    for (const titolareNominale of this.risolviSlot(classe, materia, data, itpNominali, mainNominali)) {
      out.push({
        materia,
        isItp: true,
        titolare: titolareNominale,
        supplente: this.trovaSupplente(titolareNominale, classe, materia, data),
        classeId: classe.classeId
      });
    }
    return out;
  }

  private resolveCattedraArticolata(
    primo: Classe,
    secondo: Classe,
    materia: MateriaId,
    data: Date
  ): CattedraAssignment[] {
    const inPrimo = this.resolveCattedraDiretta(primo, materia, data);
    const inSecondo = primo.id === secondo.id ? [] : this.resolveCattedraDiretta(secondo, materia, data);
    const byKey = new Map<string, CattedraAssignment>();
    const keyOf = (a: CattedraAssignment): string =>
      `${a.titolare.id ?? ''}::${a.supplente?.id ?? ''}::${a.isItp}`;
    for (const a of inPrimo) byKey.set(keyOf(a), a);
    for (const a of inSecondo) {
      const k = keyOf(a);
      if (!byKey.has(k)) byKey.set(k, a);
    }
    return [...byKey.values()];
  }

  /**
   * Class-wide fan-out over every MATERIE column (used by CDU/email enumeration).
   * `IS_RELIGIONE_ALT` materie (IRC/ALT) are excluded unless `includeReligioneAlt`
   * is set — preserves the existing distinction between roles that enumerate the
   * whole council including IRC/ALT (e.g. CDC) and roles that don't (e.g.
   * DOCENTI_NO_RELIGIONE), now that IRC/ALT are ordinary (flagged) MATERIE rows.
   */
  resolveConsiglio(
    classe: Classe,
    data: Date,
    options: { includeReligioneAlt?: boolean } = {}
  ): CattedraAssignment[] {
    const includeReligioneAlt = options.includeReligioneAlt ?? false;
    const out: CattedraAssignment[] = [];
    for (const materia of this.materie.findAllCached()) {
      if (materia.isReligioneAlt && !includeReligioneAlt) continue;
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
