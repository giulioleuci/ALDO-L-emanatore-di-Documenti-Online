import type { DomainRecord } from '../internal/contracts.js';
/**
 * Verifica che le due metà di una specification concordino. Se toQueryObject()
 * è non-null, il filtro di uguaglianza deve selezionare ESATTAMENTE le stesse
 * righe di isSatisfiedBy().
 *
 * @param {Object} spec Specification da verificare.
 * @param {Array<Object>} rows Righe grezze rappresentative — positive E negative.
 * @param {Function} hydrate Trasforma una riga nell'entità valutata dalla spec.
 * @returns {{ok: boolean, divergenti: Array<Object>}}
 */
export declare function assertSpecificationContract<Row extends object, E>(spec: {
    toQueryObject(): DomainRecord | null;
    isSatisfiedBy(entity: E): boolean;
}, rows: Row[], hydrate: (row: Row) => E): {
    ok: boolean;
    divergenti: Row[];
};
