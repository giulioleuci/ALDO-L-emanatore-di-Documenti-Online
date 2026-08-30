import type { AnnoClasseStorico } from '../../storico/StoricoClassiService';
import type { Materia } from '../../../domain/entities/Materia';
import type { IDocenteRepository } from '../../../domain/repositories/IDocenteRepository';
import type { ContinuitaVM, PersonaVM } from '../Cdu';
import { buildPersonaVm } from './personVmMapper';
import { reconcileSigla } from '../../storico/reconcileSigla';

export interface BuildContinuitaInput {
  siglaCorrente: string;
  hasItp: boolean;
  titolareCorrenteEmail: string | null;
  itpCorrenteEmail: string | null;
  annoCorsoCorrente: number;
  anniStorici: AnnoClasseStorico[];
  materiaCorrente: Materia;
  docenti: IDocenteRepository;
}

function resolveDocente(
  email: string | undefined,
  docenti: IDocenteRepository
): PersonaVM | null {
  if (email === undefined) return null;
  const docente = docenti.findById(email);
  return docente === null
    ? null
    : buildPersonaVm({
        nome: docente.nome,
        cognome: docente.cognome,
        email: docente.id,
        genere: docente.genere,
        isEsterno: false
      });
}

export function buildContinuita(input: BuildContinuitaInput): ContinuitaVM {
  const anniPrecedenti = input.anniStorici.map((anno, index) => {
    const annoIndietro = index + 1;
    const matches = anno.docenti.filter(
      (docente) =>
        reconcileSigla(
          docente.materia,
          input.annoCorsoCorrente - annoIndietro,
          [input.materiaCorrente]
        ) === input.siglaCorrente
    );
    const titolare = resolveDocente(
      matches.find((docente) => !docente.isItp)?.docenteEmail,
      input.docenti
    );
    const itp = input.hasItp
      ? resolveDocente(
          matches.find((docente) => docente.isItp)?.docenteEmail,
          input.docenti
        )
      : null;
    return {
      annoIndietro,
      annoScolastico: anno.anno,
      titolare,
      hasTitolare: titolare !== null,
      itp,
      hasItp: itp !== null
    };
  });

  const stesso = (
    annoIndietro: number,
    ruolo: 'titolare' | 'itp',
    email: string | null
  ): boolean =>
    email !== null &&
    anniPrecedenti.find((anno) => anno.annoIndietro === annoIndietro)?.[ruolo]?.email === email;

  return {
    anniPrecedenti,
    hasAnniPrecedenti: anniPrecedenti.length > 0,
    isContinuitaUltimiDueAnni: stesso(1, 'titolare', input.titolareCorrenteEmail),
    isContinuitaUltimiTreAnni:
      stesso(1, 'titolare', input.titolareCorrenteEmail) &&
      stesso(2, 'titolare', input.titolareCorrenteEmail),
    isContinuitaItpUltimiDueAnni:
      input.hasItp && stesso(1, 'itp', input.itpCorrenteEmail),
    isContinuitaItpUltimiTreAnni:
      input.hasItp &&
      stesso(1, 'itp', input.itpCorrenteEmail) &&
      stesso(2, 'itp', input.itpCorrenteEmail)
  };
}
