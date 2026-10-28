/**
 * @file RoleResolutionLib/src/utils/MateriaSlotParsing.js
 * @description Reusable helpers for parsing "MATERIA.itp"/"MATERIA.specifica"-style
 * CSV cattedra columns (e.g. a `MATERIE` cell listing several teaching subjects,
 * optionally slot-qualified) into structured, slot-grouped data, plus the
 * wildcard-aware slot-compatibility check used to compare two such qualifiers.
 * Domain-agnostic: any GAS app that stores a CSV of subject/qualifier pairs in
 * a spreadsheet cell can reuse these instead of re-deriving the same parsing.
 * @version 1.0.0
 */
/**
 * @function splitCsvList
 * @description Splits a comma-separated string into trimmed, non-empty entries.
 * @param {string} raw - Raw CSV string (entries may have surrounding whitespace;
 *   empty entries, e.g. from a trailing/doubled comma, are dropped).
 * @returns {string[]} Trimmed, non-empty entries in original order.
 */
export declare function splitCsvList(raw: string): string[];
/**
 * @function groupMateriaEntriesBySlot
 * @description Groups a materia CSV's entries by slot qualifier, per-entry (a
 * single CSV can legitimately mix a bare materia with a slot-qualified one from
 * a different materia). `MATERIA` -> any slot (kind `'*'`); `MATERIA.itp` -> ITP;
 * `MATERIA.<anything else>` -> SPECIFICA (with that suffix as the specifica id).
 * @param {string} materieRaw - Raw CSV of materia entries, each optionally
 *   suffixed with `.itp` or `.<specifica id>`.
 * @returns {Array<{kind: string, specifica: string, materie: string[]}>} One
 *   group per distinct (kind, specifica) pair found, each collecting the base
 *   materia ids that share it, in first-seen order.
 */
export declare function groupMateriaEntriesBySlot(materieRaw: string): {
    kind: string;
    specifica: string;
    materie: string[];
}[];
/**
 * @function slotCompatible
 * @description Whether two slot qualifiers can refer to the same physical
 * teaching post (ANY matches any kind/specifica).
 * @param {{kind: string, specifica: string}} a
 * @param {{kind: string, specifica: string}} b
 * @returns {boolean}
 */
export declare function slotCompatible(a: {
    kind: string;
    specifica: string;
}, b: {
    kind: string;
    specifica: string;
}): boolean;
/**
 * @function pairsOverlap
 * @description True if any pair in `a` shares a (classe, materia) with a
 * slot-compatible pair in `b`.
 * @param {ReadonlyArray<{classeId: string, materia: string, kind: string, specifica: string}>} a
 * @param {ReadonlyArray<{classeId: string, materia: string, kind: string, specifica: string}>} b
 * @returns {boolean}
 */
export declare function pairsOverlap(a: ReadonlyArray<{
    classeId: string;
    materia: string;
    kind: string;
    specifica: string;
}>, b: ReadonlyArray<{
    classeId: string;
    materia: string;
    kind: string;
    specifica: string;
}>): boolean;
