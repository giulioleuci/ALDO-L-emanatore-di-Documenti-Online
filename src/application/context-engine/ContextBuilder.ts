import type { Cdu, CduTech } from './Cdu';
import type { ContextProvider } from './ContextProvider';
import type { BuildParams, Recipe } from './Recipe';
import { formatOggi } from './dates';

/**
 * Assembles the CDU (spec 09 §2), built ON the ContextEngine library's
 * reusable components: the `ProviderRegistry` (Registry Pattern) stores/
 * resolves providers by recipe token, the `InterceptorRegistry` +
 * `ContextInterceptor` middleware apply cross-cutting declarative projections
 * after selected providers, and —
 * assembly itself — the library's `ContextAssembler.assembleInto()`
 * MUTATION mode: every provider receives the SAME shared CDU across the
 * whole recipe run and mutates it in place (matching
 * `ContextProvider.provide(cdu, params, options): void`), instead of the
 * library's original `assemble()`, which merges each provider's RETURN
 * VALUE into a flat, provider-name-keyed map — not the shape SGSA's CDU
 * needs, since multiple providers read from and write into the SAME nested
 * paths in declared order (e.g. `piani` overwriting the `isBes` placeholder
 * `student` already wrote — see the provider dependency table in
 * `Recipe.ts`). `assembleInto` was added to GasLibraryFactory precisely to
 * close this gap; the assembler still owns recipe-declared execution order,
 * per-provider condition evaluation, retry, and running the registered
 * interceptors after each provider step — `ContextBuilder` no longer
 * hand-rolls any of that.
 *
 * build():
 *   1. initialize an empty CDU (meta from params, `tech` attached non-enumerable)
 *   2. map `recipe.providers` (ordered tokens) onto the library's recipe shape
 *      and call `assembleInto(cdu, libRecipe, params, recipe.options)`
 *   3. return the CDU (tech never serialized — 02 §7)
 */
export class ContextBuilder {
  private readonly providers: ProviderRegistry;
  private readonly interceptors: InterceptorRegistry;
  private readonly assembler: ContextAssembler;

  constructor(logger?: LoggerService) {
    const log = logger ?? new LoggerService();
    this.providers = new ProviderRegistry(log);
    this.interceptors = new InterceptorRegistry(log);
    // No expressionEngine/exceptionService: ALDO recipes carry no per-provider
    // `condition`/retry config (RECIPES in Recipe.ts is a plain ordered token
    // list) — provider lookup (ProviderRegistry) is what ContextBuilder needs
    // from ContextAssembler here.
    this.assembler = new ContextAssembler(log, this.providers, null, null, this.interceptors);
  }

  /** Register a provider under its recipe token (09 §4). */
  registerProvider(token: string, provider: ContextProvider): this {
    this.providers.registerSingleton(token, provider);
    return this;
  }

  /** Register a cross-cutting interceptor applied after every provider (09 §5). */
  registerInterceptor(interceptor: LibContextInterceptor): this {
    this.interceptors.registerSingleton(interceptor.constructor.name, interceptor);
    return this;
  }

  build(params: BuildParams, recipe: Recipe): Cdu {
    const cdu = this.initCdu(params, recipe);
    // ProviderRegistry.get (invoked inside assembleInto) throws
    // ProviderNotFoundError for an unknown token (09 §4: "un token non
    // presente produce un errore di configurazione").
    const libRecipe: ContextAssemblerRecipe = {
      providers: recipe.providers.map((token) => ({ name: token, type: token }))
    };
    this.assembler.assembleInto(cdu, libRecipe, params, {
      ...recipe.options,
      logPosition: { depth: 1, isLast: false, ancestorHasNext: [] }
    });
    return cdu;
  }

  private initCdu(params: BuildParams, recipe: Recipe): Cdu {
    const base: Omit<Cdu, 'tech'> = {
      meta: {
        timestamp: params.now.toISOString(),
        idConfigurazione: params.idConfigurazione ?? '',
        tipoOperazione: params.tipoOperazione ?? '',
        idEsecuzione: params.idEsecuzione ?? '',
        date: { oggi: formatOggi(params.now) },
        parametriInput: {
          target: params.target,
          tipoTarget: params.tipoTarget,
          materiaCorrente: params.materiaCorrente ?? null,
          opzioni: { ...recipe.options }
        }
      },
      focus: {}
    };
    const tech: CduTech = {
      entita: {},
      servizi: [],
      pipeline: { statoCorrente: 'IN_CORSO', stepEseguiti: [], errori: [], logEsecuzione: [] }
    };
    // 02 §7 / 09 §2: `tech` MUST be non-enumerable so it never appears in
    // JSON.stringify() (prevents giant/circular logs). Values stay mutable so
    // providers can attach live entities during assembly.
    Object.defineProperty(base, 'tech', {
      value: tech,
      enumerable: false,
      writable: true,
      configurable: true
    });
    return base as Cdu;
  }
}
