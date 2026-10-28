import type { z } from 'zod';
import type { ValidationResult } from './types.js';
import { ValidationException } from './internal/errors/ValidationException.js';
export declare class SchemaValidator {
    _logger: {
        debug(message: string): void;
    };
    constructor(logger: SchemaValidator['_logger']);
    validate<T extends z.ZodType>(schema: T, data: unknown, entityType?: string | null): z.output<T>;
    safeValidate<T extends z.ZodType>(schema: T, data: unknown, _entityType?: string | null): ValidationResult<z.output<T>>;
    static formatZodError(zodError: z.ZodError): {
        field: string;
        message: string;
    }[];
    static toValidationException(zodError: z.ZodError, entityType?: string | null): ValidationException;
}
