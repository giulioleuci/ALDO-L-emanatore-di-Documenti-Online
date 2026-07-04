import type { Cdu, CduTech } from './Cdu';
import type { ContextProvider } from './ContextProvider';
import type { BuildParams, Recipe } from './Recipe';
import { formatOggi } from './dates';

/**
 * Assembles the CDU (spec 09 §2). SGSA owns the nested-merge assembly loop
 * because the library's ContextAssembler produces a flat provider-keyed map, not
 * the aggregated CDU; but it is built ON the ContextEngine library's reusable
 * components — the `ProviderRegistry` (Registry Pattern) stores/resolves
 * providers by recipe token, and the `InterceptorRegistry` + `ContextInterceptor`
 * middleware apply cross-cutting enrichment (e.g. SwapAndEnrichInterceptor for
 * supplenti) after each provider.
 *
 * build():
 *   1. initialize an empty CDU (meta from params, `tech` attached non-enumerable)
 *   2. for each recipe token: resolve the provider, let it populate its section,
 *      then run every registered interceptor over the CDU
 *   3. return the CDU (tech never serialized — 02 §7)
 */
export class ContextBuilder {
  private readonly providers: ProviderRegistry;
  private readonly interceptors: InterceptorRegistry;

  constructor(logger?: LoggerService) {
    const log = logger ?? new LoggerService();
    this.providers = new ProviderRegistry(log);
    this.interceptors = new InterceptorRegistry(log);
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
    const activeInterceptors = this.interceptors.getAll();
    for (const token of recipe.providers) {
      // ProviderRegistry.get throws ProviderNotFoundError for an unknown token
      // (09 §4: "un token non presente produce un errore di configurazione").
      const provider: ContextProvider = this.providers.get(token);
      provider.provide(cdu, params, recipe.options);
      for (const interceptor of activeInterceptors) {
        interceptor.intercept(token, cdu, cdu, recipe.options);
      }
    }
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
    Object.defineProperty(base, 'tech', { value: tech, enumerable: false, writable: true, configurable: true });
    return base as Cdu;
  }
}
