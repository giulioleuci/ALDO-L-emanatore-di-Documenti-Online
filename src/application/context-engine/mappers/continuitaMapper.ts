import type { AnnoClasseStorico, CattedraStorica } from '../../storico/StoricoClassiService';
import type { Materia } from '../../../domain/entities/Materia';
import type { IDocenteRepository } from '../../../domain/repositories/IDocenteRepository';
import type { CattedraTimelineVM, ContinuitaVM, PersonaVM } from '../Cdu';
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
  docentiStorici: IDocenteRepository[];
  cattedreCorrenti: CattedraStorica[];
}

function toTimelineVm(cattedra: CattedraStorica, docenti: IDocenteRepository): CattedraTimelineVM {
  return {
    titolareOriginario: resolveDocente(cattedra.titolareOriginario, docenti),
    variazioni: cattedra.variazioni.map((variazione) => ({
      nuovoTitolare: resolveDocente(variazione.nuovoTitolare, docenti),
      dal: variazione.dal
    })),
    supplenze: cattedra.supplenze.map((supplenza) => ({
      supplente: resolveDocente(supplenza.supplente, docenti),
      dal: supplenza.dal,
      al: supplenza.al
    })),
    hasVariazioni: cattedra.variazioni.length > 0,
    hasSupplenze: cattedra.supplenze.length > 0
  };
}

function resolveDocente(email: string | undefined, docenti: IDocenteRepository): PersonaVM | null {
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
  const timelineFor = (
    cattedre: CattedraStorica[],
    docenti: IDocenteRepository,
    isItp: boolean,
    annoIndietro = 0
  ): CattedraTimelineVM | null => {
    const cattedra = cattedre.find(
      (x) =>
        x.isItp === isItp &&
        reconcileSigla(x.materia, input.annoCorsoCorrente - annoIndietro, [
          input.materiaCorrente
        ]) === input.siglaCorrente
    );
    return cattedra === undefined ? null : toTimelineVm(cattedra, docenti);
  };
  const anniPrecedenti = input.anniStorici.map((anno, index) => {
    const annoIndietro = index + 1;
    const docentiStorici = input.docentiStorici[index] ?? input.docenti;
    const matches = anno.docenti.filter(
      (docente) =>
        reconcileSigla(docente.materia, input.annoCorsoCorrente - annoIndietro, [
          input.materiaCorrente
        ]) === input.siglaCorrente
    );
    const titolare = resolveDocente(
      matches.find((docente) => !docente.isItp)?.docenteEmail,
      docentiStorici
    );
    const itp = input.hasItp
      ? resolveDocente(matches.find((docente) => docente.isItp)?.docenteEmail, docentiStorici)
      : null;
    return {
      annoIndietro,
      annoScolastico: anno.anno,
      titolare,
      hasTitolare: titolare !== null,
      itp,
      hasItp: itp !== null,
      titolareTimeline: timelineFor(anno.cattedre, docentiStorici, false, annoIndietro),
      itpTimeline: timelineFor(anno.cattedre, docentiStorici, true, annoIndietro)
    };
  });

  const stesso = (annoIndietro: number, ruolo: 'titolare' | 'itp', email: string | null): boolean =>
    email !== null &&
    anniPrecedenti.find((anno) => anno.annoIndietro === annoIndietro)?.[ruolo]?.email === email;

  return {
    anniPrecedenti,
    titolareTimeline: timelineFor(input.cattedreCorrenti, input.docenti, false),
    itpTimeline: timelineFor(input.cattedreCorrenti, input.docenti, true),
    hasAnniPrecedenti: anniPrecedenti.length > 0,
    isContinuitaUltimiDueAnni: stesso(1, 'titolare', input.titolareCorrenteEmail),
    isContinuitaUltimiTreAnni:
      stesso(1, 'titolare', input.titolareCorrenteEmail) &&
      stesso(2, 'titolare', input.titolareCorrenteEmail),
    isContinuitaItpUltimiDueAnni: input.hasItp && stesso(1, 'itp', input.itpCorrenteEmail),
    isContinuitaItpUltimiTreAnni:
      input.hasItp &&
      stesso(1, 'itp', input.itpCorrenteEmail) &&
      stesso(2, 'itp', input.itpCorrenteEmail)
  };
}
