import type { AnnoClasseStorico } from '../../storico/StoricoClassiService';
import type { Materia } from '../../../domain/entities/Materia';
import type { IDocenteRepository } from '../../../domain/repositories/IDocenteRepository';
import type { PersonVM } from './personVmMapper';
import { buildPersonVmFromDocente } from './personVmMapper';
import { reconcileSigla } from '../../storico/reconcileSigla';

export interface ContinuitaVM {
  docentiAnniPrecedenti: Array<{
    annoIndietro: number;
    annoScolastico: string;
    titolare: PersonVM | null;
    itp: PersonVM | null;
  }>;
  continuitaUltimiTreAnni: boolean;
  continuitaUltimiDueAnni: boolean;
  continuitaUltimiTreAnniItp?: boolean;
  continuitaUltimiDueAnniItp?: boolean;
}

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

/**
 * Builds ContinuitaVM (02 §8.3) for one subject: for each historical year,
 * reconciles that year's teaching sigle to the current canonical id via
 * `reconcileSigla` (course year = current course year minus years back — a
 * student's cattedra sigla is keyed to the course year it was taught in, not
 * the calendar year) and picks the titolare/ITP docente(s) matching the
 * current subject. `itp` is always present per-year (`null` when the subject
 * has no ITP or none matched that year); only the aggregate top-level
 * `continuitaUltimiTreAnniItp`/`continuitaUltimiDueAnniItp` flags are omitted
 * from the object shape when `hasItp` is false (02 §8.3 note).
 */
export function buildContinuita(input: BuildContinuitaInput): ContinuitaVM {
  const docentiAnniPrecedenti = input.anniStorici.map((anno, index) => {
    const annoIndietro = index + 1;
    const annoCorsoStorico = input.annoCorsoCorrente - annoIndietro;
    const matches = anno.docenti.filter(
      (d) => reconcileSigla(d.materia, annoCorsoStorico, [input.materiaCorrente]) === input.siglaCorrente
    );
    const titolareMatch = matches.find((m) => !m.isItp);
    const itpMatch = input.hasItp ? matches.find((m) => m.isItp) : undefined;
    return {
      annoIndietro,
      annoScolastico: anno.anno,
      titolare: resolveDocente(titolareMatch?.docenteEmail, input.docenti),
      itp: input.hasItp ? resolveDocente(itpMatch?.docenteEmail, input.docenti) : null
    };
  });

  const sameTitolare = (annoIndietro: number): boolean => {
    const entry = docentiAnniPrecedenti.find((d) => d.annoIndietro === annoIndietro);
    return entry?.titolare !== null && entry?.titolare !== undefined && entry.titolare.email === input.titolareCorrenteEmail;
  };
  const sameItp = (annoIndietro: number): boolean => {
    const entry = docentiAnniPrecedenti.find((d) => d.annoIndietro === annoIndietro);
    return entry?.itp !== null && entry?.itp !== undefined && entry.itp.email === input.itpCorrenteEmail;
  };

  const result: ContinuitaVM = {
    docentiAnniPrecedenti,
    continuitaUltimiDueAnni: input.titolareCorrenteEmail !== null && sameTitolare(1),
    continuitaUltimiTreAnni: input.titolareCorrenteEmail !== null && sameTitolare(1) && sameTitolare(2)
  };
  if (input.hasItp) {
    result.continuitaUltimiDueAnniItp = input.itpCorrenteEmail !== null && sameItp(1);
    result.continuitaUltimiTreAnniItp = input.itpCorrenteEmail !== null && sameItp(1) && sameItp(2);
  }
  return result;
}

function resolveDocente(email: string | undefined, docenti: IDocenteRepository): PersonVM | null {
  if (email === undefined) return null;
  const docente = docenti.findById(email);
  return docente === null ? null : buildPersonVmFromDocente(docente);
}
