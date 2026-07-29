import type { Supplenza } from '../entities/Supplenza';
import type { Docente } from '../entities/Docente';

export interface ISupplenzaRepository {
  findByTitolare(docente: Docente): Supplenza[];
  findBySupplente(docente: Docente): Supplenza[];
  findAttive(data: Date): Supplenza[];
  creaSupplenza(
    titolare: Docente,
    supplente: Docente,
    dal: Date,
    al: Date | null,
    classi: string,
    materie: string
  ): Supplenza;
  getTitolare(supplenza: Supplenza): Docente;
  getSupplente(supplenza: Supplenza): Docente;
}
