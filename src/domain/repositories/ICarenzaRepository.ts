import type { Carenza } from '../entities/Carenza';
import type { Alunno } from '../entities/Alunno';
import type { Classe } from '../entities/Classe';
import type { MateriaId } from '../value-objects/MateriaId';
import type { ValoreCarenza } from '../value-objects/ValoreCarenza';
import type { AnnoScolastico } from '../value-objects/AnnoScolastico';

export interface ICarenzaRepository {
  findAll(): Carenza[];
  findByAlunno(alunno: Alunno, options?: { annoScolastico?: AnnoScolastico }): Carenza[];
  findByClasse(classe: Classe, data?: Date): Carenza[];
  findNonNotificate(): Carenza[];
  getCarenzePerMateria(carenza: Carenza): Map<MateriaId, ValoreCarenza>;
  setCarenzaMateria(carenza: Carenza, materia: MateriaId, valore: ValoreCarenza | null): void;
}
