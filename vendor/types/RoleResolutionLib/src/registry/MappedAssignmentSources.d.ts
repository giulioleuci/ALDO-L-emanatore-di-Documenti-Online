import type { RoleContext, WideRowSourceOptions, MappedSourceOptions, CompositeSourceOptions, AssignmentCandidateRecord } from '../types.js';
import { AssignmentCandidate } from '../core/AssignmentCandidate.js';
import { AssignmentOverride } from '../core/AssignmentOverride.js';
import { Delegation } from '../internal/delegation/Delegation.js';
import { EffectiveAssignmentSource, OverrideSource } from './EffectiveAssignmentSource.js';
export { EffectiveAssignmentSource, OverrideSource, ActorSource } from './EffectiveAssignmentSource.js';
/** Maps wide, tabular rows to opaque assignment candidates. */
export declare class WideRowAssignmentSource<Row extends object = RoleContext, C extends object = RoleContext> extends EffectiveAssignmentSource<C> {
    _rows: WideRowSourceOptions<Row, C>['rows'];
    _rowIdentityPath: string | undefined;
    _actorSource: WideRowSourceOptions<Row, C>['actorSource'];
    _columns: NonNullable<WideRowSourceOptions<Row, C>['columns']>;
    _csv: boolean;
    constructor({ rows, rowIdentityPath, actorSource, columns, csv: useCsv }?: WideRowSourceOptions<Row, C>);
    getAssignments(context: C, _asOfDate: Date): AssignmentCandidate[];
}
/** Maps generic rows to dated, opaque assignment overrides. */
export declare class MappedOverrideSource<Row extends object = RoleContext, C extends object = RoleContext> extends OverrideSource<C> {
    _rows: MappedSourceOptions<Row, C>['rows'];
    _mapping: NonNullable<MappedSourceOptions<Row, C>['mapping']>;
    constructor({ rows, mapping }?: MappedSourceOptions<Row, C>);
    getOverrides(context: C, _asOfDate: Date): AssignmentOverride[];
}
/** Maps generic rows to context-scoped delegation values. */
export declare class MappedDelegationSource<Row extends object = RoleContext, C extends object = RoleContext> {
    _rows: MappedSourceOptions<Row, C>['rows'];
    _mapping: NonNullable<MappedSourceOptions<Row, C>['mapping']>;
    constructor({ rows, mapping }?: MappedSourceOptions<Row, C>);
    getDelegations(context: C, asOfDate: Date): Delegation[];
}
/** Combines independent candidate sources with a deterministic identity. */
export declare class CompositeAssignmentSource<C extends object = RoleContext, T extends AssignmentCandidateRecord = AssignmentCandidate> extends EffectiveAssignmentSource<C, T | AssignmentCandidate> {
    _sources: NonNullable<CompositeSourceOptions<C, T>['sources']>;
    _identity: string[];
    _mergeMetadata: NonNullable<CompositeSourceOptions<C, T>['mergeMetadata']>;
    constructor({ sources, identity, mergeMetadata }?: CompositeSourceOptions<C, T>);
    getAssignments(context: C, asOfDate: Date): (T | AssignmentCandidate)[];
}
