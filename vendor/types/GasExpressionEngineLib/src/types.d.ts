import type jsep from 'jsep';
import type { LoggerService } from '@CoreUtilsLib';
export type ExpressionLogger = {
    [K in 'debug' | 'info' | 'warn' | 'error']: (...args: Parameters<LoggerService[K]>) => unknown;
};
export interface ExpressionParser {
    parse(expression: string): jsep.Expression;
}
export interface ExpressionPlaceholders {
    resolve(template: string, context?: object | null): string;
    processString(template: string, context?: object | null): string;
}
export interface ExpressionOptions {
    logger?: ExpressionLogger;
    utils?: unknown;
    cache?: unknown;
}
