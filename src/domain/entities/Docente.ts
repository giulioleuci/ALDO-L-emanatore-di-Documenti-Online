import { Email } from '../value-objects/Email';
import { Genere, appellativo } from '../value-objects/enums';

export class Docente {
  constructor(
    public readonly email: Email,
    public readonly cognome: string,
    public readonly nome: string,
    public readonly genere: Genere
  ) {}
  cognomeNome(): string {
    return `${this.cognome} ${this.nome}`;
  }
  nomeConAppellativo(): string {
    return `${appellativo(this.genere)} ${this.cognomeNome()}`;
  }
}
