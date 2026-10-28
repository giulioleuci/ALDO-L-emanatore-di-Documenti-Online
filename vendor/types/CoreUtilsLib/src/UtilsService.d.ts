/**
 * @file CoreUtilsLib/src/UtilsService.js
 * @description Utility service providing stateless helper functions for common operations.
 * @version 2.0 - Refactored using Facade/Delegation pattern
 */
import { IdGenerator } from './utils/IdGenerator.js';
import { DateUtils } from './utils/DateUtils.js';
import { StringUtils } from './utils/StringUtils.js';
import { SystemEnvironmentUtils } from './utils/SystemEnvironmentUtils.js';
import { SystemScriptSettings } from './utils/SystemScriptSettings.js';
import { chunk, compact, difference, differenceBy, every, filter, find, flattenDeep, forEach, groupBy, intersection, isEmpty, keyBy, map, maxBy, meanBy, minBy, orderBy, reduce, size, some, sumBy, uniq, uniqBy } from './facades/LodashFacade.js';
declare const clamp: (n: number, lo: number, hi: number) => number;
declare const flatten: {
    <T, D extends number = 1>(a: readonly T[] | null | undefined, depth?: D): FlatArray<T, D>[];
    (a: unknown, depth?: number): unknown[];
};
type PublicMethods<T> = Pick<T, {
    [K in keyof T]: K extends `_${string}` ? never : T[K] extends Function ? K : never;
}[keyof T]>;
export interface MyUtilsService extends PublicMethods<IdGenerator>, PublicMethods<DateUtils>, PublicMethods<StringUtils>, PublicMethods<SystemEnvironmentUtils>, PublicMethods<SystemScriptSettings> {
}
export declare class MyUtilsService {
    isEmpty: typeof isEmpty;
    chunk: typeof chunk;
    unique: typeof uniq;
    flatten: typeof flatten;
    flattenDeep: typeof flattenDeep;
    compact: typeof compact;
    difference: typeof difference;
    differenceBy: typeof differenceBy;
    groupBy: typeof groupBy;
    intersection: typeof intersection;
    keyBy: typeof keyBy;
    orderBy: typeof orderBy;
    uniq: typeof uniq;
    uniqBy: typeof uniqBy;
    clamp: typeof clamp;
    maxBy: typeof maxBy;
    minBy: typeof minBy;
    sumBy: typeof sumBy;
    meanBy: typeof meanBy;
    every: typeof every;
    filter: typeof filter;
    find: typeof find;
    forEach: typeof forEach;
    map: typeof map;
    reduce: typeof reduce;
    size: typeof size;
    some: typeof some;
    flattenShallow: <T>(array: readonly T[] | null | undefined) => FlatArray<T, 1>[];
    randomInt: (min: number, max: number) => number;
    round: (number: number, decimals?: number) => number;
    _sleepFn: ((milliseconds: number) => void) | null;
    _idGenerator: IdGenerator;
    _dateUtils: DateUtils;
    _stringUtils: StringUtils;
    _environmentUtils: SystemEnvironmentUtils;
    _scriptSettings: SystemScriptSettings;
    constructor(sleepFn?: ((milliseconds: number) => void) | null);
}
export { MyUtilsService as UtilsService };
