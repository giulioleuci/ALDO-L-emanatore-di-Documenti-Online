/**
 * @file ComposableContentLib/src/testing/mocks.js
 * @description Centralized high-fidelity mocks for ComposableContentLib services.
 * @version 1.0.0
 */
import type { Mock } from 'jest-mock';
interface MockRegistration<Definition extends {
    id: string;
}> {
    definition: Definition;
    [key: string]: unknown;
}
/**
 * High-fidelity Jest mock for ContentBlock implementations.
 * @class
 */
export declare class ContentBlockMock {
    typeId: string;
    getTypeId: Mock<() => string>;
    execute: Mock<(context: {
        getOutputFormat(): string;
    }) => {
        success: boolean;
        content: string;
        format: string;
        metadata: object;
    }>;
    isVisible: Mock<() => boolean>;
    validateConfig: Mock<() => {
        valid: boolean;
    }>;
    /**
     * Initializes mock with default type ID and Jest spy functions.
     * @param {string} [typeId='mock_block'] Mock block type identifier.
     */
    constructor(typeId?: string);
}
/**
 * High-fidelity Jest mock for BlockRegistry.
 * @class
 */
export declare class BlockRegistryMock<Definition extends {
    id: string;
} = {
    id: string;
    name?: string;
}> {
    _blocks: Map<string, MockRegistration<Definition>>;
    register: Mock<(registration: MockRegistration<Definition>) => Definition>;
    get: Mock<(id: string) => MockRegistration<Definition> | undefined>;
    has: Mock<(id: string) => boolean>;
    getBlockTypes: Mock<() => string[]>;
    size: Mock<() => number>;
    /**
     * Initializes mock with internal storage and Jest spy functions.
     */
    constructor();
}
export {};
