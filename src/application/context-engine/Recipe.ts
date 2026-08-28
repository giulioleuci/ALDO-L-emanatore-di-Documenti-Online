import type { RecipeOptionsView } from './Cdu';
import { ValidationError } from '../../domain/errors/DomainError';
import { GestioneSupplenti, type TipoPiano } from '../../domain/value-objects/enums';

/**
 * A Recipe declares which providers to activate (ordered tokens, see 09 §3/§4)
 * and the loading options copied into `cdu.meta.parametriInput.opzioni`.
 */
export interface RecipeOptions extends Omit<RecipeOptionsView, 'gestioneSupplenti'> {
  includiStorico: boolean;
  profonditaAnniStorico: number;
  profonditaAnniAsl: number;
  profonditaAnniDocumenti: number;
  includiSupplenti: boolean;
  notificaSoloCoordinatori: boolean;
  includiPartnerDettaglio: boolean;
  gestioneSupplenti: GestioneSupplenti;
  [key: string]: unknown;
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
  tipoTarget: 'classe' | 'alunno' | 'dipartimento';
  now: Date;
  idConfigurazione?: string;
  tipoOperazione?: string;
  idEsecuzione?: string;
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
 * | token         | writes                                              | reads (CDU-level; own repo lookups don't count) |
 * |---------------|------------------------------------------------------|--------------------------------------------------|
 * | school        | cdu.istituto                                          | —                                                  |
 * | class         | tech.entita.classe, focus.classe.{anagrafica,flags,articolazione,coordinatori} | — (resolves target via params/repos directly) |
 * | students      | focus.classe.studenti                                 | tech.entita.classe (class)                        |
 * | student       | tech.entita.alunno, focus.alunno.*                    | cdu.istituto.organizzazione.annoScolastico (school, soft dep — silently 0 if absent, used for `didattica.asl.oreAnnoCorrente`) |
 * | tutor         | focus.classe.tutor                                    | tech.entita.classe (class)                        |
 * | consiglio     | focus.classe.consiglioDiClasse                        | tech.entita.classe (class). The council projection reads TUTOR_ASL/TUTOR_ORIENT roles from `ClasseRepository` directly and does not depend on `focus.classe.tutor`. |
 * | materie       | focus.classe.materie, focus.classe.materiePerPrincipale (+ continuita per subject, only if includiStorico and docenti/storicoDb/classi are all supplied) | focus.classe.consiglioDiClasse (consiglio) — derives the catalog entirely from it, never re-queries teaching assignments |
 * | esame         | focus.classe.esame                                    | focus.classe.materie (materie) — reads isMateriaPrimaProva/isMateriaSecondaProva, already resolved per indirizzo by MaterieClasseProvider/TeachingCouncilProjection |
 * | progetti      | focus.classe.progetti, focus.classe.hasProgetti       | tech.entita.classe (class)                        |
 * | partner       | focus.classe.partner.{primo,secondo} (only if focus.classe.flags.isArticolata AND options.includiPartnerDettaglio) | focus.classe.flags.isArticolata, focus.classe.articolazione.partners (class); focus.classe.consiglioDiClasseComune, focus.classe.consiglioDiClasseSeparato (consiglio) — partitioned by tipoArticolazione into partners[0]=SEPARATO_PRIMO/partners[1]=SEPARATO_SECONDO, NOT re-resolved (ConsiglioClasseProvider.resolveConsiglio returns the whole group's roster for any partner classe id, so re-running it per partner would be a no-op duplication — fix round 1). Re-runs class/students/tutor (not consiglio) against a throwaway scratch CDU per partner class id for anagrafica/studenti/coordinatori — reads nothing from the outer focus.classe.studenti/tutor and writes nothing back into them (zero cross-contamination with the main projection) |
 * | rappresentanti| focus.classe.rappresentanti                           | tech.entita.classe (class)                        |
 * | statistiche   | cdu.istituto.statistiche (if school ran), focus.classe.studenti.statistiche (if present) | cdu.istituto (school, guarded — skips if absent); focus.classe.studenti (students, guarded — skips if absent) |
 * | storicoClasse | focus.classe.storico (LazyRef, only if options.includiStorico) | tech.entita.classe (class) via focus.classe guard |
 * | carenze       | focus.alunno.didattica.carenze                        | tech.entita.alunno (student)                      |
 * | piani         | focus.alunno.didattica.piani, flips focus.alunno.status.isBes | tech.entita.alunno (student); overwrites the `isBes=false` placeholder AlunnoProvider set — MUST run after student |
 * | documenti     | focus.alunno.didattica.documenti                      | tech.entita.alunno (student)                      |
 * | documentiStorico | focus.alunno.didattica.documenti.storico (LazyRef, only if options.includiStorico) | focus.alunno.didattica.documenti (documenti) — must run after it |
 * | storico       | focus.alunno.storico (LazyRef, only if options.includiStorico) | tech.entita.alunno (student) via focus.alunno guard |
 * | carenzaFocus  | focus.carenza                                         | tech.entita.alunno (student)                      |
 *
 * Every recipe below places `school`/`class` first and, where used, `student`
 * before `carenze`/`piani`/`documenti`/`storico`/`carenzaFocus` and `class`
 * before `students`/`tutor`/`consiglio`/`materie`/`esame`/`progetti`/`partner`/
 * `rappresentanti`/`statistiche`, `consiglio` before `materie`, and `materie`
 * before `esame` — so all currently-declared orderings are consistent with
 * the table above. `partner` reads `class`'s output (`focus.classe.flags.
 * isArticolata`/`articolazione.partners`) AND `consiglio`'s output
 * (`focus.classe.consiglioDiClasseComune`/`consiglioDiClasseSeparato`, fix
 * round 1) — `CLASSE_COMPLETA` already places `consiglio` before `partner`,
 * so this is a real, currently-satisfied ordering dependency, not merely
 * where the token happened to land. A future edit that violates one of the
 * real reads above (e.g. moving `piani` before `student`, or `partner`
 * before `consiglio`) will not fail loudly here — it degrades silently or
 * throws a runtime `EntityNotFoundError`/`TypeError` deep inside a provider,
 * not at recipe-definition time. See the standalone-`DependencyResolver`
 * investigation note further below for why this isn't currently backed by a
 * structural check.
 */
export const RECIPES: Record<string, string[]> = {
  CLASSE_COMPLETA: [
    'school',
    'class',
    'students',
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
  CLASSE_MATERIA: ['school', 'class', 'consiglio', 'classeMateriaFocus'],
  ALUNNO_DETTAGLIATO: [
    'school',
    'class',
    'student',
    'carenze',
    'piani',
    'documenti',
    'documentiStorico',
    'storico'
  ],
  DOCENTE_COMPLETO: [
    'school',
    'class',
    'consiglio',
    'materie',
    'pianiPersClasse',
    'pianiPersClasseStorico',
    'documentiClasse'
  ],
  ALUNNO_COMPLETO: [
    'school',
    'class',
    'student',
    'carenze',
    'piani',
    'pianiPersAlunno',
    'pianiPersAlunnoStorico',
    'storico'
  ],
  PIANO_PERSONALIZZATO: [
    'school',
    'class',
    'student',
    'carenze',
    'piani',
    'pianoFocus',
    'pianiPersAlunno',
    'pianiPersAlunnoStorico'
  ],
  FAMIGLIA_COMPLETO: [
    'school',
    'class',
    'student',
    'carenze',
    'piani',
    'documenti',
    'documentiStorico',
    'pianiPersAlunno',
    'pianiPersAlunnoStorico'
  ],
  CARENZA_COMPLETO: ['school', 'class', 'student', 'carenze', 'piani', 'carenzaFocus'],
  /** Department-scoped recipe (11 §11 new) — a dipartimento has no class dimension, so this activates only 'school' + 'dipartimentoFocus'. */
  DIPARTIMENTO_COMPLETO: ['school', 'dipartimentoFocus']
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
