import type { IClasseRepository } from '../../domain/repositories/IClasseRepository';
import type { IAlunnoRepository } from '../../domain/repositories/IAlunnoRepository';
import type { IDipartimentoRepository } from '../../domain/repositories/IDipartimentoRepository';
import type { Classe } from '../../domain/entities/Classe';
import type { ITeachingAssignmentResolver } from '../ports/ITeachingAssignmentResolver';
import type { GestioneArticolazione, TipoPiano } from '../../domain/value-objects/enums';

/**
 * Batch target enumeration per iteration axis (CONF_DOC.GENERATORE /
 * CONF_AZIONI.ASSE). Pure functions over repositories: DocumentBatchService
 * calls them to freeze its target snapshot at the first run, ActionBatchService
 * calls the same ones — the two axes share a dictionary, so they must share
 * the enumeration or they drift.
 */

export interface PianoBatchTarget {
  studente: string;
  tipo: TipoPiano;
}

export interface DocenteClasseMateriaBatchTarget {
  classe: string;
  docenteEmail: string;
  materiaId: string;
}

export interface ClasseMateriaBatchTarget {
  classe: string;
  materiaId: string;
}

export interface ClasseDocenteBatchTarget {
  classe: string;
  docenteEmail: string;
}

export interface DocenteBatchTarget {
  docenteEmail: string;
  classiCompetenza: string[];
}

export interface AlunnoBatchTarget {
  email: string;
}

/**
 * Role-resolved (SUPPLENZE -> VARIAZIONI_CATTEDRA -> CLASSI) council of every
 * active class. `includeReligioneAlt: true` mirrors resolveCouncilForProjection
 * — without it a teacher holding only IRC/attività alternativa is never
 * enumerated. No routingPolicy: it only affects TeachingAssignment.routing,
 * never `docenteEffettivo`/`slot`, the two fields these enumerations read.
 *
 * materiaId is specifica-qualified (BASE.SPECIFICA) when the slot has a
 * specifica — mirroring SheetMaterieGeneratorStrategy.catalogId(). A docente
 * teaching two specifics of the same family (e.g. INTERPRET.CHITARRA and
 * INTERPRET.FLAUTO) gets two separate targets, one per composite id. Slots
 * differing only by *kind* (STANDARD vs ITP on the same materiaId) still
 * collapse to one target here by design — extending the batch axis to carry
 * kind is out of scope; the dedup in the per-axis functions below keeps the
 * first match, mirroring DocenteClasseMateriaFocusProvider's own first-match
 * `materie.find` semantics.
 */
function perClasseConCattedre(
  classi: IClasseRepository,
  teachingAssignments: ITeachingAssignmentResolver,
  now: Date,
  gestione: GestioneArticolazione
): Array<{ classeId: string; docenteEmail: string; materiaId: string }> {
  const out: Array<{ classeId: string; docenteEmail: string; materiaId: string }> = [];
  for (const classe of targetsClasse(classi, gestione)) {
    for (const assignment of teachingAssignments.resolveConsiglio(classe, now, {
      includeReligioneAlt: true
    })) {
      out.push({
        classeId: classe.id ?? '',
        docenteEmail: assignment.docenteEffettivo.email.value,
        // specifica-qualified (BASE.SPECIFICA), mirroring SheetMaterieGeneratorStrategy.catalogId()
        materiaId:
          assignment.slot.specifica === null
            ? assignment.slot.materia.value
            : `${assignment.slot.materia.value}.${assignment.slot.specifica}`
      });
    }
  }
  return out;
}

export function targetsClasse(classi: IClasseRepository, gestione: GestioneArticolazione): Classe[] {
  return classi.filterPerGestioneArticolazione(classi.findAttive(), gestione);
}

export function targetsPiani(alunni: IAlunnoRepository): PianoBatchTarget[] {
  const targets: PianoBatchTarget[] = [];
  for (const alunno of alunni.findAttivi()) {
    for (const piano of alunni.getPiani(alunno)) {
      targets.push({ studente: alunno.email.value, tipo: piano.tipo });
    }
  }
  return targets;
}

export function targetsAlunni(alunni: IAlunnoRepository): AlunnoBatchTarget[] {
  return alunni.findAttivi().map((alunno) => ({ email: alunno.email.value }));
}

export function targetsDipartimenti(dipartimenti: IDipartimentoRepository): string[] {
  return dipartimenti.findAll().map((dipartimento) => dipartimento.id ?? '?');
}

export function targetsClasseDocenteMateria(
  classi: IClasseRepository,
  teachingAssignments: ITeachingAssignmentResolver,
  now: Date,
  gestione: GestioneArticolazione
): DocenteClasseMateriaBatchTarget[] {
  const seen = new Set<string>();
  const targets: DocenteClasseMateriaBatchTarget[] = [];
  for (const { classeId, docenteEmail, materiaId } of perClasseConCattedre(classi, teachingAssignments, now, gestione)) {
    const key = `${classeId}:${materiaId}:${docenteEmail}`;
    if (seen.has(key)) continue;
    seen.add(key);
    targets.push({ classe: classeId, docenteEmail, materiaId });
  }
  return targets;
}

export function targetsClasseMateria(
  classi: IClasseRepository,
  teachingAssignments: ITeachingAssignmentResolver,
  now: Date,
  gestione: GestioneArticolazione
): ClasseMateriaBatchTarget[] {
  const seen = new Set<string>();
  const targets: ClasseMateriaBatchTarget[] = [];
  for (const { classeId, materiaId } of perClasseConCattedre(classi, teachingAssignments, now, gestione)) {
    const key = `${classeId}:${materiaId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    targets.push({ classe: classeId, materiaId });
  }
  return targets;
}

export function targetsClasseDocente(
  classi: IClasseRepository,
  teachingAssignments: ITeachingAssignmentResolver,
  now: Date,
  gestione: GestioneArticolazione
): ClasseDocenteBatchTarget[] {
  const seen = new Set<string>();
  const targets: ClasseDocenteBatchTarget[] = [];
  for (const { classeId, docenteEmail } of perClasseConCattedre(classi, teachingAssignments, now, gestione)) {
    const key = `${classeId}:${docenteEmail}`;
    if (seen.has(key)) continue;
    seen.add(key);
    targets.push({ classe: classeId, docenteEmail });
  }
  return targets;
}

export function targetsDocenti(
  classi: IClasseRepository,
  teachingAssignments: ITeachingAssignmentResolver,
  now: Date,
  gestione: GestioneArticolazione
): DocenteBatchTarget[] {
  const classiPerDocente = new Map<string, Set<string>>();
  for (const { classeId, docenteEmail } of perClasseConCattedre(classi, teachingAssignments, now, gestione)) {
    const acc = classiPerDocente.get(docenteEmail) ?? new Set<string>();
    acc.add(classeId);
    classiPerDocente.set(docenteEmail, acc);
  }
  return [...classiPerDocente.entries()].map(([docenteEmail, classi2]) => ({
    docenteEmail,
    classiCompetenza: [...classi2]
  }));
}
