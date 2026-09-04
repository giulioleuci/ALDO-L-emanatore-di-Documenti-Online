// Harness test: proves the vendored PipelineFramework globals (Pipeline, Step,
// PipelineContext) behave as SGSA's document pipeline relies on — conditional
// gating, non-critical continuation (stopOnError:false), critical stop via
// requestStop from the onError hook, and execution-history telemetry.

const logger = new LoggerService();

class SetFlag extends Step {
  constructor() {
    super('SetFlag', logger, { shouldExecuteCondition: (ctx) => ctx.get('skip') !== true });
  }
  protected _executeLogic(ctx: PipelineContext): void {
    this.setResult(ctx, 'ran', true);
  }
}

class Boom extends Step {
  constructor(name = 'Boom') {
    super(name, logger);
  }
  protected _executeLogic(): void {
    throw new Error('kaboom');
  }
}

test('steps run in order and are recorded in the execution history', () => {
  const ctx = new Pipeline(logger).addStep(new SetFlag()).execute({});
  expect(ctx.get('ran')).toBe(true);
  const history = ctx.getExecutionHistory();
  expect(history.map((h) => `${h.stepName}:${h.status}`)).toEqual(['SetFlag:completed']);
});

test('shouldExecuteCondition=false skips the step (recorded as skipped)', () => {
  const ctx = new Pipeline(logger).addStep(new SetFlag()).execute({ skip: true });
  expect(ctx.get('ran')).toBeNull();
  expect(ctx.getExecutionHistory()[0]!.status).toBe('skipped');
});

test('stopOnError:false — a failing step is recorded and the pipeline continues (non-critical semantics)', () => {
  const pipeline = new Pipeline(logger, null, { stopOnError: false });
  const ctx = pipeline.addStep(new Boom()).addStep(new SetFlag()).execute({});
  expect(ctx.get('ran')).toBe(true); // step after the failure still ran
  const summary = ctx.getSummary();
  expect(summary.failedSteps).toBe(1);
  expect(summary.completedSteps).toBe(1);
});

test('critical semantics — onError hook rolls back and requestStop halts the pipeline (10 §8)', () => {
  const rolledBack: string[] = [];
  const pipeline = new Pipeline(logger, null, { stopOnError: false });
  pipeline
    .addStep(new Boom('CloneTemplate'))
    .addStep(new SetFlag())
    .onError((step, ctx, error) => {
      rolledBack.push(String(ctx.get('newFileId')));
      ctx.set('criticalError', `${step.getName()}: ${error.message}`);
      ctx.requestStop('critical');
    });
  const ctx = pipeline.execute({ newFileId: 'file_9' });
  expect(rolledBack).toEqual(['file_9']);
  // the library wraps the failure in a StepExecutionError
  expect(ctx.get('criticalError')).toBe("CloneTemplate: Step 'CloneTemplate' failed: kaboom");
  expect(ctx.get('ran')).toBeNull(); // steps after the stop never ran
  expect(ctx.getSummary().stopRequested).toBe(true);
});

test('requiredKeys are validated by the library before executing the logic', () => {
  class Needy extends Step {
    constructor() {
      super('Needy', logger, { requiredKeys: ['mustExist'] });
    }
    protected _executeLogic(ctx: PipelineContext): void {
      this.setResult(ctx, 'ran', true);
    }
  }
  const ctx = new Pipeline(logger, null, { stopOnError: false }).addStep(new Needy()).execute({});
  expect(ctx.get('ran')).toBeNull();
  expect(ctx.getSummary().failedSteps).toBe(1);
});
