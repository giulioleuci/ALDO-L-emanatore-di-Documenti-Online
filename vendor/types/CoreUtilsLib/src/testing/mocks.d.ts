import type { Mock, MockedFunction } from 'jest-mock';
import type { TreePosition } from '../internal/StructuredLogFormatter.js';
type FluentMock<T> = Mock<(...args: unknown[]) => T>;
type ScopedCallback = <T>(position: TreePosition, callback: () => T) => T;
type Clone = <T>(value: T) => T;
type Merge = <T extends object, S extends object>(target: T, source: S) => T & S;
type Chunk = <T>(items: T[], size: number) => T[][];
interface CapturedLog {
    level: string;
    message: unknown;
    context: unknown;
}
/**
 * @file CoreUtilsLib/src/testing/mocks.js
 * @description Centralized high-fidelity mocks for CoreUtilsLib services.
 * @version 1.0.0
 */
/**
 * High-fidelity mock for LoggerService with jest.fn() instrumentation and method chaining.
 * @class
 */
export declare class LoggerServiceMock {
    debug: FluentMock<this>;
    info: FluentMock<this>;
    warn: FluentMock<this>;
    error: FluentMock<this>;
    fatal: FluentMock<this>;
    log: FluentMock<this>;
    logJobStart: FluentMock<this>;
    logJobResume: FluentMock<this>;
    logJobEnd: FluentMock<this>;
    logJobSuspended: FluentMock<this>;
    logBatchStart: FluentMock<this>;
    logItemStart: FluentMock<this>;
    logStep: FluentMock<this>;
    logPipelineStart: FluentMock<this>;
    logPipelineStep: FluentMock<this>;
    logSummary: FluentMock<this>;
    setLevel: FluentMock<this>;
    clear: FluentMock<this>;
    withPosition: MockedFunction<ScopedCallback>;
    getLevel: Mock<() => string>;
    child: Mock<(prefix?: string) => this>;
    constructor();
    /**
     * Reconstructs all recorded log entries from individual level mock calls.
     * @returns {Array<Object>} Recorded log entries.
     */
    getLogs(): CapturedLog[];
    /**
     * Filters captured logs by case-insensitive level identifier.
     * @param {string} level Log level (DEBUG|INFO|WARN|ERROR|FATAL|LOG).
     * @returns {Array<{level:string, message:string, context:Object|null}>}
     */
    getLogsByLevel(level: string): CapturedLog[];
    /**
     * Filters captured logs by message content using string or regular expression.
     * @param {string|RegExp} pattern Search pattern for log message matching.
     * @returns {Array<{level:string, message:string, context:Object|null}>}
     */
    getLogsMatching(pattern: string | RegExp): CapturedLog[];
    /**
     * Checks if any captured log entry matches specified level and message pattern.
     * @param {string} level Case-insensitive log level identifier.
     * @param {string|RegExp} pattern Message content or pattern to match.
     * @returns {boolean} True if matching log entry is found.
     */
    hasLog(level: string, pattern: string | RegExp): boolean;
    /**
     * Outputs all recorded log entries to the system console.
     */
    printLogs(): void;
    /**
     * Resets all internal Jest mock functions and call history.
     * @returns {this} Chainable mock instance for fluent API usage.
     */
    reset(): this;
}
/**
 * Mock for UtilsService providing common utility behaviors with jest.fn() instrumentation.
 * @class
 */
export declare class UtilsServiceMock {
    sleep: Mock<(ms: number) => Promise<void>>;
    generateUuid: Mock<() => string>;
    formatDate: Mock<(date: unknown, format?: string) => string>;
    parseDate: Mock<(str: string) => Date>;
    isEmpty: Mock<(value: unknown) => boolean>;
    isEqual: Mock<(a: unknown, b: unknown) => boolean>;
    deepClone: MockedFunction<Clone>;
    deepMerge: MockedFunction<Merge>;
    chunk: MockedFunction<Chunk>;
    getUuid: UtilsServiceMock['generateUuid'];
    constructor();
}
/**
 * Mock for CacheInterface implementing a simple in-memory store for testing.
 * @class
 */
export declare class CacheInterfaceMock<V = unknown> {
    _store: Map<string, V>;
    get: Mock<(key: string) => V | null>;
    put: Mock<(key: string, value: V, expirationInSeconds?: number) => this>;
    remove: Mock<(key: string) => this>;
    removeAll: Mock<() => this>;
    removeByPrefix: Mock<(prefix: string) => this>;
    _clear: CacheInterfaceMock<V>['removeAll'];
    constructor();
}
export {};
