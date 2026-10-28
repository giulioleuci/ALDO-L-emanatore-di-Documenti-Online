/**
 * Abstract base class for domain value objects, enforcing immutability and value-based equality.
 * @abstract
 * @class
 */
export declare class ValueObject {
    /**
     * Prevents direct instantiation of the abstract ValueObject class.
     * @throws {TypeError} If attempting to construct this abstract class directly.
     */
    constructor();
    /**
     * Finalizes the value object by making it immutable via Object.freeze.
     * @protected
     */
    _freeze(): void;
    /**
     * Compares this value object with another instance for deep structural equality.
     * @param {ValueObject} other Comparison target instance.
     * @returns {boolean} True if both instances share the same constructor and deep state.
     */
    equals(other: unknown): boolean;
    /**
     * Recursively evaluates equality between two values, supporting primitives, arrays, and objects.
     * @private
     * @param {*} a First value.
     * @param {*} b Second value.
     * @returns {boolean} True if values are deeply equivalent.
     */
    _deepEquals(a: unknown, b: unknown): boolean;
    /**
     * Generates a stringified representation of the value object's public properties.
     * @returns {string} Formatted class name and JSON-serialized state.
     */
    toString(): string;
    /**
     * Returns the underlying serializable data value represented by the object.
     * @abstract
     * @returns {*} Primitive or plain object representation.
     * @throws {Error} If the subclass fails to implement this method.
     */
    getValue(): unknown;
}
