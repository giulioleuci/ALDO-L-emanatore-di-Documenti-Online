import type { ImmutableValue } from '../types.js';
/** Creates a defensive deep clone with immutable, serialization-safe metadata values. */
export declare function cloneAndFreeze<T>(value: T): ImmutableValue<T>;
