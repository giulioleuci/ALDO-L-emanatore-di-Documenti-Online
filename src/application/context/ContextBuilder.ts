import type { IClasseRepository } from '../../domain/repositories/IClasseRepository';
import type { ClasseId } from '../../domain/value-objects/ClasseId';
import type { Cdu } from './Cdu';
import { EntityNotFoundError } from '../../domain/errors/DomainError';

function due(n: number): string { return n < 10 ? `0${n}` : String(n); }

export class ContextBuilder {
  constructor(private readonly classeRepo: IClasseRepository, private readonly now: Date) {}

  build(target: ClasseId): Cdu {
    const classe = this.classeRepo.findById(target);
    if (!classe) throw new EntityNotFoundError(`Classe ${target.value} non trovata`);
    const cdc = this.classeRepo.getConsiglioDiClasse(target);
    const d = this.now;
    const breve = `${due(d.getUTCDate())}/${due(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
    return {
      meta: {
        date: { oggi: { breve, anno: String(d.getUTCFullYear()) } },
        parametriInput: { target: target.value, tipoTarget: 'classe' }
      },
      focus: { classe: { anagrafica: { nome: classe.nome, anno: classe.anno.value } } },
      tech: { consiglioDiClasse: cdc }
    };
  }
}
