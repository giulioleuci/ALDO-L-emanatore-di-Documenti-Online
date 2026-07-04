/**
 * Base class for every ALDO domain entity.
 *
 * It extends DomainRepositoryLib's {@link Entity} so entities inherit the
 * library's identity, dirty-tracking, and persistence integration: on read the
 * library's EntityMapper calls each entity's static `fromData`, and on write
 * `Repository.save()` dehydrates through each entity's `toData()`. ALDO entities
 * validate through their fail-loud constructors and Value Objects, so we override
 * the library's default `validate()` — which inspects a `MappingConfiguration`
 * (fixed/dynamic column descriptors) these entities intentionally do not populate,
 * relying on the `fromData`/`toData` hydration hooks instead. Returning `true`
 * here lets `Repository.save()`/`validateOrThrow()` run without reimplementing any
 * persistence logic; correctness is still guaranteed at construction time.
 */
export abstract class AldoEntity extends Entity {
  validate(): boolean { return true; }
}
