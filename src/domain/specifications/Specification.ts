/**
 * Base class for every ALDO domain specification.
 *
 * It extends DomainRepositoryLib's generic ambient global so ALDO specs inherit
 * composition, the default in-memory `toQueryObject() → null`, and the optional
 * equality-pushdown hook without importing a query builder.
 *
 * Declared internally as `AldoSpecification` and re-exported as `Specification`:
 * the ambient global is also named `Specification`, and a same-named top-level
 * declaration in this module would shadow that ambient identifier for the
 * `extends` clause itself (TS2506, self-referential base expression). Naming
 * the local declaration differently and aliasing it on export keeps the bare,
 * import-free reference to the ambient class (matching {@link AldoEntity}'s
 * style) while every consumer still sees and imports `Specification`.
 */
abstract class AldoSpecification<T> extends Specification<T> {
  abstract override isSatisfiedBy(candidate: T): boolean;
}

export { AldoSpecification as Specification };
