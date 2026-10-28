import type { Mock } from 'jest-mock';
import type { AssemblyOptions } from '../internal/contracts.js';
/**
 * @file ContextEngine/src/testing/mocks.js
 * @description Centralized high-fidelity mocks for ContextEngine services.
 * @version 1.0.0
 */
/**
 * High-fidelity mock for DataProvider implementation in unit tests.
 * Simulates provider lifecycle, data retrieval, and parameter validation.
 *
 * @class DataProviderMock
 */
export declare class DataProviderMock<Parameters extends object = Record<string, unknown>, Result = unknown> {
    name: string;
    getName: Mock<() => string>;
    provide: Mock<(providerName?: string, params?: Parameters) => Result>;
    _fetchData: Mock<(params?: Parameters) => Result>;
    _validateParameters: Mock;
    initialize: Mock;
    dispose: Mock;
    constructor(name?: string);
    /**
     * Fluent helper to configure static mock data return values.
     *
     * @param {*} data - Payload to return from provide and _fetchData.
     * @returns {DataProviderMock} Current instance for chaining.
     */
    setupData(data: Result): this;
}
/**
 * High-fidelity mock for ContextInterceptor implementation.
 * Simulates context transformation and conditional filtering logic.
 *
 * @class InterceptorMock
 */
export declare class InterceptorMock<Data extends object = Record<string, unknown>> {
    name: string;
    getName: Mock<() => string>;
    intercept: Mock<(name: string, data: Data, context: object, options: AssemblyOptions) => unknown>;
    shouldIntercept: Mock<() => boolean>;
    constructor(name?: string);
    /**
     * Fluent helper to inject custom interception implementation.
     *
     * @param {Function} interceptFn - Logic mapping PipelineContext to transformed PipelineContext.
     * @returns {InterceptorMock} Current instance for chaining.
     */
    setupIntercept(interceptFn: (name: string, data: Data, context: object, options: AssemblyOptions) => unknown): this;
}
/**
 * In-memory registry mock for provider lifecycle and dependency resolution testing.
 *
 * @class ProviderRegistryMock
 */
export declare class ProviderRegistryMock<Provider = DataProviderMock> {
    _providers: Map<string, Provider>;
    register: Mock<(name: string, provider: Provider) => this>;
    get: Mock<(name: string) => Provider | null>;
    has: Mock<(name: string) => boolean>;
    getRegisteredTypes: Mock<() => string[]>;
    constructor();
}
