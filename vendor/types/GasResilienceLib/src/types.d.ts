export interface ResilienceLogger {
    error(message: string, ...args: unknown[]): void;
    warn(message: string, ...args: unknown[]): void;
    debug?(message: string, ...args: unknown[]): void;
    info?(message: string, ...args: unknown[]): void;
}
export interface ResilienceUtilities {
    sleep(milliseconds: number): void;
}
export interface ResilienceCache {
    get(key: string): string | null;
    put(key: string, value: string, expirationInSeconds: number): unknown;
}
export interface ErrorPattern {
    pattern: RegExp;
    category: string;
    recoverable: boolean;
}
export interface RecoveryStrategy {
    action: string;
    maxAttempts: number;
    interval?: number;
}
export interface ResilienceOverrides {
    errorPatterns?: Record<string, ErrorPattern>;
    recoveryStrategies?: Record<string, RecoveryStrategy>;
    limits?: Record<string, number>;
}
export interface ErrorClassification {
    type: string;
    category: string;
    recoverable: boolean;
    originalMessage: string;
}
export interface CircuitBreakerOptions {
    failureThreshold?: number;
    successThreshold?: number;
    resetTimeout?: number;
    monitoringPeriod?: number;
}
export interface CircuitState {
    state: string;
    failures: number[];
    consecutiveSuccesses: number;
    lastFailureTime: number | null;
    nextAttemptTime: number | null;
}
export interface ExecutionOptions {
    operationName?: string;
    mode?: string;
    maxAttempts?: number;
    correlationId?: string;
    useCircuitBreaker?: boolean;
}
export type ExecutionResult<T> = {
    success: true;
    result: T;
    attempts: number;
    recovered: boolean;
    correlationId: string;
    error: null;
} | {
    success: false;
    recovered?: never;
    result: null;
    attempts: number;
    correlationId: string;
    error: ErrorClassification & {
        message: string;
    };
};
export type ErrorEvent = {
    type: 'FAILURE';
    attempt?: never;
    operation: string;
    classification: Pick<ErrorClassification, 'type'> & Partial<ErrorClassification>;
    correlationId?: string;
} | {
    type: 'RECOVERED';
    classification?: never;
    operation: string;
    attempt: number;
    correlationId?: string;
};
export interface ErrorCounters {
    total: number;
    recovered: number;
    notRecovered: number;
    byType: Record<string, number>;
}
