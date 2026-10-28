import type { GoogleLogger } from '../internal/core/GoogleService.js';
/**
 * @file GoogleApiWrapper/src/services/LockService.js
 * @description Facade for Google Apps Script's LockService.
 * Provides a clean, testable interface for script-level locking.
 * @version 1.0 - Created for performance optimization
 */
/**
 * @class LockService
 * @description Facade for Google Apps Script native LockService. Manages concurrent access via Script, User, and Document scopes. Provides a testable abstraction with support for mock environments.
 *
 * @property {LoggerService} _logger Diagnostic logger.
 * @property {Object} _nativeLockService Reference to the global GAS LockService object.
 */
export declare class LockService {
    _logger: GoogleLogger;
    _nativeLockService: GoogleAppsScript.Lock.LockService | null;
    /**
     * @description Initializes LockService and auto-detects native GAS LockService availability.
     * @param {LoggerService} logger Diagnostic logger.
     */
    constructor(logger: GoogleLogger);
    /**
     * @description Returns a Lock wrapper for the GAS Script Lock (global concurrency).
     * @returns {Lock|MockLock} Script lock implementation.
     */
    getScriptLock(): Lock | MockLock;
    /**
     * @description Returns a Lock wrapper for the GAS User Lock (per-user concurrency).
     * @returns {Lock|MockLock} User lock implementation.
     */
    getUserLock(): Lock | MockLock;
    /**
     * @description Returns a Lock wrapper for the GAS Document Lock (per-document concurrency).
     * @param {string} documentId Target document identifier.
     * @returns {Lock|MockLock} Document lock implementation.
     */
    getDocumentLock(documentId?: string): Lock | MockLock;
}
/**
 * @private
 * @class Lock
 * @description Wrapper for native GAS Lock object. Provides consistent acquisition status and diagnostic logging.
 *
 * @property {Object} _nativeLock Native GAS Lock instance.
 * @property {LoggerService} _logger Diagnostic logger.
 * @property {boolean} _acquired Current acquisition status.
 */
declare class Lock {
    _nativeLock: GoogleAppsScript.Lock.Lock | null;
    _logger: GoogleLogger;
    _acquired: boolean;
    /**
     * @param {GoogleAppsScript.Lock.Lock} nativeLock - Native GAS Lock object
     * @param {LoggerService} logger - Logger instance
     */
    constructor(nativeLock: GoogleAppsScript.Lock.Lock | null, logger: GoogleLogger);
    /**
     * @description Non-blocking attempt to acquire lock.
     * @param {number} timeoutInMillis Maximum wait duration.
     * @returns {boolean} True if acquisition succeeded.
     * @throws {Error} On native acquisition failure.
     */
    tryLock(timeoutInMillis: number): boolean;
    /**
     * @description Blocking attempt to acquire lock. Throws on timeout.
     * @param {number} timeoutInMillis Maximum wait duration.
     * @throws {Error} If lock cannot be acquired within timeout.
     */
    waitLock(timeoutInMillis: number): void;
    /**
     * @description Relinquishes held lock. No-op if not acquired.
     * @throws {Error} On native release failure.
     */
    releaseLock(): void;
    /**
     * @description Returns the local acquisition status of the lock.
     * @returns {boolean}
     */
    hasLock(): boolean;
}
/**
 * @private
 * @class MockLock
 * @description Simulated lock for test environments. Always succeeds in acquisition.
 */
declare class MockLock {
    _logger: GoogleLogger;
    _acquired: boolean;
    /**
     * @param {LoggerService} logger - Logger instance
     */
    constructor(logger: GoogleLogger);
    /**
     * @description Mock tryLock - always succeeds immediately.
     * @param {number} timeoutInMillis - Ignored in mock
     * @returns {boolean} Always returns true
     */
    tryLock(timeoutInMillis: number): boolean;
    /**
     * @description Mock waitLock - always succeeds immediately.
     * @param {number} timeoutInMillis - Ignored in mock
     */
    waitLock(timeoutInMillis: number): void;
    /**
     * @description Mock releaseLock - clears acquired flag.
     */
    releaseLock(): void;
    /**
     * @description Returns whether this mock lock is acquired.
     * @returns {boolean} True if acquired
     */
    hasLock(): boolean;
}
export {};
