import type { PipelineContext } from './PipelineContext';
import type { Step } from './Step';

export class DocumentoPipeline {
  private readonly steps: Step[] = [];
  constructor(private readonly onRollback: (fileId: string) => void) {}
  addStep(step: Step): this { this.steps.push(step); return this; }
  execute(ctx: PipelineContext): PipelineContext {
    try {
      for (const step of this.steps) {
        if (step.shouldExecute(ctx)) step.execute(ctx);
      }
      return ctx;
    } catch (e) {
      const orphan = ctx.get<string>('newFileId');
      if (orphan) this.onRollback(orphan);
      throw e;
    }
  }
}
