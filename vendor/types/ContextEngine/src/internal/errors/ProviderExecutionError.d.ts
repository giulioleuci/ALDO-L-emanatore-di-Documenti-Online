/**
 * @file ContextEngine/src/errors/ProviderExecutionError.js
 * @description Error thrown when a provider execution fails.
 * @version 1.0.0
 *
 * @overview
 * Thrown by DataProvider.provide() when a provider's _fetchData() method fails
 * during execution. This error wraps the original error and provides context about
 * which provider failed and with what parameters.
 *
 * ## When This Error Occurs
 * - **Network Failures**: API calls timeout or return errors
 * - **Database Errors**: Query failures or connection issues
 * - **Authentication Errors**: API authentication failures
 * - **Invalid Data**: Data source returns unexpected format
 * - **Resource Not Found**: Requested resource doesn't exist
 * - **Rate Limiting**: API rate limits exceeded
 * - **Permission Errors**: Insufficient permissions to access resource
 * - **Implementation Errors**: Bugs in provider's _fetchData() method
 *
 * ## Common Failure Scenarios
 * 1. **Google API Errors**: SpreadsheetApp/DriveApp failures
 * 2. **External API Errors**: HTTP 500/503/504 responses
 * 3. **Data Validation**: Invalid data format from source
 * 4. **Timeout**: Operation exceeds time limit
 * 5. **Memory Errors**: Dataset too large for GAS
 * 6. **Logic Errors**: Null pointer, undefined property access
 *
 * ## Integration with GasResilienceLib
 * This error can be automatically retried if:
 * - Error is classified as transient (network, timeout, rate limit)
 * - ExceptionService is configured in ContextAssembler
 * - Maximum retry attempts not exceeded
 *
 * Non-retryable errors (validation, permission) fail immediately.
 *
 * ## Error Recovery
 * - **Automatic Retry**: Transient errors retried with exponential backoff
 * - **Circuit Breaker**: Repeated failures trigger circuit breaker
 * - **Fallback**: Recipe can continue if provider is conditionally executed
 * - **Logging**: All failures logged with full context
 *
 * ## Prevention
 * - Implement robust error handling in _fetchData()
 * - Validate parameters before executing external operations
 * - Use GasResilienceLib for automatic retry of transient errors
 * - Add timeout handling for long-running operations
 * - Test providers with invalid/missing data scenarios
 */
import { ContextEngineError } from './ContextEngineError.js';
/**
 * Error signaling failure during DataProvider._fetchData() execution.
 *
 * @class ProviderExecutionError
 * @extends ContextEngineError
 *
 * @description
 * Wraps original exceptions caught during provider data retrieval. Provides technical context
 * for debugging and retry classification by GasResilienceLib, distinguishing between
 * transient (e.g., timeouts, 429) and permanent (e.g., 401, 403, 404) failures.
 *
 * @example
 * throw new ProviderExecutionError('UserDataProvider', new Error('Timeout'), { userId: 123 });
 */
export declare class ProviderExecutionError<Parameters extends object | null = object> extends ContextEngineError<{
    providerName: string;
    originalError: Error;
    parameters: Parameters;
}> {
    originalError: Error;
    providerName: string;
    /**
     * Initialize a ProviderExecutionError with execution context.
     *
     * @param {string} providerName - Unique identifier of the failing provider.
     * @param {Error} originalError - Caught exception to wrap.
     * @param {Object<string, *>} parameters - Input parameters passed to provide().
     */
    constructor(providerName: string, originalError: Error, parameters: Parameters);
}
