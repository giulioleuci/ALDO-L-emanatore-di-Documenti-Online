import { DomainError } from '../domain/errors/DomainError';

type Factory<T> = (c: ServiceContainer) => T;

/**
 * Thin ALDO-typed wrapper over `CoreUtilsLib.LazyServiceContainer` (ref
 * REPORT_GLF.md B8): storage/lazy-resolution is the library's generic
 * register/get/reset machinery; this class only adds the `DomainError` typed
 * error ALDO's config layer expects on an unregistered lookup, and passes
 * `this` (not the inner container) to factories so `(c: ServiceContainer) =>
 * T` factories keep resolving sibling services through the same public API.
 */
export class ServiceContainer {
  private readonly inner = new LazyServiceContainer({ entityName: 'servizio' });

  register<T>(name: string, factory: Factory<T>): void {
    this.inner.register(name, () => factory(this));
  }

  has(name: string): boolean {
    return this.inner.has(name);
  }

  get<T>(name: string): T {
    if (!this.inner.has(name)) throw new DomainError(`Servizio non registrato: ${name}`);
    return this.inner.get<T>(name);
  }
}
