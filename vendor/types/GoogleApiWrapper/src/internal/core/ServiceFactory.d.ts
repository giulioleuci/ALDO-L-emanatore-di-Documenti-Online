import type { Cache } from '../../services/CacheService.js';
import type { GoogleCache, GoogleLogger, GoogleRetryExecutor } from './GoogleService.js';
/**
 * @file GoogleApiWrapper/src/core/ServiceFactory.js
 * @description Centralized service container for dependency injection.
 * Provides factory methods to create fully-wired service instances.
 * @version 1.0 - Initial implementation
 */
import { LoggerService, UtilsService } from '@CoreUtilsLib';
import { ExceptionService } from '@GasResilienceLib';
import { CacheService } from '../../services/CacheService.js';
import { UtilitiesService } from '../../services/UtilitiesService.js';
import { DriveService } from '../../services/DriveService.js';
import { DocumentService } from '../../services/DocumentService.js';
import { SpreadsheetService } from '../../services/SpreadsheetService.js';
import { MailService } from '../../services/MailService.js';
import { PermissionService } from '../../services/PermissionService.js';
import { PropertiesService } from '../../services/PropertiesService.js';
import { TriggerService } from '../../services/TriggerService.js';
import { UiService } from '../../services/UiService.js';
import { UserService } from '../../services/UserService.js';
/**
 * @class ServiceFactory
 * @description Centralized Dependency Injection (DI) and Singleton container for GoogleApiWrapper services. Manages lazy initialization of shared infrastructure (logging, caching, resiliency) and provides consistent factory methods for all service wrappers.
 *
 * @static
 * @property {LoggerService} _logger Shared diagnostic logger.
 * @property {UtilsService} _utils Shared foundational utilities.
 * @property {Cache} _cache Shared persistence provider.
 * @property {ExceptionService} _exceptionService Shared resiliency handler.
 * @property {Object} _config Global service configuration.
 */
export interface ServiceFactoryConfig {
    logLevel: string;
    cacheExpiration: number;
    mailRateLimitMs: number;
}
export declare class ServiceFactory {
    static _cacheService: CacheService | null | undefined;
    static _logger: LoggerService | Partial<GoogleLogger> | null;
    static _utils: UtilsService | object | null;
    static _cache: Cache | Partial<GoogleCache> | null;
    static _exceptionService: ExceptionService | GoogleRetryExecutor | null;
    static _utilitiesService: UtilitiesService | null;
    static _config: ServiceFactoryConfig;
    /**
     * @static
     * @description Updates global service configuration via shallow merge. Resets shared instances to apply new settings to subsequent service requests. Must be called before service instantiation to ensure consistent dependency states.
     * @param {Object} config Partial configuration object.
     * @param {string} [config.logLevel='INFO'] Logging verbosity ('OFF', 'ERROR', 'WARN', 'INFO', 'DEBUG').
     * @param {number} [config.cacheExpiration=300] Default cache TTL in seconds.
     * @param {number} [config.mailRateLimitMs=100] Minimum delay (ms) between mail operations.
     */
    static configure(config?: Partial<ServiceFactoryConfig>): void;
    /**
     * @static
     * @description Resets shared service instances. Optionally restores configuration to defaults. Primarily for test state isolation.
     * @param {boolean} [resetConfig=true] If true, restores default values to _config.
     */
    static reset(resetConfig?: boolean): void;
    /**
     * @static
     * @description Returns singleton LoggerService instance, lazy-initialized with current _config.logLevel.
     * @returns {LoggerService} Shared diagnostic logger.
     */
    static getLogger(): LoggerService;
    /**
     * @static
     * @description Returns singleton UtilitiesService instance (GAS native API wrapper).
     * @returns {UtilitiesService} Shared GAS utility wrapper.
     */
    static getUtilitiesService(): UtilitiesService;
    /**
     * @static
     * @description Returns singleton UtilsService instance (CoreUtilsLib). Injects sleepFn from UtilitiesService.
     * @returns {UtilsService} Shared foundational utility provider.
     */
    static getUtils(): UtilsService;
    /**
     * @static
     * @description Returns singleton Script Cache instance (GAS CacheService.getScriptCache()).
     * @returns {Cache} Shared script-level persistence provider.
     */
    static getCache(): Cache;
    /**
     * @static
     * @description Returns the singleton CacheService instance (GAS CacheService wrapper).
     * Prefer {@link ServiceFactory.getCache} for the script cache itself; this exposes the
     * service object for callers that need user/document caches or the service directly.
     * @returns {CacheService} Shared cache service wrapper.
     */
    static getCacheService(): CacheService;
    /**
     * @static
     * @description Returns singleton ExceptionService instance (GasResilienceLib) for resilient execution.
     * @returns {ExceptionService} Shared resiliency and retry handler.
     */
    static getExceptionService(): ExceptionService;
    /**
     * @static
     * @description Creates a new DriveService instance with injected shared dependencies.
     * @returns {DriveService}
     */
    static getDriveService(): DriveService;
    /**
     * @static
     * @description Creates a new DocumentService instance with injected shared dependencies.
     * @returns {DocumentService}
     */
    static getDocumentService(): DocumentService;
    /**
     * @static
     * @description Creates a new SpreadsheetService instance with injected shared dependencies.
     * @returns {SpreadsheetService}
     */
    static getSpreadsheetService(): SpreadsheetService;
    /**
     * @static
     * @description Creates a new MailService instance with injected shared dependencies and optional configuration.
     * @param {Object} [options={}] Rate limiting overrides.
     * @returns {MailService}
     */
    static getMailService(options?: {
        rateLimitMs?: number;
    }): MailService;
    /**
     * @static
     * @description Creates a new PermissionService instance with injected shared dependencies.
     * @returns {PermissionService}
     */
    static getPermissionService(): PermissionService;
    /**
     * @static
     * @description Creates a new PropertiesService instance with injected shared dependencies.
     * @returns {PropertiesService}
     */
    static getPropertiesService(): PropertiesService;
    /**
     * @static
     * @description Creates a new TriggerService instance with injected shared dependencies.
     * @returns {TriggerService}
     */
    static getTriggerService(): TriggerService;
    /**
     * @static
     * @description Creates a new UiService instance with injected shared dependencies and auto-detected host UI.
     * @returns {UiService}
     */
    static getUiService(): UiService;
    /**
     * @static
     * @description Creates a new UserService instance with injected shared dependencies.
     * @returns {UserService}
     */
    static getUserService(): UserService;
    /**
     * @static
     * @description Overrides the shared logger instance.
     * @param {Object} logger Custom logger instance.
     */
    static setLogger(logger: Partial<GoogleLogger>): void;
    /**
     * @static
     * @description Overrides the shared utils instance.
     * @param {Object} utils Custom utils instance.
     */
    static setUtils(utils: object): void;
    /**
     * @static
     * @description Overrides the shared cache instance.
     * @param {Object} cache Custom cache instance.
     */
    static setCache(cache: Partial<GoogleCache>): void;
    /**
     * @static
     * @description Overrides the shared exception service instance.
     * @param {Object} exceptionService Custom exception service instance.
     */
    static setExceptionService(exceptionService: GoogleRetryExecutor): void;
}
