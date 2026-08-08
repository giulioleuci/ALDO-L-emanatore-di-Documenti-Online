import type { ContextProvider } from '../ContextProvider';
import type { Cdu } from '../Cdu';
import type { BuildParams } from '../Recipe';
import type { IDipartimentoRepository } from '../../../domain/repositories/IDipartimentoRepository';
import type { IDocenteRepository } from '../../../domain/repositories/IDocenteRepository';
import type { ILogDocumentoRepository } from '../../../domain/repositories/ILogDocumentoRepository';
import { buildPersonVmFromDocente } from '../mappers/personVmMapper';
import { PipelineError } from '../../../domain/errors/DomainError';

/**
 * Fills `focus.dipartimento` (11 §11 new) — anagrafica, capo, materie and
 * afferent docenti of one DIPART row, plus its LOG_DOCS aggregation. Active
 * in DIPARTIMENTO_COMPLETO, the recipe backing the department-scoped batch
 * generation axis (e.g. "verbale di dipartimento"). A department has no
 * class dimension, so `documenti` is filtered by materia overlap instead of
 * `findByClasse` — mirrors `DocumentiClasseProvider`'s output shape exactly.
 */
export class DipartimentoProvider implements ContextProvider {
  constructor(
    private readonly dipartimenti: IDipartimentoRepository,
    private readonly docenti: IDocenteRepository,
    private readonly logDocs: ILogDocumentoRepository
  ) {}

  provide(cdu: Cdu, params: BuildParams): void {
    const dipartimento = this.dipartimenti.findAll().find((d) => d.id === params.target);
    if (dipartimento === undefined) {
      throw new PipelineError(`Dipartimento ${params.target} non trovato`);
    }

    const capoEmail = dipartimento.getCapoEmail();
    const capoDocente = capoEmail !== null ? this.docenti.findById(capoEmail.value) : null;
    const docentiAfferenti = this.docenti.findByDipartimento(dipartimento.dipartimentoId);
    const materieIds = dipartimento.getMaterieIds().map((m) => m.value);

    const items = this.logDocs
      .findAll()
      .filter((doc) => materieIds.some((m) => doc.containsMateria(m)))
      .map((l) => ({
        id: l.id ?? undefined,
        nome: l.nome,
        link: l.getLink(),
        tipo: l.tipo,
        idGen: l.idGen,
        stato: l.getStato(),
        dataCreazione: l.getDataCreazione()
      }));

    cdu.focus.dipartimento = {
      anagrafica: { id: dipartimento.id ?? '', nome: dipartimento.nome },
      capo: capoDocente !== null ? buildPersonVmFromDocente(capoDocente) : null,
      materie: materieIds.map((sigla) => ({ sigla })),
      docenti: docentiAfferenti.map((d) => buildPersonVmFromDocente(d)),
      didattica: { documenti: { items } }
    };
  }
}
