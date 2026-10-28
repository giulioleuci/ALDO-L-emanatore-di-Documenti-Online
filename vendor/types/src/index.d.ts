/**
 * Main Application Entry Point
 *
 * Import and use all libraries from the local monorepo.
 * Webpack will bundle everything into a single Code.js file for deployment via CLASP.
 */
import * as CoreUtilsLib from '@CoreUtilsLib';
import * as GasResilienceLib from '@GasResilienceLib';
import * as GoogleApiWrapper from '@GoogleApiWrapper';
import * as WorkspaceTemplateEngine from '@WorkspaceTemplateEngine';
import * as GasExpressionEngineLib from '@GasExpressionEngineLib';
import * as SheetDBLib from '@SheetDBLib';
import * as JobRunnerLib from '@JobRunnerLib';
import * as PipelineFramework from '@PipelineFramework';
import * as ContextEngine from '@ContextEngine';
import * as GasDataImporter from '@GasDataImporter';
import * as DomainRepositoryLib from '@DomainRepositoryLib';
import * as GasSchemaValidatorLib from '@GasSchemaValidatorLib';
import * as GasOnlineTestFramework from '@GasOnlineTestFramework';
import * as RoleResolutionLib from '@RoleResolutionLib';
import * as ComposableContentLib from '@ComposableContentLib';
import * as GasProcessMonitorLib from '@GasProcessMonitorLib';
declare function initializeServices(): {
    exceptionService: GasResilienceLib.ExceptionService;
    logger: CoreUtilsLib.LoggerService;
    utils: GoogleApiWrapper.UtilitiesService;
    spreadsheetService: GoogleApiWrapper.SpreadsheetService;
    cacheService: GoogleApiWrapper.CacheService;
};
export { CoreUtilsLib, GasResilienceLib, GoogleApiWrapper, WorkspaceTemplateEngine, GasExpressionEngineLib, SheetDBLib, JobRunnerLib, PipelineFramework, ContextEngine, GasDataImporter, DomainRepositoryLib, GasSchemaValidatorLib, GasOnlineTestFramework, RoleResolutionLib, ComposableContentLib, GasProcessMonitorLib, initializeServices };
