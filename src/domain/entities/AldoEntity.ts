/** Base class for every ALDO domain entity. */
export abstract class AldoEntity extends Entity {
  validate(): boolean {
    return true;
  }
}
