import type { PipelineContext } from './PipelineContext';

export abstract class Step {
  abstract readonly name: string;
  protected critical = false;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- kept for override signature parity
  shouldExecute(_ctx: PipelineContext): boolean { return true; }
  protected abstract _executeLogic(ctx: PipelineContext): void;
  execute(ctx: PipelineContext): void {
    try {
      this._executeLogic(ctx);
      ctx.addSuccess(this.name);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      ctx.addError(`${this.name}: ${msg}`);
      if (this.critical) throw e;
    }
  }
}
