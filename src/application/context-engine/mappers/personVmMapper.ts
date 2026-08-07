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
  const articolo = genere === 'M' ? 'il' : 'la';
  const coordinatore = genere === 'M' ? 'coordinatore' : 'coordinatrice';
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

export interface PersonGroupDeclension {
  appellativo: string;
  articolo: string;
}

/**
 * Aggregate salutation/article over a group of people (02 §8.1, §2.6):
 * tutte F e ≥2 → prof.sse/le; tutte F e 1 → prof.ssa/la; altrimenti prof./i (≥2) o il (1).
 * Returns undefined for an empty group — callers must omit the field rather than expose it.
 */
export function declinePersonGroup(persone: PersonVM[]): PersonGroupDeclension | undefined {
  if (persone.length === 0) return undefined;
  const tutteF = persone.every((p) => p.genere === 'F');
  if (tutteF) {
    return persone.length >= 2
      ? { appellativo: 'prof.sse', articolo: 'le' }
      : { appellativo: 'prof.ssa', articolo: 'la' };
  }
  return { appellativo: 'prof.', articolo: persone.length >= 2 ? 'i' : 'il' };
}

/** "coordina"/"presiede" for 1 person, "coordinano"/"presiedono" for ≥2 (02 §8.1). */
export function coordinatoriVerbs(count: number): { coordina: string; presiede: string } {
  return count >= 2
    ? { coordina: 'coordinano', presiede: 'presiedono' }
    : { coordina: 'coordina', presiede: 'presiede' };
}
