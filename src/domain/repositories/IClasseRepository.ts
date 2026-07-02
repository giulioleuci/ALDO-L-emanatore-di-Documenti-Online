import type { Classe } from '../entities/Classe';
import type { ConsiglioDiClasse } from '../entities/ConsiglioDiClasse';
import type { ClasseId } from '../value-objects/ClasseId';

export type RepoRow = Record<string, string | number | boolean | null>;

export interface IClasseRepository {
  findById(id: ClasseId): Classe | null;
  getConsiglioDiClasse(id: ClasseId): ConsiglioDiClasse;
  getAlunniAttivi(id: ClasseId): RepoRow[];
}
