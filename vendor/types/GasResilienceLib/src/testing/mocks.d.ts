/**
 * @file GasResilienceLib/src/testing/mocks.js
 * @description Centralized high-fidelity mocks for GasResilienceLib services.
 * @version 1.0.0
 */
import type { Mock, MockInstance } from 'jest-mock';
type RetryMock = MockInstance<(fn: () => unknown, parameters?: unknown, maxAttempts?: number) => unknown> & {
    <T>(fn: () => T, parameters?: unknown, maxAttempts?: number): T;
};
type BypassMock = MockInstance<(fn: () => unknown, context?: unknown, fallback?: unknown) => unknown> & {
    <T, F = undefined>(fn: () => T, context?: unknown, fallback?: F): T | F;
};
interface AdvancedMockResult<T> {
    success: boolean;
    result: T;
    attempts: number;
    errors: unknown[];
    durationMs: number;
    operationId: string;
}
type AdvancedMock = MockInstance<(fn: () => unknown, parameters?: unknown, options?: unknown) => AdvancedMockResult<unknown>> & {
    <T>(fn: () => T, parameters?: unknown, options?: unknown): AdvancedMockResult<T>;
};
/**
 * High-fidelity mock for ExceptionService, providing jest.fn() instrumentation for resilience operations and configurable retry simulations.
 * @class
 */
export declare class ExceptionServiceMock {
    executeWithRetry: RetryMock;
    executeWithBypass: BypassMock;
    executeWithAdvancedHandling: AdvancedMock;
    classify: Mock<(error: {
        message?: unknown;
    }) => {
        category: string;
        recoverable: boolean;
        message: unknown;
    }>;
    report: Mock<(...args: unknown[]) => void>;
    getErrorSummary: Mock<() => {
        totalOperations: number;
        successfulOperations: number;
        failedOperations: number;
        recoveryRate: number;
    }>;
    constructor();
    /**
     * Configures the mock to simulate transient failures for a specified number of attempts before successful execution.
     * @param {number} failAttempts Count of sequential failures to simulate.
     * @param {Error} [error] logic exception to throw during failure phase.
     * @returns {this} Scoped mock instance.
     */
    setupRetrySuccess(failAttempts: number, error?: Error): this;
}
export {};
