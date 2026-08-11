/**
 * Materializza un LazyRef prima di assert/render (MISSING_TESTS: "Direct JSON
 * serialization is not a valid substitute"). Se l'oggetto espone .get(), lo
 * invoca; altrimenti ritorna l'oggetto stesso.
 */
export function materializeLazyRef(ref: unknown): unknown {
  if (
    ref !== null &&
    typeof ref === 'object' &&
    typeof (ref as { get?: () => unknown }).get === 'function'
  ) {
    return (ref as { get: () => unknown }).get();
  }
  return ref;
}
