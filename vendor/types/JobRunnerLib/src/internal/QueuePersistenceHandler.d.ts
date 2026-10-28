import type { JobProperties, StateDriveService, JobConfiguration, BatchState } from '../types.js';
export declare class QueuePersistenceHandler {
    jobName: string;
    _propertiesService: JobProperties;
    _stateManager: Pick<import('../QueueStateManager.js').QueueStateManager, 'getStateVersion'> | null | undefined;
    _driveService: StateDriveService | null;
    static get LARGE_STATE_THRESHOLD(): number;
    constructor(jobName: string, propertiesService: JobProperties, stateManager?: Pick<import('../QueueStateManager.js').QueueStateManager, 'getStateVersion'> | null, driveService?: StateDriveService | null);
    /**
     * Resolves the native Drive API surface via the wrapped DriveService (L2).
     * @private
     * @returns {GoogleAppsScript.Drive.DriveApp|undefined} Native DriveApp, or undefined outside GAS.
     */
    _driveApp(): import("../types.js").StateDriveApp | undefined;
    _key(suffix: string): string;
    /**
     * Resolves the ScriptProperties patch for a resume-state value, offloading
     * to Drive (and returning a `__DRIVE__:` pointer + recorded size instead
     * of the inline JSON) whenever the serialized state exceeds
     * `LARGE_STATE_THRESHOLD` — the same protection `saveResumeState` has
     * always provided against `PropertiesService`'s ~9KB per-value cap.
     * Shared by `saveResumeState` (applies the patch immediately) and
     * `batchSave` (merges the patch into its single `setProperties` call), so
     * both persistence paths get identical size-check-then-offload behavior;
     * previously only `saveResumeState` had it, and `batchSave` — used on the
     * timeout/suspension path — silently wrote oversized state inline instead.
     * @private
     * @param {*} state Resume-state value to persist.
     * @returns {{properties: Object<string,string>, propertiesToDelete: string[]}}
     *   `properties` to merge into a `setProperties` call (or apply
     *   individually); `propertiesToDelete` are keys that must be explicitly
     *   deleted afterward (`setProperties` can only set/overwrite, never
     *   delete, keys).
     */
    _resolveResumeStatePatch(state: unknown): {
        properties: {
            [x: string]: string;
        };
        propertiesToDelete: string[];
    };
    /**
     * `batchSave` is used on the timeout/suspension path (see JobQueue.js's
     * `TimeoutException` handler): it must persist `state: 'to_resume'`,
     * `progress`, and the version bump together so `createResumeTrigger()`
     * runs afterward. If the Drive offload of an oversized `resumeState`
     * fails (Drive unavailable/quota), `_resolveResumeStatePatch` throws —
     * and letting that propagate would make the whole `batchSave` call fail,
     * losing the suspend state and stranding the job with no resume trigger.
     * So here (unlike `saveResumeState`, which intentionally still hard-fails
     * on Drive errors since it isn't on the crash-recovery path) a Drive
     * failure falls back to the old pre-tiering inline-JSON write instead of
     * propagating: same risk of exceeding `PropertiesService`'s ~9KB cap that
     * applied unconditionally before large-state tiering existed, but the job
     * still gets flagged `to_resume` with a trigger created.
     * @private
     * @param {*} state Resume-state value to persist.
     * @returns {{properties: Object<string,string>, propertiesToDelete: string[]}}
     */
    _resolveResumeStatePatchForBatch(state: unknown): {
        properties: {
            [x: string]: string;
        };
        propertiesToDelete: string[];
    };
    batchSave(updates: BatchState): void;
    saveResumeState(state: unknown): void;
    loadResumeState(): any;
    _saveLargeStateToDrive(stateJson: string): string;
    _loadLargeStateFromDrive(fileId: string): any;
    _getOrCreateJobStateFolder(): import("../types.js").StateFolder;
    saveConfiguration(config: JobConfiguration): void;
    loadConfiguration(): JobConfiguration;
    saveType(type: string): void;
    loadType(): string | null | undefined;
    clearResumeState(): void;
    reset(): void;
}
