/**
 * GoogleApiWrapper (L2) — GAS-native wrappers for Drive, Sheets, Docs, Gmail,
 * Properties, Cache, Triggers, Locks, and UI, plus a ServiceFactory DI
 * container and GasResilienceLib-backed retry. Full API reference and usage
 * examples live in `DOCS_LIBS/GoogleApiWrapper.md`.
 *
 * Exports: MenuBuilder, SidebarBuilder, DialogBuilder, TextStyleMapper,
 * GoogleService, ServiceFactory, CacheService/Cache, DocumentService,
 * DriveService, LockService, MailService, PermissionService,
 * PropertiesService, SpreadsheetService, TriggerService, UiService,
 * UserService, UtilitiesService, plus `testing` mocks. Also re-exports
 * LoggerService/UtilsService from @CoreUtilsLib (deprecated — see below).
 *
 * @module GoogleApiWrapper
 */
export { LoggerService, UtilsService } from '@CoreUtilsLib';
export { MenuBuilder } from './src/builders/MenuBuilder';
export { SidebarBuilder } from './src/builders/SidebarBuilder';
export { DialogBuilder } from './src/builders/DialogBuilder';
export { TextStyleMapper } from './src/internal/services-managers/TextStyleMapper';
export { GoogleService } from './src/internal/core/GoogleService';
export type { GoogleCache, GoogleLogger, GoogleRetryExecutor } from './src/internal/core/GoogleService';
export { ServiceFactory } from './src/internal/core/ServiceFactory';
export type { ServiceFactoryConfig } from './src/internal/core/ServiceFactory';
export { CacheService, Cache } from './src/services/CacheService';
export { DocumentService } from './src/services/DocumentService';
export { DriveService } from './src/services/DriveService';
export { LockService } from './src/services/LockService';
export { MailService } from './src/services/MailService';
export { PermissionService } from './src/services/PermissionService';
export { PropertiesService } from './src/services/PropertiesService';
export { SpreadsheetService } from './src/services/SpreadsheetService';
export { TriggerService } from './src/services/TriggerService';
export { UiService } from './src/services/UiService';
export { UserService } from './src/services/UserService';
export { UtilitiesService } from './src/services/UtilitiesService';
export type { EmailRecipient, EmailOptions, SendResult } from './src/services/MailService.js';
export type { PermissionGrant, PermissionOptions, PermissionFailure, PermissionBatchResult } from './src/services/PermissionService.js';
export type { DriveFile, DrivePermission, DriveOptions, DriveMetadataOptions, DriveSearchOptions, CopyRequest, MoveRequest, RenameRequest, MetadataRequest, DriveBatchResult } from './src/services/drive/types.js';
export type { ParagraphOptions, TableOptions, DocumentOperation } from './src/internal/services-managers/DocumentContracts.js';
export * as testing from './src/testing/mocks.js';
