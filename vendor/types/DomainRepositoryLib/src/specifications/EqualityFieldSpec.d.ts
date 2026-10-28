import { Specification } from './Specification.js';
/**
 * Specification di uguaglianza in cui isSatisfiedBy e toQueryObject sono
 * coerenti per costruzione: il valore letto dall'entità e quello confrontato
 * nella query sono lo stesso.
 */
export declare class EqualityFieldSpec<E = unknown, V = unknown> extends Specification<E> {
    _column: string;
    _read: (entity: E) => V;
    _expected: V;
    /**
     * @param {string} column Nome colonna DB per il pushdown.
     * @param {Function} read Legge dall'entità il valore da confrontare.
     * @param {*} expected Valore atteso.
     */
    constructor(column: string, read: (entity: E) => V, expected: V);
    isSatisfiedBy(entity: E): boolean;
    toQueryObject(): {
        [x: string]: V;
    };
    toString(): string;
}
