import type { Materia } from '../../../domain/entities/Materia';
import type { IndirizzoId } from '../../../domain/value-objects/IndirizzoId';
import type { PersonVM } from './personVmMapper';
import type { ContinuitaVM } from './continuitaMapper';

export interface SubjectVmEvoluzione {
  siglePrecedenti: Array<{ sigla: string; nome: string | null; anni: number[] }>;
}

export interface SubjectVM {
  sigla: string;
  nome: string;
  nomeSintetico: string;
  colore1: string;
  colore2: string;
  isMateriaPrimaProva: boolean;
  isMateriaSecondaProva: boolean;
  principale: string | null;
  specificita: string | null;
  isITP: boolean;
  hasItp?: boolean;
  evoluzione: SubjectVmEvoluzione | null;
  docenti?: PersonVM[];
  docentiDescrizione?: string;
  continuita?: ContinuitaVM;
}

export interface BuildSubjectVmOptions {
  indirizzo?: IndirizzoId;
  isITP?: boolean;
  principale?: string | null;
  specificita?: string | null;
}

/** Builds a standardized SubjectVM (02 §8.2) from a Materia entity. */
export function buildSubjectVm(materia: Materia, opts: BuildSubjectVmOptions = {}): SubjectVM {
  const config = materia.esameConfig;
  const indirizzo = opts.indirizzo;
  const isMateriaPrimaProva =
    config !== null && indirizzo !== undefined && config.isPrimaProvaPerIndirizzo(indirizzo);
  const isMateriaSecondaProva =
    config !== null && indirizzo !== undefined && config.isSecondaProvaPerIndirizzo(indirizzo);

  const evoluzioneRaw = materia.getEvoluzione();
  const siglePrecedenti = Object.entries(evoluzioneRaw).map(([sigla, anni]) => ({
    sigla,
    nome: null,
    anni
  }));

  return {
    sigla: materia.id ?? '',
    nome: materia.nome,
    nomeSintetico: materia.sintesi,
    colore1: materia.colore1,
    colore2: materia.colore2,
    isMateriaPrimaProva,
    isMateriaSecondaProva,
    principale: opts.principale ?? null,
    specificita: opts.specificita ?? null,
    isITP: opts.isITP ?? false,
    evoluzione: siglePrecedenti.length > 0 ? { siglePrecedenti } : null
  };
}

/** Precomputed "Mario Rossi, Laura Gialli" join (02 §8.2, principle P4). */
export function docentiDescrizione(docenti: PersonVM[]): string {
  return docenti.map((d) => d.nomeCompleto).join(', ');
}
