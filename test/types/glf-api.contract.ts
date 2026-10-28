// Check the ambient GAS API against the declarations emitted by the TypeScript GLF.
import type * as GoogleApiWrapper from '../../vendor/types/GoogleApiWrapper/index';
import type * as CoreUtilsLib from '../../vendor/types/CoreUtilsLib/index';
import type * as GasExpressionEngineLib from '../../vendor/types/GasExpressionEngineLib/index';
import type * as ContextEngine from '../../vendor/types/ContextEngine/index';
import type * as SheetDBLib from '../../vendor/types/SheetDBLib/index';
import type * as WorkspaceTemplateEngine from '../../vendor/types/WorkspaceTemplateEngine/index';
import type * as PipelineFramework from '../../vendor/types/PipelineFramework/index';
import type * as RoleResolutionLib from '../../vendor/types/RoleResolutionLib/index';
import type * as JobRunnerLib from '../../vendor/types/JobRunnerLib/index';
import type * as DomainRepositoryLib from '../../vendor/types/DomainRepositoryLib/index';
import type * as GasSchemaValidatorLib from '../../vendor/types/GasSchemaValidatorLib/index';
import type * as GasDataImporter from '../../vendor/types/GasDataImporter/index';
import type * as ComposableContentLib from '../../vendor/types/ComposableContentLib/index';
import type * as GasOnlineTestFramework from '../../vendor/types/GasOnlineTestFramework/index';
import type * as GasProcessMonitorLib from '@GasProcessMonitorLib';

type Assert<T extends true> = T;
type ConstructorShape = { prototype: object };
type MissingMembers<Declared extends ConstructorShape, Published extends ConstructorShape> =
  | Exclude<keyof Declared, keyof Published>
  | Exclude<keyof Declared['prototype'], keyof Published['prototype']>;

type MissingApi = [
  MissingMembers<typeof ProcessMonitorService, typeof GasProcessMonitorLib.ProcessMonitorService>,
  MissingMembers<typeof DashboardUi, typeof GasProcessMonitorLib.DashboardUi>,
  MissingMembers<typeof LoggerService, typeof CoreUtilsLib.LoggerService>,
  MissingMembers<typeof HtmlSanitizer, typeof CoreUtilsLib.HtmlSanitizer>,
  MissingMembers<typeof PiiRedactor, typeof CoreUtilsLib.PiiRedactor>,
  MissingMembers<typeof LazyServiceContainer, typeof CoreUtilsLib.LazyServiceContainer>,
  MissingMembers<typeof LazyRef, typeof CoreUtilsLib.LazyRef>,
  MissingMembers<
    typeof ExpressionEngineService,
    typeof GasExpressionEngineLib.ExpressionEngineService
  >,
  MissingMembers<typeof ProviderRegistry, typeof ContextEngine.ProviderRegistry>,
  MissingMembers<typeof InterceptorRegistry, typeof ContextEngine.InterceptorRegistry>,
  MissingMembers<typeof ContextInterceptor, typeof ContextEngine.ContextInterceptor>,
  MissingMembers<typeof ContextAssembler, typeof ContextEngine.ContextAssembler>,
  MissingMembers<typeof ProjectionRegistry, typeof ContextEngine.ProjectionRegistry>,
  MissingMembers<typeof CollectionProjector, typeof ContextEngine.CollectionProjector>,
  MissingMembers<
    typeof CollectionProjectionInterceptor,
    typeof ContextEngine.CollectionProjectionInterceptor
  >,
  MissingMembers<typeof CollectionProjectionError, typeof ContextEngine.CollectionProjectionError>,
  MissingMembers<typeof DatabaseService, typeof SheetDBLib.DatabaseService>,
  MissingMembers<typeof TableService, typeof SheetDBLib.TableService>,
  MissingMembers<typeof DriveService, typeof GoogleApiWrapper.DriveService>,
  MissingMembers<typeof PermissionService, typeof GoogleApiWrapper.PermissionService>,
  MissingMembers<typeof Mustache, typeof WorkspaceTemplateEngine.Mustache>,
  MissingMembers<typeof PluralizeFilter, typeof WorkspaceTemplateEngine.PluralizeFilter>,
  MissingMembers<typeof PlaceholderService, typeof WorkspaceTemplateEngine.PlaceholderService>,
  MissingMembers<typeof PipelineContext, typeof PipelineFramework.PipelineContext>,
  MissingMembers<typeof Step, typeof PipelineFramework.Step>,
  MissingMembers<typeof Pipeline, typeof PipelineFramework.Pipeline>,
  MissingMembers<typeof StepExecutionError, typeof PipelineFramework.StepExecutionError>,
  MissingMembers<typeof Delegation, typeof RoleResolutionLib.Delegation>,
  MissingMembers<typeof DelegationChain, typeof RoleResolutionLib.DelegationChain>,
  MissingMembers<typeof Scope, typeof RoleResolutionLib.Scope>,
  MissingMembers<
    typeof InMemoryDelegationSource,
    typeof RoleResolutionLib.InMemoryDelegationSource
  >,
  MissingMembers<typeof Actor, typeof RoleResolutionLib.Actor>,
  MissingMembers<typeof RoutingResult, typeof RoleResolutionLib.RoutingResult>,
  MissingMembers<typeof RoutingResolver, typeof RoleResolutionLib.RoutingResolver>,
  MissingMembers<typeof AssignmentSlot, typeof RoleResolutionLib.AssignmentSlot>,
  MissingMembers<typeof AssignmentCandidate, typeof RoleResolutionLib.AssignmentCandidate>,
  MissingMembers<typeof AssignmentOverride, typeof RoleResolutionLib.AssignmentOverride>,
  MissingMembers<typeof ResolutionPolicy, typeof RoleResolutionLib.ResolutionPolicy>,
  MissingMembers<typeof ResolutionTrace, typeof RoleResolutionLib.ResolutionTrace>,
  MissingMembers<
    typeof EffectiveAssignmentResult,
    typeof RoleResolutionLib.EffectiveAssignmentResult
  >,
  MissingMembers<typeof AssignmentSource, typeof RoleResolutionLib.AssignmentSource>,
  MissingMembers<
    typeof InMemoryAssignmentSource,
    typeof RoleResolutionLib.InMemoryAssignmentSource
  >,
  MissingMembers<
    typeof EffectiveAssignmentSource,
    typeof RoleResolutionLib.EffectiveAssignmentSource
  >,
  MissingMembers<typeof OverrideSource, typeof RoleResolutionLib.OverrideSource>,
  MissingMembers<typeof ActorSource, typeof RoleResolutionLib.ActorSource>,
  MissingMembers<typeof WideRowAssignmentSource, typeof RoleResolutionLib.WideRowAssignmentSource>,
  MissingMembers<typeof MappedOverrideSource, typeof RoleResolutionLib.MappedOverrideSource>,
  MissingMembers<typeof MappedDelegationSource, typeof RoleResolutionLib.MappedDelegationSource>,
  MissingMembers<
    typeof CompositeAssignmentSource,
    typeof RoleResolutionLib.CompositeAssignmentSource
  >,
  MissingMembers<
    typeof EffectiveAssignmentResolver,
    typeof RoleResolutionLib.EffectiveAssignmentResolver
  >,
  MissingMembers<typeof RoleResolutionError, typeof RoleResolutionLib.RoleResolutionError>,
  MissingMembers<
    typeof MalformedAssignmentSlotError,
    typeof RoleResolutionLib.MalformedAssignmentSlotError
  >,
  MissingMembers<
    typeof DuplicateAssignmentSlotError,
    typeof RoleResolutionLib.DuplicateAssignmentSlotError
  >,
  MissingMembers<
    typeof InconsistentAssignmentOverrideError,
    typeof RoleResolutionLib.InconsistentAssignmentOverrideError
  >,
  MissingMembers<
    typeof AmbiguousAssignmentOverrideError,
    typeof RoleResolutionLib.AmbiguousAssignmentOverrideError
  >,
  MissingMembers<
    typeof AssignmentActorNotFoundError,
    typeof RoleResolutionLib.AssignmentActorNotFoundError
  >,
  MissingMembers<
    typeof OverlappingDelegationError,
    typeof RoleResolutionLib.OverlappingDelegationError
  >,
  MissingMembers<typeof UtilsService, typeof GoogleApiWrapper.UtilsService>,
  MissingMembers<typeof DateRange, typeof CoreUtilsLib.DateRange>,
  MissingMembers<typeof JobDefinitionRegistry, typeof JobRunnerLib.JobDefinitionRegistry>,
  MissingMembers<typeof JobRunnerService, typeof JobRunnerLib.JobRunnerService>,
  MissingMembers<typeof Entity, typeof DomainRepositoryLib.Entity>,
  MissingMembers<typeof Repository, typeof DomainRepositoryLib.Repository>,
  MissingMembers<typeof Specification, typeof DomainRepositoryLib.Specification>,
  MissingMembers<typeof EqualityFieldSpec, typeof DomainRepositoryLib.EqualityFieldSpec>,
  MissingMembers<typeof FieldSpecification, typeof DomainRepositoryLib.FieldSpecification>,
  MissingMembers<typeof FunctionSpecification, typeof DomainRepositoryLib.FunctionSpecification>,
  MissingMembers<typeof CompositeSpecification, typeof DomainRepositoryLib.CompositeSpecification>,
  MissingMembers<
    typeof EntityNotFoundException,
    typeof DomainRepositoryLib.EntityNotFoundException
  >,
  MissingMembers<typeof MailService, typeof GoogleApiWrapper.MailService>,
  MissingMembers<typeof SpreadsheetService, typeof GoogleApiWrapper.SpreadsheetService>,
  MissingMembers<typeof DocumentService, typeof GoogleApiWrapper.DocumentService>,
  MissingMembers<typeof UtilitiesService, typeof GoogleApiWrapper.UtilitiesService>,
  MissingMembers<typeof UserService, typeof GoogleApiWrapper.UserService>,
  MissingMembers<typeof ServiceFactory, typeof GoogleApiWrapper.ServiceFactory>,
  MissingMembers<typeof DatasetValidator, typeof GasSchemaValidatorLib.DatasetValidator>,
  MissingMembers<typeof ImportConfiguration, typeof GasDataImporter.ImportConfiguration>,
  MissingMembers<typeof ImportEngine, typeof GasDataImporter.ImportEngine>,
  MissingMembers<typeof ImportError, typeof GasDataImporter.ImportError>,
  MissingMembers<typeof SourceError, typeof GasDataImporter.SourceError>,
  MissingMembers<typeof SourceStrategy, typeof GasDataImporter.SourceStrategy>,
  MissingMembers<typeof SheetByIdStrategy, typeof GasDataImporter.SheetByIdStrategy>,
  MissingMembers<typeof BlockDataContext, typeof ComposableContentLib.BlockDataContext>,
  MissingMembers<typeof HtmlRenderer, typeof ComposableContentLib.HtmlRenderer>,
  MissingMembers<typeof RendererRegistry, typeof ComposableContentLib.RendererRegistry>,
  MissingMembers<typeof ContentBlock, typeof ComposableContentLib.ContentBlock>,
  MissingMembers<typeof SimpleContentBlock, typeof ComposableContentLib.SimpleContentBlock>,
  MissingMembers<typeof BlockRegistry, typeof ComposableContentLib.BlockRegistry>,
  MissingMembers<typeof CompositionRecipe, typeof ComposableContentLib.CompositionRecipe>,
  MissingMembers<typeof ContentComposer, typeof ComposableContentLib.ContentComposer>,
  MissingMembers<typeof EnhancedTestRunner, typeof GasOnlineTestFramework.EnhancedTestRunner>,
  MissingMembers<typeof SmartAssert, typeof GasOnlineTestFramework.SmartAssert>,
  MissingMembers<typeof TestContext, typeof GasOnlineTestFramework.TestContext>,
  MissingMembers<
    typeof SampleSpreadsheetBuilder,
    typeof GasOnlineTestFramework.SampleSpreadsheetBuilder
  >,
  Exclude<keyof DocumentBuilder, keyof ReturnType<GoogleApiWrapper.DocumentService['document']>>
];

export type GlfApiContract = Assert<[MissingApi[number]] extends [never] ? true : false>;
