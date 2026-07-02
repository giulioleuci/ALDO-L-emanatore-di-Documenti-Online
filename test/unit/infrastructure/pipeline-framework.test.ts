import { PipelineContext } from '../../../src/infrastructure/pipelines/PipelineContext';
import { Step } from '../../../src/infrastructure/pipelines/Step';
import { DocumentoPipeline } from '../../../src/infrastructure/pipelines/DocumentoPipeline';

class SetFlag extends Step {
  readonly name = 'SetFlag';
  protected critical = false;
  protected _executeLogic(ctx: PipelineContext): void { ctx.set('ran', true); }
}
class Boom extends Step {
  readonly name = 'Boom';
  protected critical = true;
  protected _executeLogic(): void { throw new Error('kaboom'); }
}

test('steps run in order and log success', () => {
  const ctx = new PipelineContext();
  new DocumentoPipeline(() => {}).addStep(new SetFlag()).execute(ctx);
  expect(ctx.get('ran')).toBe(true);
  expect(ctx.logEsecuzione.some((l) => l.includes('SetFlag'))).toBe(true);
});

test('critical step failure triggers rollback of newFileId (10 §8)', () => {
  const ctx = new PipelineContext();
  ctx.set('newFileId', 'file_9');
  const rolledBack: string[] = [];
  const pipe = new DocumentoPipeline((id) => rolledBack.push(id)).addStep(new Boom());
  expect(() => pipe.execute(ctx)).toThrow('kaboom');
  expect(rolledBack).toEqual(['file_9']);
});

test('shouldExecute=false skips step', () => {
  class Skipped extends SetFlag { override shouldExecute(): boolean { return false; } }
  const ctx = new PipelineContext();
  new DocumentoPipeline(() => {}).addStep(new Skipped()).execute(ctx);
  expect(ctx.get('ran')).toBeUndefined();
});
