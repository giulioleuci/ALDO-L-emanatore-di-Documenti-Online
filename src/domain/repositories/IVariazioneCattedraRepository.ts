import type { VariazioneCattedra } from '../entities/VariazioneCattedra';
import type { ClasseId } from '../value-objects/ClasseId';

export interface IVariazioneCattedraRepository {
  findByClasse(classeId: ClasseId): VariazioneCattedra[];
}
