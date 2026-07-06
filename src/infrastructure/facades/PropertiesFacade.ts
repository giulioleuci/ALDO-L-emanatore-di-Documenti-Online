/**
 * Script-properties port (15 §7). The real facade goes through the
 * GoogleApiWrapper PropertiesService wrapper obtained from ServiceFactory —
 * ALDO never touches the native PropertiesService global.
 */
export interface IPropertiesFacade {
  get(key: string): string | null;
  set(key: string, value: string): void;
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
}
