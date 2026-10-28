import type { RoleMetadata } from '../../types.js';
import type { Actor } from '../../core/Actor.js';
import type { RoleActor, RoutingResultData, Serialized } from '../../types.js';
/**
 * @class RoutingResult
 * @description Immutable Value Object categorizing actors into communication channels (primary, cc, bcc).
 */
export declare class RoutingResult<A extends RoleActor = Actor> {
    primary: A[];
    readonly cc: A[];
    readonly bcc: A[];
    readonly metadata: RoleMetadata;
    /**
     * @constructor
     * @param {Object} [data={}] - Routing payload.
     * @param {Actor[]} [data.primary=[]] - Directly addressed recipients (TO).
     * @param {Actor[]} [data.cc=[]] - Carbon copy recipients.
     * @param {Actor[]} [data.bcc=[]] - Blind carbon copy recipients.
     * @param {Object} [data.metadata={}] - Selection context details.
     */
    constructor(data?: RoutingResultData<A>);
    /**
     * @static
     * @description Factory for empty result.
     * @returns {RoutingResult}
     */
    static empty<A extends RoleActor = Actor>(): RoutingResult<A>;
    /**
     * @static
     * @description Factory for a single-recipient outcome.
     * @param {Actor} actor - The TO recipient.
     * @returns {RoutingResult}
     */
    static singlePrimary<A extends RoleActor>(actor: A): RoutingResult<A>;
    /**
     * @function isEmpty
     * @returns {boolean} True if all buckets (primary, cc, bcc) are empty.
     */
    isEmpty(): boolean;
    /**
     * @function toJSON
     * @description Deeply serializes to POJO.
     * @returns {Object} JSON-compatible structure.
     */
    toJSON(): {
        primary: Serialized<A>[];
        cc: Serialized<A>[];
        bcc: Serialized<A>[];
        metadata: {
            [x: string]: unknown;
        };
    };
    /**
     * @function toString
     * @returns {string} Debug string summarizing TO and CC recipient counts/labels.
     */
    toString(): string;
}
