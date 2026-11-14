/**
 * Script-properties port (15 §7). The real facade goes through the
 * GoogleApiWrapper PropertiesService wrapper obtained from ServiceFactory —
 * ALDO never touches the native PropertiesService global.
 */
export interface IPropertiesFacade {
  get(key: string): string | null;
  set(key: string, value: string): void;
  /** Removes the key entirely (idempotent) — `set(key, '')` would leave an empty entry behind. */
  delete(key: string): void;
  /**
   * JSON state that can pass the ~9 KB per-property cap: the library moves it to a Drive file
   * when needed (JobRunnerLib tiered storage). Optional so simple test doubles can omit them.
   */
  setLarge?(name: string, value: unknown): void;
  getLarge?(name: string): unknown;
  deleteLarge?(name: string): void;
}

export class ScriptPropertiesFacade implements IPropertiesFacade {
  private readonly props: LibPropertiesService;

  constructor(props?: LibPropertiesService) {
    this.props = props ?? ServiceFactory.getPropertiesService();
  }

  get(key: string): string | null {
    return this.props.getProperty(key);
  }

  set(key: string, value: string): void {
    this.props.setProperty(key, value);
  }

  delete(key: string): void {
    this.props.deleteProperty(key);
  }

  setLarge(name: string, value: unknown): void {
    new QueuePersistenceHandler(name, this.props).saveResumeState(value);
  }

  getLarge(name: string): unknown {
    return new QueuePersistenceHandler(name, this.props).loadResumeState();
  }

  deleteLarge(name: string): void {
    new QueuePersistenceHandler(name, this.props).clearResumeState();
  }
}
