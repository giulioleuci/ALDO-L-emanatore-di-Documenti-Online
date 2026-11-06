import type { Mock } from 'jest-mock';
type FluentMock<T> = Mock<(...args: unknown[]) => T>;
/**
 * @file GasProcessMonitorLib/src/testing/mocks.ts
 * @description Centralized high-fidelity mocks for GasProcessMonitorLib services.
 * @version 1.0.0
 */
/**
 * High-fidelity mock for ProcessMonitorService, providing jest.fn() instrumentation for job lifecycles, progress tracking, and auditing.
 * @class
 */
export declare class ProcessMonitorServiceMock {
    registerJob: FluentMock<this>;
    logStepStart: FluentMock<this>;
    logStepComplete: FluentMock<this>;
    logStepSkipped: FluentMock<this>;
    updateProgress: FluentMock<this>;
    completeJob: FluentMock<this>;
    constructor();
}
export {};
