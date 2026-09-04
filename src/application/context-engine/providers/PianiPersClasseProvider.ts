import type { ContextProvider } from '../ContextProvider';
import type { Cdu, PianoPersonalizzatoVM } from '../Cdu';
import type { BuildParams, RecipeOptions } from '../Recipe';
import type { IClasseRepository } from '../../../domain/repositories/IClasseRepository';
import type { ILogDocumentoRepository } from '../../../domain/repositories/ILogDocumentoRepository';
import type { IAlunnoRepository } from '../../../domain/repositories/IAlunnoRepository';
import type { Alunno } from '../../../domain/entities/Alunno';
import type { Piano } from '../../../domain/entities/Piano';
import type { StoricoDatabaseProvider } from '../../storico/StoricoDatabaseProvider';
import { ClasseId } from '../../../domain/value-objects/ClasseId';
import { StatoDocumento } from '../../../domain/value-objects/enums';
import { StoricoDocumentiService } from '../../storico/StoricoDocumentiService';
import { buildDocumentoLogVm, buildDocumentoStoricoVm } from '../mappers/documentoVmMapper';
import { tipoPianoLabel } from '../mappers/labels';
import { elencoVm } from '../mappers/elencoVm';

const TIPO_PIANO_PERS = 'PIANO_PERS';

type StudenteRef = { nomeCompleto: string; email: string };

/**
 * Fills `focus.classe.pianiPersonalizzati` (11 §11 new) from the active
 * student roster (`ALUNNI.ATTIVO`, ref 01 §"Regola attività"), not from
 * LOG_DOCS class tags: for every active student in every class in
 * `params.classiCompetenza` (falling back to `params.target`), every PIANI
 * row they hold is matched to its LOG_DOCS document by student email +
 * sottotipo; an unmatched piano still surfaces as a placeholder
 * (`hasId:false`), so a student who transferred out (ATTIVO:false) is
 * excluded even if their old document still tags this class, and a student
 * who transferred in is included even before any document exists. `storico`
 * merges every distinct current-year student's prior-year PIANO_PERS
 * documents, attached lazily. Active in DOCENTE_COMPLETO
 * (PER_COORDINATORE/PER_DOCENTE/PER_CDC).
 */
export class PianiPersClasseProvider implements ContextProvider {
  constructor(
    private readonly classi: IClasseRepository,
    private readonly logDocs: ILogDocumentoRepository,
    private readonly alunni: IAlunnoRepository,
    private readonly storicoDb: StoricoDatabaseProvider
  ) {}

  provide(cdu: Cdu, params: BuildParams, options: RecipeOptions): void {
    const focusClasse = cdu.focus.classe;
    if (focusClasse === undefined) return;
    const classIds = params.classiCompetenza ?? [params.target];
    const emails = new Set<string>();
    const elenco: PianoPersonalizzatoVM[] = classIds.flatMap((id) => {
      const classe = this.classi.findById(ClasseId.of(id));
      if (classe === null) return [];
      return this.classi.getStudenti(classe, true).flatMap((alunno) => {
        const piani = this.alunni.getPiani(alunno);
        if (piani.length === 0) return [];
        emails.add(alunno.email.value);
        const studente: StudenteRef = { nomeCompleto: alunno.cognomeNome, email: alunno.email.value };
        return piani.flatMap((piano) => this.itemsPerPiano(alunno, piano, studente));
      });
    });
    const nonVerbalizzati = elenco.filter((item) => !item.isVerbalizzato);
    const includiStorico = options.includiStorico;
    const profondita = options.profonditaAnniDocumenti;
    const service = new StoricoDocumentiService(this.storicoDb);
    focusClasse.pianiPersonalizzati = {
      ...elencoVm(elenco),
      nonVerbalizzati: elencoVm(nonVerbalizzati),
      storico: new LazyRef(() =>
        includiStorico
          ? [...emails].flatMap((email) =>
              service
                .perAlunnoConTipo(email, profondita)
                .filter((documento) => documento.tipo === TIPO_PIANO_PERS)
                .map(buildDocumentoStoricoVm)
            )
          : []
      )
    };
  }

  private itemsPerPiano(alunno: Alunno, piano: Piano, studente: StudenteRef): PianoPersonalizzatoVM[] {
    const matches = this.logDocs
      .findByUtente(alunno.email)
      .filter((l) => l.tipo === TIPO_PIANO_PERS && l.getSottotipo() === piano.tipo);
    if (matches.length === 0) return [this.placeholder(piano, studente)];
    return matches.map((l) => ({
      ...buildDocumentoLogVm(l),
      isVerbalizzato: l.getStato() === StatoDocumento.VERBALIZZATO,
      studente,
      hasStudente: true
    }));
  }

  private placeholder(piano: Piano, studente: StudenteRef): PianoPersonalizzatoVM {
    return {
      id: null,
      hasId: false,
      nome: '',
      link: '',
      tipo: TIPO_PIANO_PERS,
      tipoLabel: TIPO_PIANO_PERS,
      sottotipo: piano.tipo,
      sottotipoLabel: tipoPianoLabel(piano.tipo),
      hasSottotipo: true,
      generatoreId: '',
      stato: '',
      statoLabel: '',
      isNotificato: false,
      dataCreazione: '',
      dataCreazioneBreve: '',
      isVerbalizzato: false,
      studente,
      hasStudente: true
    };
  }
}
