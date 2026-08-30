import type { ContextProvider } from '../ContextProvider';
import type { Cdu, PianoPersonalizzatoVM } from '../Cdu';
import type { BuildParams, RecipeOptions } from '../Recipe';
import type { IClasseRepository } from '../../../domain/repositories/IClasseRepository';
import type { ILogDocumentoRepository } from '../../../domain/repositories/ILogDocumentoRepository';
import type { IAlunnoRepository } from '../../../domain/repositories/IAlunnoRepository';
import type { StoricoDatabaseProvider } from '../../storico/StoricoDatabaseProvider';
import { ClasseId } from '../../../domain/value-objects/ClasseId';
import { StatoDocumento } from '../../../domain/value-objects/enums';
import { StoricoDocumentiService } from '../../storico/StoricoDocumentiService';
import { buildDocumentoLogVm, buildDocumentoStoricoVm } from '../mappers/documentoVmMapper';
import { elencoVm } from '../mappers/elencoVm';

const TIPO_PIANO_PERS = 'PIANO_PERS';

/**
 * Fills `focus.classe.pianiPersonalizzati` (11 §11 new) by aggregating
 * LOG_DOCS across every class in `params.classiCompetenza` (falling back to
 * the single `params.target` class when absent), filtered to
 * TIPO === 'PIANO_PERS'. Each item is tagged with its owning student,
 * resolved from LOG_DOCS.UTENTI via AlunnoRepository. `storico` merges every
 * distinct current-year student's prior-year PIANO_PERS documents, attached
 * lazily (mirrors `DocumentiClasseProvider`). Active in DOCENTE_COMPLETO
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
      return this.logDocs
        .findByClasse(classe)
        .filter((l) => l.tipo === TIPO_PIANO_PERS)
        .map((l) => {
          const email = l.getUtenti()[0] ?? '';
          if (email !== '') emails.add(email);
          const alunno = email !== '' ? this.alunni.findById(email) : null;
          const studente = alunno === null ? null : { nomeCompleto: alunno.cognomeNome, email };
          return {
            ...buildDocumentoLogVm(l),
            isVerbalizzato: l.getStato() === StatoDocumento.VERBALIZZATO,
            studente,
            hasStudente: studente !== null
          };
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
}
