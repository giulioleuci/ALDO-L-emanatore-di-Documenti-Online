import type { PipelineContext } from '../PipelineContext.js';
export interface LogPosition {
    depth: number;
    isLast: boolean;
    ancestorHasNext: boolean[];
}
export interface PipelineLogger {
    debug(message: string, ...details: unknown[]): unknown;
    info(message: string, ...details: unknown[]): unknown;
    warn(message: string, ...details: unknown[]): unknown;
    error(message: string, ...details: unknown[]): unknown;
    logPipelineStart?(name: string, steps: number, position: LogPosition): unknown;
    logPipelineStep?(name: string, status: string, details: unknown, position: LogPosition): unknown;
    logSummary?(name: string, duration: number, details: string, position?: Partial<LogPosition>): unknown;
    logStep?(message: string, position: LogPosition): unknown;
    withPosition?<T>(position: LogPosition, callback: () => T): T;
}
export interface RetryService {
    executeWithRetry?<T>(callback: () => T, context: Record<string, unknown>, retries: number): T;
}
export interface PipelineOptions {
    name?: string;
    stopOnError?: boolean;
    maxRetries?: number;
    logPosition?: Partial<LogPosition> | null;
    collapseSkippedSteps?: boolean;
}
export interface StepOptions<Data extends object> {
    requiredKeys?: string[];
    continueOnError?: boolean;
    shouldExecuteCondition?: ((context: PipelineContext<Data>) => unknown) | null;
}
export interface StepResult {
    success: boolean;
    skipped?: boolean;
    skipReason?: string;
    durationMs?: number;
    logDetails?: unknown;
    error?: unknown;
    data?: unknown;
}
export interface StepExecutionResult extends StepResult {
    skipped: boolean;
    durationMs: number;
}
export interface PipelineStep<Data extends object = Record<string, unknown>> {
    getName(): string;
    execute(context: PipelineContext<Data>): StepResult;
}
export interface PipelineHooks<Data extends object> {
    beforeStep: ((step: PipelineStep<Data>, context: PipelineContext<Data>) => unknown)[];
    afterStep: ((step: PipelineStep<Data>, context: PipelineContext<Data>, result: StepResult) => unknown)[];
    onError: ((step: PipelineStep<Data>, context: PipelineContext<Data>, error: unknown) => unknown)[];
    onComplete: ((context: PipelineContext<Data>, success: boolean) => unknown)[];
}
export interface LogEnvelope {
    content?: unknown;
    reason?: unknown;
    durationMs?: number;
}
export interface StepHistory {
    stepName: string;
    status: string;
    durationMs: number;
    details: Record<string, unknown>;
    timestamp: number;
}
export interface ContextMetadata {
    startTime: number;
    endTime: number | null;
    stopRequested: boolean;
    stopReason: string | null;
    executionHistory: StepHistory[];
}
