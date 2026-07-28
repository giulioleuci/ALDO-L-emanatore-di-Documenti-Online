import type { ContextProvider } from '../ContextProvider';
import type { Cdu } from '../Cdu';
import type { BuildParams } from '../Recipe';
import type { IClasseRepository } from '../../../domain/repositories/IClasseRepository';
import type { ILogDocumentoRepository } from '../../../domain/repositories/ILogDocumentoRepository';
import type { IAlunnoRepository } from '../../../domain/repositories/IAlunnoRepository';
import { ClasseId } from '../../../domain/value-objects/ClasseId';

const TIPO_PIANO_PERS = 'PIANO_PERS';

/**
 * Fills `focus.classe.didattica.pianiPersonalizzati` (11 §11 new) by
 * aggregating LOG_DOCS across every class in `params.classiCompetenza`
 * (falling back to the single `params.target` class when absent — e.g. a
 * direct CDU build outside the email pipeline), filtered to
 * TIPO === 'PIANO_PERS'. Each item is tagged with its owning student,
 * resolved from LOG_DOCS.UTENTI via AlunnoRepository. Active in
 * DOCENTE_COMPLETO (PER_COORDINATORE/PER_DOCENTE/PER_CDC).
 */
export class PianiPersClasseProvider implements ContextProvider {
  constructor(
    private readonly classi: IClasseRepository,
    private readonly logDocs: ILogDocumentoRepository,
    private readonly alunni: IAlunnoRepository
  ) {}

  provide(cdu: Cdu, params: BuildParams): void {
    if (cdu.focus.classe === undefined) return;
    const classIds = params.classiCompetenza ?? [params.target];
    const items = classIds.flatMap((id) => {
      const classe = this.classi.findById(ClasseId.of(id));
      if (classe === null) return [];
      return this.logDocs
        .findByClasse(classe)
        .filter((l) => l.tipo === TIPO_PIANO_PERS)
        .map((l) => {
          const email = l.getUtenti()[0] ?? '';
          const alunno = email !== '' ? this.alunni.findById(email) : null;
          return {
            id: l.id ?? undefined,
            nome: l.nome,
            link: l.getLink(),
            tipo: l.tipo,
            sottotipo: l.getSottotipo(),
            idGen: l.idGen,
            stato: l.getStato(),
            dataCreazione: l.getDataCreazione(),
            notificato: l.isNotificato(),
            studente: { nomeCompleto: alunno?.cognomeNome ?? '', email }
          };
        });
    });
    if (cdu.focus.classe.didattica === undefined) {
      cdu.focus.classe.didattica = { pianiPersonalizzati: { items } };
    } else {
      cdu.focus.classe.didattica.pianiPersonalizzati = { items };
    }
  }
}
