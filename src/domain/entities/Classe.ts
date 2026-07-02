import { ClasseId } from '../value-objects/ClasseId';
import { AnnoCorso } from '../value-objects/AnnoCorso';

export class Classe {
  constructor(
    public readonly id: ClasseId,
    public readonly nome: string,
    public readonly anno: AnnoCorso,
    public readonly indirizzo: string
  ) {}
}
