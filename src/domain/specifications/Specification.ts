export interface Specification<T> {
  isSatisfiedBy(candidate: T): boolean;
  toQueryObject(): Record<string, unknown> | null;
}
