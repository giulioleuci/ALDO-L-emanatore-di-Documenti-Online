import type { CollettivoPersoneVM, PersonaVM } from '../Cdu';

export interface PersonaVmInput {
  nome: string;
  cognome: string | null;
  email: string | null;
  genere: 'M' | 'F' | null;
  isEsterno?: boolean;
}

export function buildPersonaVm(input: PersonaVmInput): PersonaVM {
  const nomeCompleto =
    input.cognome === null ? input.nome : `${input.cognome} ${input.nome}`.trim();
  const appellativo =
    input.genere === null ? null : input.genere === 'F' ? 'Prof.ssa' : 'Prof.';
  const articolo = input.genere === null ? null : input.genere === 'F' ? 'La' : 'Il';
  const coordinatore =
    input.genere === null ? null : input.genere === 'F' ? 'Coordinatrice' : 'Coordinatore';

  return {
    nome: input.nome,
    cognome: input.cognome,
    nomeCompleto,
    email: input.email,
    genere: input.genere,
    appellativo,
    articolo,
    coordinatore,
    appellativoCompleto: appellativo === null ? nomeCompleto : `${appellativo} ${nomeCompleto}`,
    appellativoCognome:
      appellativo === null || input.cognome === null
        ? nomeCompleto
        : `${appellativo} ${input.cognome}`,
    isEsterno: input.isEsterno ?? input.email === null
  };
}

export function buildCollettivoPersone(persone: PersonaVM[]): CollettivoPersoneVM {
  const numero = persone.length;
  if (numero === 0) {
    return {
      appellativo: '',
      articolo: '',
      coordinamento: '',
      coordina: '',
      presiede: '',
      numero
    };
  }
  const femminile = persone.every((persona) => persona.genere === 'F');
  if (numero === 1) {
    return {
      appellativo: femminile ? 'Prof.ssa' : 'Prof.',
      articolo: femminile ? 'La' : 'Il',
      coordinamento: femminile ? 'Coordinatrice' : 'Coordinatore',
      coordina: 'Coordina',
      presiede: 'Presiede',
      numero
    };
  }
  return {
    appellativo: femminile ? 'Prof.sse' : 'Prof.',
    articolo: femminile ? 'Le' : 'I',
    coordinamento: femminile ? 'Coordinatrici' : 'Coordinatori',
    coordina: 'Coordinano',
    presiede: 'Presiedono',
    numero
  };
}

function minuscolaIniziale(value: string): string {
  return value === '' ? '' : value[0]!.toLocaleLowerCase('it-IT') + value.slice(1);
}

function unisciFrase(parti: string[]): string {
  if (parti.length < 2) return parti[0] ?? '';
  if (parti.length === 2) return `${parti[0]} e ${parti[1]}`;
  return `${parti.slice(0, -1).join(', ')} e ${parti[parti.length - 1]}`;
}

export function descriviPersone(persone: PersonaVM[]): string {
  return unisciFrase(
    persone.map((persona, index) => {
      const testo =
        persona.appellativo === null
          ? persona.nomeCompleto
          : `${persona.appellativo} ${persona.nomeCompleto}`;
      return index === 0 ? testo : minuscolaIniziale(testo);
    })
  );
}

export function descriviPersoneEsteso(persone: PersonaVM[]): string {
  return unisciFrase(
    persone.map((persona, index) => {
      const testo =
        persona.articolo === null || persona.appellativo === null
          ? persona.nomeCompleto
          : `${persona.articolo} ${minuscolaIniziale(persona.appellativo)} ${persona.nomeCompleto}`;
      return index === 0 ? testo : minuscolaIniziale(testo);
    })
  );
}
