import type { Supplenza } from '../entities/Supplenza';
import type { Docente } from '../entities/Docente';
import type { ClasseId } from '../value-objects/ClasseId';
import type { MateriaId } from '../value-objects/MateriaId';

export interface ISupplenzaRepository {
  /**
   * The effective supply teacher for a titolare/date/context, following the
   * replacement chain to the end (supply-of-supply).
   */
  findSupplenzaSpecifica(
    titolare: Docente,
    data: Date,
    classe?: ClasseId,
    materia?: MateriaId
  ): Supplenza | null;
}
