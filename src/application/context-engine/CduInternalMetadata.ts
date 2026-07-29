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
const articolazionePartners = new WeakMap<object, string[]>();

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

export function attachCduArticolazionePartners<T extends object>(
  articolazione: T,
  partners: string[]
): T {
  articolazionePartners.set(articolazione, partners);
  return articolazione;
}

export function getCduArticolazionePartners(articolazione: object): string[] | undefined {
  return articolazionePartners.get(articolazione);
}
