import type { ContextProvider } from '../ContextProvider';
import type { Cdu } from '../Cdu';
import type { BuildParams } from '../Recipe';
import type { IDipartimentoRepository } from '../../../domain/repositories/IDipartimentoRepository';
import type { IDocenteRepository } from '../../../domain/repositories/IDocenteRepository';
import type { IMateriaRepository } from '../../../domain/repositories/IMateriaRepository';
import type { ILogDocumentoRepository } from '../../../domain/repositories/ILogDocumentoRepository';
import type { Materia } from '../../../domain/entities/Materia';
import { MateriaId } from '../../../domain/value-objects/MateriaId';
import { buildPersonaVm, descriviPersone } from '../mappers/personVmMapper';
import { buildMateriaVm } from '../mappers/subjectVmMapper';
import { buildDocumentoLogVm } from '../mappers/documentoVmMapper';
import { elencoVm } from '../mappers/elencoVm';
import { PipelineError } from '../../../domain/errors/DomainError';

/**
 * Fills `focus.dipartimento` (11 §11 new) — anagrafica, capo, materie and
 * afferent docenti of one DIPART row, plus its LOG_DOCS aggregation. Active
 * in DIPARTIMENTO_COMPLETO, the recipe backing the department-scoped batch
 * generation axis (e.g. "verbale di dipartimento"). A department has no
 * class dimension, so `documenti` is filtered by materia overlap instead of
 * `findByClasse`, mirroring `DocumentiClasseProvider`'s output shape.
 *
 * `documenti.storico` has no data source: `StoricoDocumentiService` is built
 * around a per-student `LOG_DOCS.UTENTI` lookup (ref `StoricoDocumentiService.
 * perAlunnoConTipo`) and there is no per-materia historical index to reuse —
 * inventing a new historical-scan capability is out of this task's scope
 * (GasLibraryFactory-first: reuse only), so it always resolves empty.
 */
export class DipartimentoProvider implements ContextProvider {
  constructor(
    private readonly dipartimenti: IDipartimentoRepository,
    private readonly docenti: IDocenteRepository,
    private readonly materie: IMateriaRepository,
    private readonly logDocs: ILogDocumentoRepository
  ) {}

  provide(cdu: Cdu, params: BuildParams): void {
    const dipartimento = this.dipartimenti.findAll().find((d) => d.id === params.target);
    if (dipartimento === undefined) {
      throw new PipelineError(`Dipartimento ${params.target} non trovato`);
    }

    const capoEmail = dipartimento.getCapoEmail();
    const capoDocente = capoEmail !== null ? this.docenti.findById(capoEmail.value) : null;
    const capo =
      capoDocente === null
        ? null
        : buildPersonaVm({
            nome: capoDocente.nome,
            cognome: capoDocente.cognome,
            email: capoDocente.id,
            genere: capoDocente.genere,
            isEsterno: false
          });

    const docenti = this.docenti
      .findByDipartimento(dipartimento.dipartimentoId)
      .map((d) =>
        buildPersonaVm({
          nome: d.nome,
          cognome: d.cognome,
          email: d.id,
          genere: d.genere,
          isEsterno: false
        })
      )
      .sort((a, b) => a.nomeCompleto.localeCompare(b.nomeCompleto));

    const materieIds = dipartimento.getMaterieIds().map((m) => m.value);
    const materie = materieIds
      .map((sigla) => this.materie.findByIdCached(MateriaId.of(sigla)))
      .filter((m): m is Materia => m !== null)
      .map((m) => buildMateriaVm(m, 'BASE', {}))
      .sort((a, b) => a.nome.localeCompare(b.nome));

    const documenti = this.logDocs
      .findAll()
      .filter((doc) => materieIds.some((m) => doc.containsMateria(m)))
      .map(buildDocumentoLogVm);

    cdu.focus.dipartimento = {
      id: dipartimento.id ?? '',
      nome: dipartimento.nome,
      capo,
      hasCapo: capo !== null,
      materie,
      hasMaterie: materie.length > 0,
      numeroMaterie: materie.length,
      materieDescrizione: materie.map((m) => m.nome).join(', '),
      materieDescrizioneSintesi: materie.map((m) => m.nomeSintetico).join(', '),
      materieSigle: materie.map((m) => m.sigla).join(', '),
      docenti,
      hasDocenti: docenti.length > 0,
      numeroDocenti: docenti.length,
      docentiDescrizione: descriviPersone(docenti),
      documenti: {
        ...elencoVm(documenti),
        storico: new LazyRef(() => [])
      }
    };
  }
}
