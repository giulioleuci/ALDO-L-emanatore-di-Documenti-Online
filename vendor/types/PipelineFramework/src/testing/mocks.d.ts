import type { Mock } from 'jest-mock';
import type { StepResult } from '../internal/contracts.js';
type MockHistory = {
    stepName: string;
    status: string;
    duration: number;
    timestamp: number;
};
type MockMetadata = {
    startTime: number;
    stopRequested: boolean;
    stopReason?: unknown;
    executionHistory: MockHistory[];
};
/**
 * @file PipelineFramework/src/testing/mocks.js
 * @description Centralized high-fidelity mocks for PipelineFramework services.
 * @version 1.0.0
 */
/**
 * @class StepMock
 * @description Jest-based high-fidelity mock for Pipeline Step implementation.
 */
export declare class StepMock<Context extends object = object> {
    name: string;
    getName: Mock<() => string>;
    getDescription: Mock<() => string>;
    execute: Mock<(context: Context) => StepResult>;
    shouldExecute: Mock<() => boolean>;
    beforeStep: Mock;
    afterStep: Mock;
    onError: Mock;
    /**
     * @constructor
     * @param {string} [name='TestStep'] - Step name.
     */
    constructor(name?: string);
    /**
     * @function setupExecution
     * @description Configures the 'execute' jest.fn return value.
     * @param {boolean} success - Target success status.
     * @param {*} [data={}] - Result data payload.
     * @param {Error} [error] - Error object (if success is false).
     * @returns {StepMock} Fluent interface.
     */
    setupExecution(success: boolean, data?: unknown, error?: Error | null): this;
}
/**
 * @class PipelineContextMock
 * @description Jest-based high-fidelity mock for PipelineContext.
 */
export declare class PipelineContextMock {
    _data: Record<string, unknown>;
    _metadata: MockMetadata;
    get: Mock<(key: string, defaultValue?: unknown) => unknown>;
    set: Mock<(key: string, value: unknown) => this>;
    has: Mock<(key: string) => boolean>;
    getData: Mock<() => Record<string, unknown>>;
    getAll: Mock<() => Record<string, unknown>>;
    getSummary: Mock<() => {
        success: boolean;
        totalSteps: number;
        history: MockHistory[];
    }>;
    getMetadata: Mock<() => MockMetadata>;
    setMetadata: Mock;
    requestStop: Mock<(reason?: unknown) => this>;
    shouldStop: Mock<() => boolean>;
    recordStepExecution: Mock<(stepName: string, status: string, duration: number) => this>;
    /**
     * @constructor
     * @param {Object} [initialData={}] - Initial state for context data.
     */
    constructor(initialData?: Record<string, unknown>);
}
export {};
