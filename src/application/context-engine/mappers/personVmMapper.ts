import type { Docente } from '../../../domain/entities/Docente';
import { Genere, appellativo as appellativoDiGenere } from '../../../domain/value-objects/enums';

export interface PersonVM {
  nome: string;
  cognome: string | null;
  email: string | null;
  genere: 'M' | 'F' | null;
  appellativo: string | null;
  articolo: string | null;
  coordinatore: string | null;
  nomeCompleto: string;
  materia: string | null;
  appellativoCompleto: string;
  appellativoCognome: string;
}

export interface PersonVmInput {
  nome: string;
  cognome: string | null;
  email: string | null;
  genere: 'M' | 'F' | null;
  materia?: string | null;
}

/**
 * Builds the standardized PersonVM (02 §8.1). External experts (genere null)
 * collapse appellativo/articolo/coordinatore/appellativoCompleto/appellativoCognome
 * to null/nomeCompleto per the target spec.
 */
export function buildPersonVm(input: PersonVmInput): PersonVM {
  const { nome, cognome, email, genere } = input;
  const materia = input.materia ?? null;
  const nomeCompleto = cognome === null ? nome : `${nome} ${cognome}`.trim();

  if (genere === null) {
    return {
      nome,
      cognome,
      email,
      genere: null,
      appellativo: null,
      articolo: null,
      coordinatore: null,
      nomeCompleto,
      materia,
      appellativoCompleto: nomeCompleto,
      appellativoCognome: nomeCompleto
    };
  }

  const appellativo = appellativoDiGenere(genere as Genere);
  const articolo = genere === Genere.M ? 'il' : 'la';
  const coordinatore = genere === Genere.M ? 'coordinatore' : 'coordinatrice';
  const appellativoCompleto = `${appellativo} ${nomeCompleto}`;
  const appellativoCognome = cognome === null ? nomeCompleto : `${appellativo} ${cognome}`;

  return {
    nome,
    cognome,
    email,
    genere,
    appellativo,
    articolo,
    coordinatore,
    nomeCompleto,
    materia,
    appellativoCompleto,
    appellativoCognome
  };
}

export function buildPersonVmFromDocente(docente: Docente, materia: string | null = null): PersonVM {
  return buildPersonVm({
    nome: docente.nome,
    cognome: docente.cognome,
    email: docente.id,
    genere: docente.genere,
    materia
  });
}
