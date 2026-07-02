export class PipelineContext {
  private readonly store = new Map<string, unknown>();
  public readonly errors: string[] = [];
  public readonly logEsecuzione: string[] = [];
  get<T>(key: string): T | undefined { return this.store.get(key) as T | undefined; }
  set(key: string, value: unknown): void { this.store.set(key, value); }
  addError(msg: string): void { this.errors.push(msg); this.logEsecuzione.push(`ERROR: ${msg}`); }
  addSuccess(msg: string): void { this.logEsecuzione.push(`OK: ${msg}`); }
}
