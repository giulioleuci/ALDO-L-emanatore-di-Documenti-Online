import type { GoogleLogger } from '../internal/core/GoogleService.js';
type UserLogger = Pick<GoogleLogger, 'error' | 'debug'>;
/**
 * @file GoogleApiWrapper/src/services/UserService.js
 * @description Facade for Google Apps Script's Session API (running-user identity).
 */
/**
 * @class UserService
 * @description Lightweight facade for the native GAS `Session` global — the L2
 * boundary for running-user identity lookups, so no other library or consumer
 * needs to touch `Session` directly.
 *
 * @property {LoggerService} _logger Diagnostic logger.
 */
export declare class UserService {
    _logger: UserLogger;
    /**
     * @param {LoggerService} [logger=console] Diagnostic logger.
     */
    constructor(logger?: UserLogger | null);
    /**
     * @description Returns the email address of the user running the current script execution.
     * @returns {string}
     */
    getActiveUserEmail(): string;
}
export {};
