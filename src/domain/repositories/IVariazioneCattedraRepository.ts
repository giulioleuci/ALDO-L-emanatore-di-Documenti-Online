import type { VariazioneCattedra } from '../entities/VariazioneCattedra';
import type { ClasseId } from '../value-objects/ClasseId';
import type { Email } from '../value-objects/Email';

export interface IVariazioneCattedraRepository {
  findAll(): VariazioneCattedra[];
  findByClasse(classeId: ClasseId): VariazioneCattedra[];
  findByTitolare(email: Email): VariazioneCattedra[];
}
