import { DomainError } from '../domain/errors/DomainError';

type Factory<T> = (c: ServiceContainer) => T;

export class ServiceContainer {
  private readonly factories = new Map<string, Factory<unknown>>();
  private readonly singletons = new Map<string, unknown>();
  register<T>(name: string, factory: Factory<T>): void { this.factories.set(name, factory); }
  has(name: string): boolean { return this.factories.has(name); }
  get<T>(name: string): T {
    if (this.singletons.has(name)) return this.singletons.get(name) as T;
    const factory = this.factories.get(name);
    if (!factory) throw new DomainError(`Servizio non registrato: ${name}`);
    const instance = factory(this);
    this.singletons.set(name, instance);
    return instance as T;
  }
}
