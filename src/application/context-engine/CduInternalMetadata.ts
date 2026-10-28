/**
 * Verification and rendering identities that must not become part of the CDU
 * serialization contract used by templates. They are attached to the exact
 * projection/view-model objects for the duration of one GAS execution.
 */
export interface CduMateriaAssignmentIdentity {
  classeId: string;
  kind: string;
}

const materiaAssignmentIdentity = new WeakMap<object, CduMateriaAssignmentIdentity>();

export function attachCduMateriaAssignmentIdentity<T extends object>(
  materia: T,
  identity: CduMateriaAssignmentIdentity
): T {
  materiaAssignmentIdentity.set(materia, identity);
  return materia;
}

export function getCduMateriaAssignmentIdentity(
  materia: object
): CduMateriaAssignmentIdentity | undefined {
  return materiaAssignmentIdentity.get(materia);
}
