import { BaseError } from '@CoreUtilsLib';
import type { ValidationIssue } from '../../types.js';
export declare class ValidationException extends BaseError {
    entityType: string | null;
    errors: ValidationIssue[];
    validationErrors: ValidationIssue[];
    constructor(message: string, entityType?: string | null, errors?: ValidationIssue[]);
    getErrors(): ValidationIssue[];
    hasErrors(): boolean;
    getErrorsForField(fieldName: string): ValidationIssue[];
    toObject(): {
        errors: ValidationIssue[];
        name: string;
        message: string;
        context: import("@CoreUtilsLib").ErrorContext | null;
        timestamp: string;
        originalError?: {
            name: string;
            message: string;
            stack?: string;
        } | null;
        stack?: string | undefined;
    };
    withContext(additionalContext: Record<string, unknown>): ValidationException;
}
