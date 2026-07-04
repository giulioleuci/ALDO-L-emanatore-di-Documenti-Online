import type { Cdu } from './Cdu';
import type { BuildParams, RecipeOptions } from './Recipe';

/**
 * A ContextProvider populates one section of the CDU (09 §4). It receives the
 * CDU assembled so far (so late providers can read what earlier ones wrote — the
 * ordering dependencies of 09, e.g. ConsiglioClasseProvider needing the tutor
 * flags, or PianiProvider updating `focus.alunno.status.isBes`) and writes its
 * own section directly into it. The builder resolves each recipe token to a
 * provider via the library ProviderRegistry.
 */
export interface ContextProvider {
  provide(cdu: Cdu, params: BuildParams, options: RecipeOptions): void;
}
