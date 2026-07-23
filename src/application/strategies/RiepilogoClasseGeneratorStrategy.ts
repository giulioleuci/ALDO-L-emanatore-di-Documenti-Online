import type { GeneratorStrategy } from './GeneratorStrategy';
import type { Cdu, DocenteCdcVM, AlunnoContestoVM } from '../context-engine/Cdu';
import type { ITemplateEngine } from '../../infrastructure/facades/TemplateEngineFacade';
import type { IDocumentTableFacade } from '../../infrastructure/facades/DocumentTableFacade';
import { ReligioneScelta } from '../../domain/value-objects/enums';

const MARKER_TABELLA_ALUNNI = '{{TABELLA_ALUNNI}}';

function religioneLabel(scelta: string): string {
  switch (scelta) {
    case ReligioneScelta.NO:
      return 'No';
    case ReligioneScelta.ALT:
      return 'Alternativa';
    default:
      return 'Sì';
  }
}

function buildRosterRows(studenti: AlunnoContestoVM[]): string[][] {
  const header = ['Nome', 'Religione', 'Email', 'Piani'];
  const rows = studenti.map((s) => [
    s.anagrafica.nomeCompleto,
    religioneLabel(s.status.religione),
    s.anagrafica.email,
    s.didattica.piani.items.map((p) => p.tipo).join(', ') || '—'
  ]);
  return [header, ...rows];
}

function buildMaterieDocenti(
  consiglio: DocenteCdcVM[]
): Array<{ nomeMateria: string; nomeDocente: string }> {
  return consiglio.flatMap((docente) =>
    docente.materie.map((materia) => ({
      nomeMateria: materia.nome,
      nomeDocente: `${docente.anagrafica.nome} ${docente.anagrafica.cognome}`
    }))
  );
}

function buildDocentiSenzaTutoraggio(consiglio: DocenteCdcVM[]): Array<{ nomeDocente: string }> {
  return consiglio
    .filter((docente) => !docente.ruoli.isTutorAsl)
    .map((docente) => ({ nomeDocente: `${docente.anagrafica.nome} ${docente.anagrafica.cognome}` }));
}

/**
 * RIEPILOGO_CLASSE generator (item 4): every field this document needs already
 * exists in the CLASSE_COMPLETA CDU (SPECS_ALDO/02_CDU_STRUTTURA.md §4.1) —
 * subjects+teacher, student roster, totals, no-ASL-tutoring teachers, and
 * both representative lists. Only the student table (needs a 2D array) and
 * the (docente, materia) bullet source (consiglioDiClasse groups per docente,
 * not per materia) aren't directly renderable by the generic `{{path}}`/
 * `{{#bullet_list:...}}` tags, so this strategy projects them onto a
 * document-scoped context object (never written back onto the shared `Cdu`)
 * before delegating to the same `templates.processDocument` call
 * `DocumentoGenericoGeneratorStrategy` makes for everything else.
 */
export class RiepilogoClasseGeneratorStrategy implements GeneratorStrategy {
  constructor(
    private readonly templates: ITemplateEngine,
    private readonly tables: IDocumentTableFacade
  ) {}

  render(fileId: string, cdu: Cdu): void {
    const studenti = cdu.focus.classe?.studenti?.listaCompleta ?? [];
    const consiglio = cdu.focus.classe?.consiglioDiClasse ?? [];

    this.tables.insertTableAtMarker(fileId, MARKER_TABELLA_ALUNNI, buildRosterRows(studenti), {
      headerRow: true
    });
    this.tables.removeText(fileId, MARKER_TABELLA_ALUNNI);

    const context = {
      ...(cdu as unknown as Record<string, unknown>),
      riepilogoMaterieDocenti: buildMaterieDocenti(consiglio),
      riepilogoDocentiSenzaTutoraggio: buildDocentiSenzaTutoraggio(consiglio)
    };
    this.templates.processDocument(fileId, context);
  }
}
