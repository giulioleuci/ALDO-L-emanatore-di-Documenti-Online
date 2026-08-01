/**
 * Base class for every ALDO domain specification.
 *
 * It extends DomainRepositoryLib's ambient global {@link Specification} class
 * (declared in types/gaslibs/index.d.ts) so ALDO specs inherit the library's
 * `and()`/`or()`/`not()` composition machinery for free, mirroring how
 * {@link AldoEntity} extends the ambient `Entity` class. `isSatisfiedBy` stays
 * abstract; `toQueryObject()` is ALDO's own domain-pure pushdown hook (GLF's
 * base class does not define it — GLF's own concrete specs use `toQuery`
 * against a `RepositoryQueryBuilder` instead), so it is declared here as an
 * abstract method every concrete ALDO spec must still implement.
 *
 * Declared internally as `AldoSpecification` and re-exported as `Specification`:
 * the ambient global is also named `Specification`, and a same-named top-level
 * declaration in this module would shadow that ambient identifier for the
 * `extends` clause itself (TS2506, self-referential base expression). Naming
 * the local declaration differently and aliasing it on export keeps the bare,
 * import-free reference to the ambient class (matching {@link AldoEntity}'s
 * style) while every consumer still sees and imports `Specification`.
 */
abstract class AldoSpecification<T> extends Specification {
  // This override only typechecks because TS checks method-syntax parameters
  // bivariantly: `isSatisfiedBy(candidate: T)` narrows the base class's
  // `isSatisfiedBy(entity: unknown)`, which is unsound under strict function-type
  // variance. A future strictness bump (e.g. a `strictFunctionTypes` edge case
  // around abstract method overrides) could break this silently — if it does,
  // start here.
  abstract override isSatisfiedBy(candidate: T): boolean;
  abstract toQueryObject(): Record<string, unknown> | null;
}

export { AldoSpecification as Specification };
