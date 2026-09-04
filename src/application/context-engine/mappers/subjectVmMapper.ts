import type { Materia } from '../../../domain/entities/Materia';
import type { IndirizzoId } from '../../../domain/value-objects/IndirizzoId';
import type { ContinuitaVM, MateriaVM, PersonaVM } from '../Cdu';
import { descriviPersone, descriviPersoneEsteso } from './personVmMapper';
import { PipelineError } from '../../../domain/errors/DomainError';

export type ProfiloMateriaVM = 'BASE' | 'CON_DOCENTI' | 'CON_CONTINUITA';

export interface MateriaVmContesto {
  indirizzo?: IndirizzoId;
  isItp?: boolean;
  principale?: string | null;
  specificita?: string | null;
  docenti?: PersonaVM[];
  hasCattedraItp?: boolean;
  continuita?: ContinuitaVM;
}

export function buildMateriaVm(
  materia: Materia,
  profilo: ProfiloMateriaVM,
  contesto: MateriaVmContesto
): MateriaVM {
  const specificita = contesto.specificita ?? materia.specificita;
  const principale = contesto.principale ?? materia.principale;
  const siglePrecedenti = Object.entries(materia.getEvoluzione())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([sigla, anni]) => {
      const anniOrdinati = [...anni].sort((a, b) => a - b);
      return { sigla, anni: anniOrdinati, anniDescrizione: anniOrdinati.join(', ') };
    });
  const esame = materia.esameConfig;
  const result: MateriaVM = {
    sigla: materia.id ?? '',
    nome: materia.nome,
    nomeSintetico: materia.sintesi,
    colore1: materia.colore1,
    colore2: materia.colore2,
    principale,
    specificita,
    hasSpecificita: specificita !== null,
    nomeConSpecificita:
      specificita === null ? materia.nome : `${principale ?? materia.nome} (${specificita})`,
    isItp: contesto.isItp ?? false,
    isMateriaPrimaProva:
      esame !== null &&
      contesto.indirizzo !== undefined &&
      esame.isPrimaProvaPerIndirizzo(contesto.indirizzo),
    isMateriaSecondaProva:
      esame !== null &&
      contesto.indirizzo !== undefined &&
      esame.isSecondaProvaPerIndirizzo(contesto.indirizzo),
    evoluzione: {
      siglePrecedenti,
      hasSiglePrecedenti: siglePrecedenti.length > 0
    }
  };

  if (profilo !== 'BASE') {
    const docenti = [...(contesto.docenti ?? [])].sort((a, b) =>
      a.nomeCompleto.localeCompare(b.nomeCompleto)
    );
    Object.assign(result, {
      docenti,
      hasDocenti: docenti.length > 0,
      docentiDescrizione: descriviPersone(docenti),
      docentiDescrizioneEstesa: descriviPersoneEsteso(docenti),
      hasCattedraItp: contesto.hasCattedraItp ?? false
    });
  }
  if (profilo === 'CON_CONTINUITA') {
    if (contesto.continuita === undefined) {
      throw new PipelineError('MateriaVM CON_CONTINUITA richiede continuita');
    }
    result.continuita = contesto.continuita;
  }
  return result;
}
