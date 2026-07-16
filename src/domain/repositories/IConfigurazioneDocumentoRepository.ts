import type { ConfigurazioneDocumento } from '../entities/ConfigurazioneDocumento';

/**
 * Structural mirror of infrastructure's `IExpressionEngine` (GasExpressionEngineLib
 * port, see `src/infrastructure/facades/ExpressionEngineFacade.ts`). Domain
 * repository interfaces must stay free of infrastructure imports (ref CLAUDE.md:
 * "The Domain layer is agnostic of Google Sheets/Drive/Gmail"); TypeScript's
 * structural typing makes this interchangeable with the real port at call sites.
 */
interface IExpressionEnginePort {
  evaluateBoolean(expression: string, context: Record<string, unknown>): boolean;
}

export interface IConfigurazioneDocumentoRepository {
  /**
   * Whether the document must be generated for the given CDU context (ref 06 §8,
   * 10 Step 1): no CONDIZIONE → true; otherwise the expression is evaluated by
   * GasExpressionEngineLib with the CDU as the `{{...}}` context.
   */
  shouldGenerate(
    config: ConfigurazioneDocumento,
    context: Record<string, unknown>,
    engine: IExpressionEnginePort
  ): boolean;

  /**
   * Resolves the Drive template id, supporting both MODELLI forms (ref 10 Step 6):
   * the simple object `{templateId}`, or a conditional array whose first entry
   * with a satisfied `condizione` (evaluated by GasExpressionEngineLib) wins.
   * Throws when no template applies.
   */
  resolveTemplateId(
    config: ConfigurazioneDocumento,
    context: Record<string, unknown>,
    engine: IExpressionEnginePort
  ): string;
}
