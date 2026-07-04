import type { RecipeOptionsView } from './Cdu';
import { ValidationError } from '../../domain/errors/DomainError';

/**
 * A Recipe declares which providers to activate (ordered tokens, see 09 §3/§4)
 * and the loading options copied into `cdu.meta.parametriInput.opzioni`.
 */
export interface RecipeOptions extends RecipeOptionsView {
  includiStorico: boolean;
  profonditaAnniStorico: number;
  profonditaAnniAsl: number;
  profonditaAnniDocumenti: number;
  includiSupplenti: boolean;
  includiSpecificita: boolean;
  notificaSoloCoordinatori: boolean;
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
  tipoTarget: 'classe' | 'alunno';
  now: Date;
  idConfigurazione?: string;
  tipoOperazione?: string;
  idEsecuzione?: string;
  materiaCorrente?: string | null;
}

export const DEFAULT_OPTIONS: RecipeOptions = {
  includiStorico: false,
  profonditaAnniStorico: 0,
  profonditaAnniAsl: 0,
  profonditaAnniDocumenti: 0,
  includiSupplenti: false,
  includiSpecificita: false,
  notificaSoloCoordinatori: false
};

/** Merge caller overrides onto the defaults (09 §3). */
export function makeOptions(overrides: Partial<RecipeOptions> = {}): RecipeOptions {
  return { ...DEFAULT_OPTIONS, ...overrides };
}

/** Predefined recipes (09 §3). Provider order is significant (dependency order). */
export const RECIPES: Record<string, string[]> = {
  CLASSE_COMPLETA: ['school', 'class', 'students', 'tutor', 'consiglio', 'rappresentanti', 'statistiche'],
  ALUNNO_DETTAGLIATO: ['school', 'class', 'student', 'carenze', 'piani', 'documenti', 'storico'],
  DOCENTE_COMPLETO: ['school', 'class', 'consiglio'],
  ALUNNO_COMPLETO: ['school', 'class', 'student', 'carenze', 'piani'],
  FAMIGLIA_COMPLETO: ['school', 'class', 'student', 'carenze', 'piani', 'documenti'],
  CARENZA_COMPLETO: ['school', 'class', 'student', 'carenze', 'piani', 'carenzaFocus']
};

/** Build a Recipe from a predefined name + options overrides. Throws on unknown name. */
export function recipe(name: string, overrides: Partial<RecipeOptions> = {}): Recipe {
  const providers = RECIPES[name];
  if (providers === undefined) throw new ValidationError(`Recipe sconosciuta: ${name}`);
  return { providers: providers.slice(), options: makeOptions(overrides) };
}
