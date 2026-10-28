import type { ResilienceConfiguration } from '../Configuration.js';
import type { ErrorClassification, RecoveryStrategy, ResilienceUtilities } from '../types.js';
type RecoveryConfiguration = Pick<ResilienceConfiguration, 'getRecoveryStrategies' | 'getLimit'>;
/**
 * Decision engine for error recovery, implementing exponential backoff with jitter and category-specific retry strategies to maintain system stability.
 * @class
 * @private
 */
export declare class RecoveryManager {
    _utils: ResilienceUtilities;
    _strategies: Record<string, RecoveryStrategy>;
    _config: RecoveryConfiguration;
    static get MAX_JITTER_MS(): number;
    static get MAX_WAIT_TIME_MS(): number;
    /**
     * Initializes the recovery manager with sleep utilities and behavior configuration.
     * @param {Object} utils CoreUtilsLib service for temporal delays.
     * @param {Function} utils.sleep Logic to pause execution.
     * @param {Object} config central settings (ResilienceConfiguration) providing getRecoveryStrategies().
     * @throws {Error} If utils, utils.sleep, or config are missing/invalid.
     */
    constructor(utils: ResilienceUtilities, config: RecoveryConfiguration);
    /**
     * Evaluates retry eligibility and executes calculated backoff delays based on error classification and attempt history.
     * @param {Object} classification error diagnostic state (category, recoverable).
     * @param {number} attempt 1-based current attempt count.
     * @param {string} mode execution behavior modifier (STRICT|LENIENT|RECOVERY).
     * @param {number} [customMaxAttempts] optional override for strategy-specific limits.
     * @returns {boolean} True if the operation should be retried after the applied delay.
     * @throws {Error} If classification or attempt parameters are invalid.
     */
    applyStrategy(classification: Pick<ErrorClassification, 'category' | 'recoverable'>, attempt: number, mode: string, customMaxAttempts?: number): boolean;
}
export {};
