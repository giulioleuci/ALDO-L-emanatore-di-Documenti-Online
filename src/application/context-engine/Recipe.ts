import type { OpzioniCduVM } from './Cdu';
import { ValidationError } from '../../domain/errors/DomainError';
import { GestioneSupplenti, type TipoPiano } from '../../domain/value-objects/enums';

/**
 * A Recipe declares which providers to activate (ordered tokens, see 09 §3/§4)
 * and the loading options copied into `cdu.meta.opzioni`.
 */
export interface RecipeOptions extends Omit<OpzioniCduVM, 'gestioneSupplenti'> {
  gestioneSupplenti: GestioneSupplenti;
}

export interface Recipe {
  providers: string[];
  options: RecipeOptions;
}

/**
 * The operation entry point: the target plus technical metadata carried into
 * `cdu.meta`. `now` is injected (never read from the system clock here) so the
 * assembled dates are deterministic and testable.
 */
export interface BuildParams {
  target: string;
  tipoTarget: 'classe' | 'alunno' | 'docente' | 'piano' | 'carenza' | 'materia' | 'dipartimento';
  now: Date;
  configurazioneId: string;
  esecuzioneId: string;
  tipoOperazione: 'GENERAZIONE_DOCUMENTO' | 'INVIO_NOTIFICA' | 'ESECUZIONE_AZIONE';
  materiaCorrente?: string | null;
  /** For the PER_CARENZA_GENITORI* pipelines: which CARENZE progressivo of the student is in focus (02 §4.3). */
  carenzaProgressivo?: number;
  /** Every class the email target is responsible for (11 §12) — feeds classe-wide providers like PianiPersClasseProvider. */
  classiCompetenza?: string[];
  /** Selected personalized-plan type for the PIANO_PERSONALIZZATO CDU recipe. */
  pianoTipo?: TipoPiano;
  /** Docente email scoping a single DOCUMENTO_DOCENTE_CLASSE_MATERIA generation target. */
  docenteCorrente?: string | null;
}

export const DEFAULT_OPTIONS: RecipeOptions = {
  includiStorico: false,
  profonditaAnniStorico: 0,
  profonditaAnniAsl: 0,
  profonditaAnniDocumenti: 0,
  includiSupplenti: false,
  notificaSoloCoordinatori: false,
  includiPartnerDettaglio: false,
  gestioneSupplenti: GestioneSupplenti.SOLO_TITOLARI
};

/** Merge caller overrides onto the defaults (09 §3). */
export function makeOptions(overrides: Partial<RecipeOptions> = {}): RecipeOptions {
  return { ...DEFAULT_OPTIONS, ...overrides };
}

/**
 * Predefined recipes (09 §3). Provider order is significant (dependency
 * order) — `ContextBuilder.build()` runs providers strictly left-to-right
 * over one shared, mutable `Cdu`, via the library's `ContextAssembler.
 * assembleInto()` mutation mode (see `ContextBuilder.ts`), so a provider can
 * only read what an earlier token already wrote. Providers here communicate
 * through implicit reads/writes on the nested CDU, not through declared
 * inputs/outputs merged into a flat map — `assembleInto` is exactly the
 * library capability that makes this workable without ALDO hand-rolling its
 * own assembly loop (the flat `assemble()`/`DependencyResolver` DAG model
 * still doesn't apply here: see the standalone-`DependencyResolver` note
 * further below, which is unaffected by this and still accurate).
 *
 * Verified provider dependency table (src/application/context-engine/providers/*.ts),
 * current as of this audit — re-verify against provider source before reordering:
 *
 * | token          | writes                                              | reads (CDU-level; own repo lookups don't count) |
 * |----------------|------------------------------------------------------|--------------------------------------------------|
 * | school         | cdu.istituto                                          | —                                                  |
 * | class          | tech.entita.classe, focus.classe.{nome,anno,sezione,indirizzo,isArticolata,...,articolazione,coordinatori} | — (resolves target via params/repos directly) |
 * | students       | focus.classe.studenti                                 | tech.entita.classe (class)                        |
 * | student        | tech.entita.alunno, focus.alunno.*                    | cdu.istituto.annoScolastico (school, soft dep — silently 0 if absent, used for `asl.oreAnnoCorrente`) |
 * | movimenti      | focus.alunno.{movimenti,presenza} (if focus.alunno present), focus.classe.movimenti + each focus.classe.studenti.elenco[].{movimenti,presenza} (if focus.classe present) | tech.entita.classe/alunno (class/student, via getClasseEntity guard); focus.classe.studenti (students, when present) |
 * | tutor          | focus.classe.tutor                                    | tech.entita.classe (class)                        |
 * | consiglio      | focus.classe.consiglio                                | tech.entita.classe (class). The council projection reads TUTOR_ASL/TUTOR_ORIENT roles from `ClasseRepository` directly and does not depend on `focus.classe.tutor`. |
 * | materie        | focus.classe.materie, focus.classe.materiePerPrincipale (+ continuita per subject, only if includiStorico and docenti/storicoDb/classi are all supplied) | focus.classe.consiglio.elenco (consiglio) — derives the catalog entirely from it, never re-queries teaching assignments |
 * | esame          | focus.classe.esame                                    | focus.classe.materie (materie) — reads isMateriaPrimaProva/isMateriaSecondaProva, already resolved per indirizzo by MaterieClasseProvider/TeachingCouncilProjection |
 * | progetti       | focus.classe.progetti                                 | tech.entita.classe (class)                        |
 * | partner        | focus.classe.partner.{primo,secondo} (only if focus.classe.isArticolata AND options.includiPartnerDettaglio) | focus.classe.isArticolata, focus.classe.articolazione.sottoClassi (class); focus.classe.consiglio.{comune,separatoPrimo,separatoSecondo,titolari,supplenze} (consiglio) — partitioned by tipoArticolazione into sottoClassi[0]=SEPARATO_PRIMO/sottoClassi[1]=SEPARATO_SECONDO, NOT re-resolved (re-running ConsiglioClasseProvider would re-resolve the whole group's roster twice for no gain). Re-runs class/students/tutor/movimenti (not consiglio) against a throwaway scratch CDU per partner class id — reads nothing from the outer focus.classe.studenti/tutor/movimenti and writes nothing back into them (zero cross-contamination with the main projection) |
 * | rappresentanti | focus.classe.rappresentanti                           | tech.entita.classe (class)                        |
 * | statistiche    | cdu.istituto.statistiche (if school ran), focus.classe.studenti.statistiche (if present) | cdu.istituto (school, guarded — skips if absent); focus.classe.studenti (students, guarded — skips if absent) |
 * | storicoClasse  | focus.classe.storico (LazyRef, only if options.includiStorico) | tech.entita.classe (class) via focus.classe guard |
 * | carenze        | focus.alunno.carenze                                  | tech.entita.alunno (student)                      |
 * | piani          | focus.alunno.piani, flips focus.alunno.isBes          | tech.entita.alunno (student); overwrites the `isBes=false` placeholder AlunnoProvider set — MUST run after student |
 * | documenti      | focus.alunno.documenti (elenco always populated; `storico` LazyRef always attached but only opens the historical DB when both dereferenced and includiStorico is true) | tech.entita.alunno (student) |
 * | pianiPersClasse | focus.classe.pianiPersonalizzati (elenco + nonVerbalizzati + lazy storico) | tech.entita.classe (class) via focus.classe guard |
 * | documentiClasse | focus.classe.documenti (elenco + lazy storico)       | tech.entita.classe (class) via focus.classe guard |
 * | storico        | focus.alunno.storico (LazyRef, only if options.includiStorico) | tech.entita.alunno (student) via focus.alunno guard |
 * | carenzaFocus   | focus.carenza                                         | tech.entita.alunno (student)                      |
 * | dipartimentoFocus | focus.dipartimento                                 | — (resolves target via params/repos directly)     |
 * | docenteAggregatoFocus | focus.docente, focus.cattedre                  | — (resolves params.classiCompetenza/docenteCorrente via repos directly) |
 *
 * Every recipe below places `school`/`class` first and, where used, `student`
 * before `carenze`/`piani`/`documenti`/`storico`/`carenzaFocus` and `class`
 * before `students`/`movimenti`/`tutor`/`consiglio`/`materie`/`esame`/`progetti`/
 * `partner`/`rappresentanti`/`statistiche`, `consiglio` before `materie`, and
 * `materie` before `esame` — so all currently-declared orderings are
 * consistent with the table above. `partner` reads `class`'s output
 * (`focus.classe.isArticolata`/`articolazione.sottoClassi`) AND `consiglio`'s
 * output (`focus.classe.consiglio.{comune,separatoPrimo,separatoSecondo}`) —
 * `CLASSE_COMPLETA` already places `consiglio` before `partner`, so this is a
 * real, currently-satisfied ordering dependency, not merely where the token
 * happened to land. A future edit that violates one of the real reads above
 * (e.g. moving `piani` before `student`, or `partner` before `consiglio`)
 * will not fail loudly here — it degrades silently or throws a runtime
 * `EntityNotFoundError`/`TypeError` deep inside a provider, not at
 * recipe-definition time. See the standalone-`DependencyResolver`
 * investigation note further below for why this isn't currently backed by a
 * structural check.
 */
export const RECIPES: Record<string, string[]> = {
  CLASSE_COMPLETA: [
    'school',
    'class',
    'students',
    'movimenti',
    'tutor',
    'consiglio',
    'materie',
    'esame',
    'progetti',
    'partner',
    'rappresentanti',
    'statistiche',
    'storicoClasse',
    'pianiPersClasse'
  ],
  CLASSE_DOCENTE_MATERIA: [
    'school',
    'class',
    'students',
    'movimenti',
    'tutor',
    'consiglio',
    'materie',
    'esame',
    'progetti',
    'partner',
    'rappresentanti',
    'statistiche',
    'storicoClasse',
    'pianiPersClasse',
    'docenteClasseMateriaFocus'
  ],
  CLASSE_MATERIA: ['school', 'class', 'movimenti', 'consiglio', 'classeMateriaFocus'],
  CLASSE_DOCENTE: [
    'school',
    'class',
    'students',
    'movimenti',
    'tutor',
    'consiglio',
    'materie',
    'esame',
    'progetti',
    'partner',
    'rappresentanti',
    'statistiche',
    'storicoClasse',
    'pianiPersClasse',
    'docenteClasseFocus'
  ],
  ALUNNO_DETTAGLIATO: [
    'school',
    'class',
    'student',
    'movimenti',
    'carenze',
    'piani',
    'documenti',
    'storico'
  ],
  DOCENTE_COMPLETO: [
    'school',
    'class',
    'movimenti',
    'consiglio',
    'materie',
    'pianiPersClasse',
    'documentiClasse'
  ],
  ALUNNO_COMPLETO: [
    'school',
    'class',
    'student',
    'movimenti',
    'carenze',
    'piani',
    'documenti',
    'storico'
  ],
  PIANO_PERSONALIZZATO: [
    'school',
    'class',
    'student',
    'movimenti',
    'carenze',
    'piani',
    'pianoFocus',
    'documenti'
  ],
  FAMIGLIA_COMPLETO: [
    'school',
    'class',
    'student',
    'movimenti',
    'carenze',
    'piani',
    'documenti'
  ],
  CARENZA_COMPLETO: ['school', 'class', 'student', 'movimenti', 'carenze', 'piani', 'carenzaFocus'],
  /** Department-scoped recipe (11 §11 new) — a dipartimento has no class dimension, so this activates only 'school' + 'dipartimentoFocus'. */
  DIPARTIMENTO_COMPLETO: ['school', 'dipartimentoFocus'],
  /** DOCENTE axis (spec §4.1.2) — one aggregate document per teacher, spanning every class in `params.classiCompetenza`. No single class in focus, so this activates only 'school' + 'docenteAggregatoFocus'. */
  DOCENTE_AGGREGATO: ['school', 'docenteAggregatoFocus'],
  /** CONF_AZIONI ASSE=SINGOLA (and the CONDIZIONE gate of every axis): institute-level CDU only, no focus. */
  AZIONE_SINGOLA: ['school']
};

/**
 * Why `ContextEngine`'s `DependencyResolver` isn't wired in as a standalone
 * ordering validator (medium-term step of the staged fix, ALDO_GASLIB_REPORT_MISSING.md
 * §2.1) — verified against source, not just docs, since `DOCS_LIBS/` doesn't
 * cover this class:
 *
 * `GasLibraryFactory/ContextEngine/src/internal/DependencyResolver.js` is NOT
 * a topological sorter over declared `{name, dependencies}` nodes (the
 * report's working hypothesis before this check). Its actual surface —
 * `resolve(dependency, initialParams, providerResults, providerName)` /
 * `resolveAll(...)` / `analyzeDependencies(...)` — resolves `@paramName` and
 * `$providerName.path` string placeholders found inside a *single provider's*
 * `parameters` config, substituting them with either an initial param or an
 * already-executed provider's output. `analyzeDependencies` only extracts the
 * `@`/`$` identifiers referenced in one parameters object; it never sees the
 * whole recipe as a graph and performs no sort. `ContextAssembler.js:164`
 * (`this._dependencyResolver = new DependencyResolver(logger)`) confirms it
 * is invoked per-provider, at the point the assembler is about to call that
 * provider — i.e. providers still run in the *recipe's declared array order*
 * (`ContextAssembler.js` has no ordering/sort logic elsewhere either); a
 * `$provider` reference to a not-yet-executed provider throws a
 * `DependencyResolutionError` *at that call*, which is the exact same
 * "runtime failure mid-assembly, not caught at recipe-definition time"
 * behaviour `ContextBuilder` already has today via `EntityNotFoundError`.
 *
 * So standalone `DependencyResolver` reuse would not add any earlier-than-now
 * validation — it is a same-order runtime substitution helper, not a
 * pre-flight structural checker, and there is no separate topological-sort
 * utility elsewhere in `ContextEngine` to reach for instead. The only way to
 * get real ahead-of-time ordering safety is the table-driven documentation
 * above (human-checked) or a genuine redesign where each ALDO provider
 * declares its CDU read/write paths and something is built to topo-sort
 * *that* — which is the "re-express every recipe as declarative JSON with
 * explicit parameters/$provider dependency references" the report already
 * calls a real, larger redesign. Deferred; this note plus the dependency
 * table above is the short-term mitigation.
 */

/** Build a Recipe from a predefined name + options overrides. Throws on unknown name. */
export function recipe(name: string, overrides: Partial<RecipeOptions> = {}): Recipe {
  const providers = RECIPES[name];
  if (providers === undefined) throw new ValidationError(`Recipe sconosciuta: ${name}`);
  const recipeDefaults =
    name === 'CLASSE_MATERIA' || name === 'CLASSE_DOCENTE_MATERIA'
      ? { gestioneSupplenti: GestioneSupplenti.SOLO_SUPPLENTI }
      : {};
  return { providers: providers.slice(), options: makeOptions({ ...recipeDefaults, ...overrides }) };
}
