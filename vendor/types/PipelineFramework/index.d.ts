/**
 * PipelineFramework - Sequential task execution with robust error handling
 *
 * @module PipelineFramework
 *
 * @description
 * PipelineFramework provides a generic, domain-agnostic engine for executing
 * sequential tasks with shared state management, error handling, and lifecycle hooks.
 *
 * ## Key Features
 *
 * - **Sequential Execution**: Execute steps in order with automatic state passing
 * - **Shared Context**: Mutable context object shared across all steps
 * - **Error Recovery**: Integrate with GasResilienceLib for automatic retry
 * - **Lifecycle Hooks**: beforeStep, afterStep, onError, onComplete callbacks
 * - **Stop Signals**: Steps can request graceful pipeline termination
 * - **Conditional Execution**: Steps can skip based on context state
 * - **Fluent API**: Clean, chainable interface for pipeline construction
 *
 * ## Architecture
 *
 * The framework is built on three core abstractions:
 *
 * 1. **Pipeline**: Orchestrates step execution and manages lifecycle
 * 2. **Step**: Abstract base class for all concrete task implementations
 * 3. **PipelineContext**: Wrapper for shared state with metadata tracking
 *
 * ## Quick Start
 *
 * ```javascript
 * import { Pipeline, Step } from '@PipelineFramework';
 * import { LoggerService } from '@CoreUtilsLib';
 * import { ExceptionService } from '@GasResilienceLib';
 *
 * const logger = new LoggerService();
 * const utils = { sleep: (ms) => Utilities.sleep(ms) };
 * const exceptionService = new ExceptionService(logger, utils);
 *
 * // Define a custom step
 * class LoadDataStep extends Step {
 *   _executeLogic(context) {
 *     const data = fetchData();
 *     this.setResult(context, 'data', data);
 *   }
 * }
 *
 * // Build and execute pipeline
 * const pipeline = new Pipeline(logger, exceptionService)
 *   .addStep(new LoadDataStep('load', logger))
 *   .addStep(new ProcessDataStep('process', logger))
 *   .addStep(new SaveDataStep('save', logger));
 *
 * const result = pipeline.execute({ userId: 123 });
 * ```
 *
 * ## Design Principles
 *
 * - **Domain-Agnostic**: No business logic in the framework
 * - **Dependency Injection**: All dependencies provided via constructor
 * - **Fail-Safe**: Comprehensive error handling with recovery strategies
 * - **Testable**: Clean abstractions for easy unit testing
 * - **Integration-Ready**: Works seamlessly with existing GasLibraryFactory ecosystem
 *
 * @version 1.0.0
 * @author GasLibraryFactory
 * @license MIT
 */
export { Pipeline } from './src/Pipeline.js';
export { Step } from './src/Step.js';
export { PipelineContext } from './src/PipelineContext.js';
export { PipelineError } from './src/internal/errors/PipelineError.js';
export { StepExecutionError } from './src/internal/errors/StepExecutionError.js';
export { ContextValidationError } from './src/internal/errors/ContextValidationError.js';
export * as testing from './src/testing/mocks.js';
export type { PipelineLogger, PipelineOptions, PipelineStep, StepOptions, StepResult, StepExecutionResult, ContextMetadata, StepHistory, LogPosition } from './src/internal/contracts.js';
