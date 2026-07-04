/**
 * Port + adapter for GasExpressionEngineLib (L2). SGSA never evaluates
 * configuration expressions itself: CONF_DOC.CONDIZIONE, CONF_MAIL.CONDIZIONE
 * and conditional MODELLI are all evaluated through this library (safe AST, no
 * eval), with the CDU as the `{{...}}` placeholder context (ref 10 Step 1/6,
 * 06 §8). The port keeps callers agnostic of the library.
 */
export interface IExpressionEngine {
  /** Evaluates a boolean expression, resolving {{path}} placeholders from context. */
  evaluateBoolean(expression: string, context: Record<string, unknown>): boolean;
}

export class ExpressionEngineFacade implements IExpressionEngine {
  private readonly engine: ExpressionEngineService;

  constructor(engine?: ExpressionEngineService) {
    this.engine = engine ?? new ExpressionEngineService({ logger: new LoggerService() });
  }

  evaluateBoolean(expression: string, context: Record<string, unknown>): boolean {
    return this.engine.evaluate(expression, context) === true;
  }
}
