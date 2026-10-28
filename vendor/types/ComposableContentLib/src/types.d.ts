import type { GoogleLogger } from '@GoogleApiWrapper';
import type { BlockDefinition } from './core/BlockDefinition.js';
import type { ContentBlock } from './core/ContentBlock.js';
import type { BlockResult } from './core/BlockResult.js';
import type { BlockRegistry } from './registry/BlockRegistry.js';
import type { RendererRegistry } from './registry/RendererRegistry.js';
export type ContentLogger = Partial<GoogleLogger>;
export interface DefinitionInput {
    id: string;
    name: string;
    description?: string;
    supportedFormats?: string[];
    emptyBehavior?: string;
    containerType?: string;
}
export interface RenderOptions extends Record<string, unknown> {
    format?: string;
    blockType?: string;
    containerType?: string;
    config?: Readonly<Record<string, unknown>>;
}
export type Template<Data> = string | ((data: Data, options: RenderOptions) => string);
export interface RendererOptions<Data> {
    logger?: ContentLogger;
    templates?: Record<string, Template<Data>>;
}
export interface RendererLike {
    getFormat(): string;
    render(templateId: string, data: unknown, options?: RenderOptions): string;
}
export interface SimpleBlockConfig<Data, Context> extends Record<string, unknown> {
    dataExtractor(context: Context): Data;
    emptyChecker?: (data: Data) => boolean;
    templates: Record<string, string>;
}
export interface BlockResultInput {
    instanceId: string;
    blockType: string;
    isEmpty?: boolean;
    isVisible?: boolean;
    content?: string;
    metadata?: Record<string, unknown>;
    processingTime?: number;
    error?: Error | null;
}
export interface CompositionResultInput {
    recipeId: string;
    recipeName?: string;
    outputFormat: string;
    content: string;
    blocks?: BlockResult[];
    errors?: unknown[];
    processingTime?: number;
    metadata?: Record<string, unknown>;
}
export interface BlockInstance {
    instanceId: string;
    blockType: string;
    visibility?: string;
    order?: number;
    config?: Record<string, unknown>;
}
export type NormalizedBlockInstance = Required<BlockInstance>;
export interface RecipeInput {
    id: string;
    name: string;
    description?: string;
    outputFormat?: string;
    blocks?: BlockInstance[];
    separator?: string;
    metadata?: Record<string, unknown>;
}
export type BlockFactory<Block = ContentBlock> = (definition: BlockDefinition, config: Record<string, unknown>) => Block;
export interface BlockRegistration<Block = ContentBlock> {
    definition: BlockDefinition | DefinitionInput;
    factory: BlockFactory<Block>;
}
export type VisibilityContext = object;
export interface VisibilityAccess {
    get?(path: string): unknown;
    toObject?(): unknown;
}
export interface VisibilityEngine {
    evaluate(expression: string, context: unknown): unknown;
}
export interface ComposerOptions {
    blockRegistry: Pick<BlockRegistry, 'has' | 'createBlock' | 'size'>;
    rendererRegistry: Pick<RendererRegistry, 'get' | 'size'> & {
        hasRenderer?: (format: string) => boolean;
    };
    logger?: ContentLogger;
    expressionEngine?: VisibilityEngine | null;
}
export interface ComposeOptions {
    format?: string;
    continueOnError?: boolean;
}
