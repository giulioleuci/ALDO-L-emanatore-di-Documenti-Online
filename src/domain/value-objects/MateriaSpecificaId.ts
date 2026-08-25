import { MateriaId } from './MateriaId';
import { stringId } from './stringId';

const MATERIA_SPECIFICA_RE = /^([A-Z]{2,10})\.([A-Z][A-Z0-9_]{1,19})$/;

/**
 * `MATERIA.SPECIFICA` composite id (e.g. `INTERPRET.CHITARRA`), distinct from
 * bare `MateriaId` at the type level (design 2026-07-30 §Identifier shape).
 */
export class MateriaSpecificaId extends stringId('MateriaSpecificaId', MATERIA_SPECIFICA_RE) {
  static override of(raw: string): MateriaSpecificaId {
    return super.of(raw) as MateriaSpecificaId;
  }

  materia(): MateriaId {
    return MateriaId.of(this.value.split('.')[0]!);
  }

  specifica(): string {
    return this.value.split('.')[1]!;
  }
}
