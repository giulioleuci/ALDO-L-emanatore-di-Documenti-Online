import type { IPropertiesFacade } from '../../src/infrastructure/facades/PropertiesFacade';

export class FakePropertiesFacade implements IPropertiesFacade {
  private readonly store = new Map<string, string>();

  constructor(seed: Record<string, string> = {}) {
    for (const [k, v] of Object.entries(seed)) this.store.set(k, v);
  }

  get(key: string): string | null {
    return this.store.get(key) ?? null;
  }

  set(key: string, value: string): void {
    this.store.set(key, value);
  }

  delete(key: string): void {
    this.store.delete(key);
  }
}
