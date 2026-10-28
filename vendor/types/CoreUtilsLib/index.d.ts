/**
 * @file CoreUtilsLib/index.js
 * @description Core Utilities Library - Layer 0 foundation providing essential utilities for all GasLibraryFactory libraries.
 * @version 3.1 - Strategic library reduction (removed date-fns, nanoid; hybrid es-toolkit)
 *
 * **CoreUtilsLib** is the foundational Layer 0 library in the GasLibraryFactory monorepo.
 * It provides zero Google API dependencies and serves as the base for all other libraries.
 *
 * **Exported Services:**
 *
 * **LoggerService** - Structured logging with log levels
 * - Configurable log levels (DEBUG, INFO, WARN, ERROR, OFF)
 * - Lazy evaluation for performance
 * - Child logger creation with context
 * - Integration with Google Apps Script Logger
 *
 * **UtilsService** (also exported as MyUtilsService) - Comprehensive utility methods
 * - Date/Time: Parsing, formatting, manipulation, comparison (native JS implementation)
 * - Strings: isEmpty, truncate, capitalize, case conversions (hybrid native/es-toolkit)
 * - Objects: deepClone, deepMerge, nested property access (es-toolkit/compat)
 * - Arrays: chunk, unique, flatten, groupBy, keyBy, orderBy (hybrid native/es-toolkit)
 * - Collections: map, filter, find, reduce, forEach, every, some
 * - Numbers: randomInt, round, clamp, maxBy, minBy, sumBy, meanBy
 * - Validation: isValidEmail, isValidUrl, isValidDate
 * - Type Checking: isEqual, isNil, isNumber, isString, isEmptyValue
 * - IDs: UUID v4, short IDs, compact IDs (native implementation)
 * - Functions: debounce, once, noop
 * - Timing: sleep, delay (requires injected sleep function)
 *
 * **LodashFacade** - Direct access to utilities (Hybrid Approach)
 * - Strategic mix of native JS and es-toolkit/compat utilities
 * - Custom utilities: pascalCase, constantCase, dotCase, pathCase
 * - stringToArray, humanisePath for text processing
 *
 * **HashUtils** - SHA-256 cryptographic hashing
 * - String hashing using Google Apps Script native Utilities
 * - Object hashing via JSON serialization
 * - Hash validation
 * - Secure SHA-256 algorithm
 *
 * **RegexUtils** - Safe regular expression handling
 * - Regex character escaping
 * - ReDoS (Regular Expression Denial of Service) protection
 * - Pattern safety validation
 * - Safe regex creation and testing
 *
 * **TimeConstants** - Static time conversion constants
 * - MILLIS_PER_DAY, MILLIS_PER_HOUR, MILLIS_PER_MINUTE, MILLIS_PER_SECOND
 *
 * **Architecture:**
 * - Layer 0: Foundation (zero Google API dependencies)
 * - External dependencies: es-toolkit (minimized footprint)
 * - All methods are stateless where possible
 * - Synchronous-only (GAS V8 limitation)
 *
 * **Dependencies:**
 * - Runtime: None (can run without Google APIs)
 * - External: es-toolkit@1.x (Hybrid retention strategy)
 * - Sleep function: Must be injected for sleep()/delay() methods
 *
 * @module CoreUtilsLib
 * @version 3.1.0
 *
 * @example
 * // Basic logging
 * import { LoggerService } from '@CoreUtilsLib';
 * const logger = new LoggerService('INFO');
 * logger.info('Application started');
 *
 * @example
 * // Date manipulation
 * import { UtilsService } from '@CoreUtilsLib';
 * const utils = new UtilsService();
 * const tomorrow = utils.addDays(new Date(), 1);
 * const formatted = utils.formatDate(tomorrow, 'DD/MM/YYYY');
 *
 * @example
 * // Hashing for cache keys
 * import { HashUtils } from '@CoreUtilsLib';
 * const queryKey = HashUtils.hashObject({ table: 'Users', filter: 'active' });
 * const cached = cache.get(queryKey);
 *
 * @example
 * // Safe regex with ReDoS protection
 * import { RegexUtils } from '@CoreUtilsLib';
 * const userPattern = getUserInput();
 * const regex = RegexUtils.createSafeRegex(userPattern, 'i');
 * // Automatically validated for safety
 *
 * @example
 * // Time constants
 * import { TimeConstants } from '@CoreUtilsLib';
 * const cacheTimeout = TimeConstants.MILLIS_PER_HOUR * 2; // 2 hours
 *
 * @see LoggerService For structured logging
 * @see UtilsService For general utilities
 * @see HashUtils For SHA-256 hashing
 * @see RegexUtils For safe regex operations
 */
export { LoggerService } from './src/LoggerService.js';
export type { LoggerOptions, ChildLogger } from './src/LoggerService.js';
export { MyUtilsService, UtilsService } from './src/UtilsService.js';
export { HashUtils } from './src/internal/HashUtils.js';
export { RegexUtils } from './src/internal/RegexUtils.js';
export { ValidationUtils } from './src/ValidationUtils.js';
export { HtmlSanitizer } from './src/utils/HtmlSanitizer.js';
export { CellValueCoercion } from './src/utils/CellValueCoercion.js';
export { DateRange } from './src/utils/DateRange.js';
export { Delegation } from './src/utils/Delegation.js';
export { LazyRef } from './src/utils/LazyRef.js';
export { BaseError, ValidationError, ConfigurationError, OperationError } from './src/errors/BaseError.js';
export { Result } from './src/Result.js';
export { Registry } from './src/internal/Registry.js';
export type { RegistryOptions } from './src/internal/Registry.js';
export type { ErrorContext, SerializedError } from './src/errors/BaseError.js';
export { LazyServiceContainer } from './src/internal/LazyServiceContainer.js';
export { TypeGuards, isString, isNonEmptyString, isNumber as isValidNumber, isFiniteNumber, isInteger, isPositiveInteger, isNonNegativeInteger, isBoolean, isPlainObject, isObject, isNonEmptyObject, isArray, isNonEmptyArray, isArrayOf, isFunction, isNil as isNilValue, isNull, isUndefined, isDefined, isValidDate as isDateValid, isRegExp, isPromise, isError, isEmpty as isEmptyValue } from './src/TypeGuards.js';
export { PiiRedactor } from './src/internal/PiiRedactor.js';
export * as testing from './src/testing/mocks.js';
export { chunk, compact, difference, differenceBy, flatten, flattenDeep, groupBy, intersection, keyBy, orderBy, uniq, uniqBy, cloneDeep, get, has, mapKeys, mapValues, merge, omit, pick, set, every, filter, find, forEach, map, reduce, size, some, camelCase, capitalize, kebabCase, snakeCase, startCase, truncate, pascalCase, constantCase, dotCase, pathCase, stringToArray, humanisePath, isEmpty, isEqual, isNil, isNumber, maxBy, meanBy, minBy, sumBy, debounce, once, noop, LodashFacade } from './src/facades/LodashFacade.js';
/**
 * Time conversion constants for millisecond calculations.
 *
 * Provides static constants for converting between time units and milliseconds.
 * These constants are useful for timeout calculations, cache expiration,
 * retry delays, and other time-based operations.
 *
 * **Constants:**
 * - `MILLIS_PER_SECOND` = 1,000 (1 second)
 * - `MILLIS_PER_MINUTE` = 60,000 (1 minute = 60 seconds)
 * - `MILLIS_PER_HOUR` = 3,600,000 (1 hour = 60 minutes)
 * - `MILLIS_PER_DAY` = 86,400,000 (1 day = 24 hours)
 *
 * **Use Cases:**
 * - Cache timeouts (e.g., `cache.put(key, value, TimeConstants.MILLIS_PER_HOUR)`)
 * - Retry delays (e.g., `utils.sleep(TimeConstants.MILLIS_PER_MINUTE)`)
 * - Timeout thresholds (e.g., `if (elapsed > TimeConstants.MILLIS_PER_DAY)`)
 * - Time calculations (e.g., `const weekInMs = TimeConstants.MILLIS_PER_DAY * 7`)
 *
 * @constant {Object} TimeConstants
 * @property {number} MILLIS_PER_SECOND - Milliseconds in one second (1,000)
 * @property {number} MILLIS_PER_MINUTE - Milliseconds in one minute (60,000)
 * @property {number} MILLIS_PER_HOUR - Milliseconds in one hour (3,600,000)
 * @property {number} MILLIS_PER_DAY - Milliseconds in one day (86,400,000)
 *
 * @example
 * // Import and use time constants
 * import { TimeConstants } from '@CoreUtilsLib';
 *
 * // Cache timeout: 2 hours
 * const cacheTimeout = TimeConstants.MILLIS_PER_HOUR * 2;
 * cache.put(key, value, cacheTimeout);
 *
 * @example
 * // Retry delay: 30 seconds
 * const retryDelay = TimeConstants.MILLIS_PER_SECOND * 30;
 * utils.sleep(retryDelay);
 *
 * @example
 * // Calculate time difference threshold
 * const maxAge = TimeConstants.MILLIS_PER_DAY * 7; // 1 week
 * const age = Date.now() - timestamp;
 * if (age > maxAge) {
 *   console.log('Data is stale');
 * }
 *
 * @example
 * // Convert custom time units
 * const threeMinutes = TimeConstants.MILLIS_PER_MINUTE * 3;
 * const fiveDays = TimeConstants.MILLIS_PER_DAY * 5;
 * const halfHour = TimeConstants.MILLIS_PER_HOUR * 0.5;
 *
 * @example
 * // Use in configuration objects
 * const config = {
 *   cacheExpiration: TimeConstants.MILLIS_PER_HOUR,
 *   retryInterval: TimeConstants.MILLIS_PER_MINUTE * 5,
 *   maxSessionAge: TimeConstants.MILLIS_PER_DAY
 * };
 */
export declare const TimeConstants: {
    /** Milliseconds in one second (1,000) */
    MILLIS_PER_SECOND: number;
    /** Milliseconds in one minute (60,000) */
    MILLIS_PER_MINUTE: number;
    /** Milliseconds in one hour (3,600,000) */
    MILLIS_PER_HOUR: number;
    /** Milliseconds in one day (86,400,000) */
    MILLIS_PER_DAY: number;
};
export type { SerializedResult } from './src/Result.js';
