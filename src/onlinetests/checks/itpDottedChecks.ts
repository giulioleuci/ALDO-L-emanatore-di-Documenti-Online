import type { ContextBuilder } from '../../application/context-engine/ContextBuilder';
import { getCduMateriaAssignmentIdentity } from '../../application/context-engine/CduInternalMetadata';
import { recipe } from '../../application/context-engine/Recipe';
import type { DocumentBatchService } from '../../application/services/DocumentBatchService';
import type { DocumentGenerationService } from '../../application/services/DocumentGenerationService';
import type { ITeachingAssignmentResolver } from '../../application/ports/ITeachingAssignmentResolver';
import type { ServiceContainer } from '../../config/ServiceContainer';
import { COL_CONF_DOC, COL_LOG_DOCS, TABLE } from '../../config/schema';
import { ValidationError } from '../../domain/errors/DomainError';
import { ClasseId } from '../../domain/value-objects/ClasseId';
import { MateriaId } from '../../domain/value-objects/MateriaId';
import { MateriaSpecificaId } from '../../domain/value-objects/MateriaSpecificaId';
import { GestioneSupplenti } from '../../domain/value-objects/enums';
import type { IDriveFacade } from '../../infrastructure/facades/DriveServiceFacade';
import type { ClasseRepository } from '../../infrastructure/repositories/ClasseRepository';
import type { MateriaRepository } from '../../infrastructure/repositories/MateriaRepository';
import type { SharedTestDatabase } from '../data/SharedTestDatabaseBuilder';
import {
  CONF_DOC_DOCENTE_MATERIA,
  e2eAlunnoEmail,
  e2eDocenteEmail
} from '../data/SharedTestDatabaseBuilder';
import { CONF_DOC_DOTTED } from '../data/fixtures';
import { groupName, type TestRunner } from '../report/OnlineTestReport';

interface TableDatabase {
  table(name: string): { findAll(): Array<Record<string, unknown>> };
}

const FOCAL_CLASS = '4A';
const DOTTED_ID = 'INTERPRET.CHITARRA';
const DOTTED_ITP = e2eDocenteEmail(11);
const CHECK_DATE = new Date('2026-07-15T09:00:00Z');

function classCdu(contextBuilder: ContextBuilder, target: string, now = CHECK_DATE) {
  return contextBuilder.build(
    { target, tipoTarget: 'classe', now },
    recipe('CLASSE_COMPLETA', {
      includiStorico: true,
      profonditaAnniStorico: 2,
      includiSupplenti: true,
      includiPartnerDettaglio: true,
      gestioneSupplenti: GestioneSupplenti.ENTRAMBI
    })
  );
}

function catalogId(slot: { materia: MateriaId; specifica: string | null }): string {
  return slot.specifica === null ? slot.materia.value : `${slot.materia.value}.${slot.specifica}`;
}

function countOccurrences(value: string, fragment: string): number {
  return value.split(fragment).length - 1;
}

function stringCell(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function requireClass(classi: ClasseRepository, id: string) {
  const classe = classi.findById(ClasseId.of(id));
  if (classe === null) throw new ValidationError(`Classe ${id} non trovata`);
  return classe;
}

/** Real shared-data checks for dotted materia identity and per-specifica ITP ownership. */
export function registerItpDottedChecks(
  runner: TestRunner,
  container: ServiceContainer,
  sample: SharedTestDatabase
): void {
  if (!sample.masterTestMode) {
    runner.add(
      groupName('itpDotted', 'MASTER.TEST_MODE guard'),
      sample.sampleSpreadsheetUrl,
      () => {
        throw new ValidationError('ITP/dotted checks refuse to run outside MASTER.TEST_MODE.');
      }
    );
    return;
  }

  runner.add(
    groupName('itpDotted', 'getITPPerMateria specifica'),
    sample.sampleSpreadsheetUrl,
    () => {
      const classi = container.get<ClasseRepository>('classi');
      const classe = requireClass(classi, FOCAL_CLASS);
      const itp = classi.getITPPerMateria(classe, MateriaSpecificaId.of(DOTTED_ID));
      const ids = itp.map((docente) => docente.id ?? '');
      if (ids.length !== 1 || ids[0] !== DOTTED_ITP || !itp[0]!.isITP()) {
        throw new ValidationError(
          `${FOCAL_CLASS}/${DOTTED_ID}: atteso solo ITP ${DOTTED_ITP}, ricevuti ${ids.join(', ')}`
        );
      }
    }
  );

  runner.add(
    groupName('itpDotted', 'identita assegnazioni, ruoli e ownership'),
    sample.sampleSpreadsheetUrl,
    () => {
      const classi = container.get<ClasseRepository>('classi');
      const classe = requireClass(classi, FOCAL_CLASS);
      const slots = classi.getTeachingSlots(classe);
      const chitarraMain = slots.find((slot) => slot.column === DOTTED_ID);
      const chitarraItp = slots.find((slot) => slot.column === `${DOTTED_ID}.itp`);
      const base = slots.find((slot) => slot.column === 'GRECO');
      if (
        chitarraMain?.kind !== 'SPECIFICA' ||
        chitarraMain.specifica !== 'CHITARRA' ||
        chitarraMain.actorEmails[0] !== e2eDocenteEmail(5) ||
        chitarraItp?.kind !== 'ITP' ||
        chitarraItp.specifica !== 'CHITARRA' ||
        chitarraItp.actorEmails[0] !== DOTTED_ITP ||
        base === undefined
      ) {
        throw new ValidationError('Ownership colonne MAIN/SPECIFICA/ITP dotted non distinta.');
      }

      const batch = container.get<DocumentBatchService>('documentBatchService');
      const handler = batch.batchGenerateHandler({
        confDocId: CONF_DOC_DOCENTE_MATERIA,
        jobId: 'E2E_ITP_DOTTED_BATCH'
      });
      let next = handler.next();
      while (!next.done) next = handler.next();
      const baseTeacher = base.actorEmails[0]!;
      const rows = container
        .get<TableDatabase>('db')
        .table(TABLE.LOG_DOCS)
        .findAll()
        .filter(
          (row) =>
            row[COL_LOG_DOCS.ID_GEN] === CONF_DOC_DOCENTE_MATERIA &&
            row[COL_LOG_DOCS.CLASSI] === FOCAL_CLASS
        );
      const subtypes = new Set(rows.map((row) => stringCell(row[COL_LOG_DOCS.SOTTOTIPO])));
      if (
        !subtypes.has(`GRECO::${baseTeacher}`) ||
        !subtypes.has(`${DOTTED_ID}::${e2eDocenteEmail(5)}`)
      ) {
        throw new ValidationError(
          `SOTTOTIPO base/dotted non distinto: ${[...subtypes].sort().join(', ')}`
        );
      }
    }
  );

  runner.add(
    groupName('itpDotted', 'nomi sintetizzati ed espliciti'),
    sample.sampleSpreadsheetUrl,
    () => {
      const materie = container.get<MateriaRepository>('materie');
      const expected: Record<string, { nome: string; sintesi: string }> = {
        'LAB.GRUPPO_A': { nome: 'Laboratorio (Gruppo A)', sintesi: 'Lab. Gruppo A' },
        'LAB.SEMINARIO_POMERIDIANO': {
          nome: 'Laboratorio (Seminario pomeridiano)',
          sintesi: 'Lab. Seminario'
        },
        [DOTTED_ID]: {
          nome: 'Interpretazione ed esecuzione (Chitarra)',
          sintesi: 'Interpretazione (Chitarra)'
        },
        'INTERPRET.FLAUTO': {
          nome: 'Interpretazione ed esecuzione — indirizzo flauto',
          sintesi: 'Interpretazione (Flauto)'
        }
      };
      for (const [id, wanted] of Object.entries(expected)) {
        const materia = materie.findById(id);
        if (
          materia === null ||
          materia.nome !== wanted.nome ||
          materia.sintesi !== wanted.sintesi
        ) {
          throw new ValidationError(
            `Nome materia ${id} non coerente: ${materia?.nome ?? 'assente'} / ${materia?.sintesi ?? 'assente'}`
          );
        }
      }
    }
  );

  runner.add(
    groupName('itpDotted', 'CDU materia e tuple docenti'),
    sample.sampleSpreadsheetUrl,
    () => {
      const contextBuilder = container.get<ContextBuilder>('contextBuilder');
      const classe = classCdu(contextBuilder, FOCAL_CLASS).focus.classe;
      const chitarra = classe?.materie?.find((materia) => materia.sigla === DOTTED_ID);
      const classTuples = (classe?.consiglioDiClasse ?? []).flatMap((docente) =>
        docente.materie
          .filter((materia) => materia.sigla === DOTTED_ID)
          .map((materia) => ({
            email: docente.anagrafica.email,
            isITP: materia.isITP,
            identity: getCduMateriaAssignmentIdentity(materia)
          }))
      );
      const student = contextBuilder.build(
        { target: e2eAlunnoEmail(4), tipoTarget: 'alunno', now: CHECK_DATE },
        recipe('ALUNNO_COMPLETO', { gestioneSupplenti: GestioneSupplenti.ENTRAMBI })
      );
      const studentChitarra = (student.focus.alunno?.consiglioDiClasseFiltrato ?? []).flatMap(
        (docente) =>
          docente.materie
            .filter((materia) => materia.sigla === DOTTED_ID)
            .map((materia) => `${docente.anagrafica.email}:${materia.isITP ? 'ITP' : 'SPECIFICA'}`)
      );
      const parent = classCdu(contextBuilder, '3C').focus.classe;
      const parentInf = (parent?.consiglioDiClasse ?? []).flatMap((docente) =>
        docente.materie
          .filter((materia) => materia.sigla === 'INF')
          .map((materia) => `${docente.anagrafica.email}:${materia.isITP ? 'ITP' : 'MAIN'}`)
      );

      if (
        chitarra?.principale !== 'Interpretazione ed esecuzione' ||
        chitarra.specificita !== 'Chitarra' ||
        chitarra.nome !== 'Interpretazione ed esecuzione (Chitarra)' ||
        chitarra.hasItp !== true ||
        classTuples.length !== 2 ||
        !classTuples.some(
          (tuple) =>
            tuple.email === e2eDocenteEmail(5) &&
            !tuple.isITP &&
            tuple.identity?.kind === 'SPECIFICA' &&
            tuple.identity.classeId === FOCAL_CLASS
        ) ||
        !classTuples.some(
          (tuple) =>
            tuple.email === DOTTED_ITP &&
            tuple.isITP &&
            tuple.identity?.kind === 'ITP' &&
            tuple.identity.classeId === FOCAL_CLASS
        ) ||
        JSON.stringify(studentChitarra) !== JSON.stringify([`${e2eDocenteEmail(5)}:SPECIFICA`]) ||
        !parentInf.includes(`${e2eDocenteEmail(4)}:MAIN`) ||
        !parentInf.includes(`${e2eDocenteEmail(2)}:ITP`)
      ) {
        throw new ValidationError(
          `CDU dotted/ITP incoerente: classe=${JSON.stringify(classTuples)} studente=${studentChitarra.join(',')} parent=${parentInf.join(',')}`
        );
      }
    }
  );

  runner.add(
    groupName('itpDotted', 'isolamento sostituzione e variazione'),
    sample.sampleSpreadsheetUrl,
    () => {
      const classi = container.get<ClasseRepository>('classi');
      const resolver = container.get<ITeachingAssignmentResolver>('teachingAssignmentResolver');
      const classe = requireClass(classi, '1A');
      const during = resolver.resolveConsiglio(classe, new Date('2026-08-05T09:00:00Z'), {
        includeReligioneAlt: true
      });
      const afterVariation = resolver.resolveConsiglio(classe, new Date('2026-10-20T09:00:00Z'), {
        includeReligioneAlt: true
      });
      const actor = (
        assignments: ReturnType<ITeachingAssignmentResolver['resolveConsiglio']>,
        id: string
      ): string | undefined =>
        assignments.find((assignment) => catalogId(assignment.slot) === id)?.docenteEffettivo.id ??
        undefined;
      const hasBaseLab = during.some(
        (assignment) =>
          assignment.slot.materia.value === 'LAB' && assignment.slot.specifica === null
      );
      if (
        actor(during, 'LAB.SEMINARIO_POMERIDIANO') !== e2eDocenteEmail(18) ||
        actor(during, 'LAB.GRUPPO_A') !== e2eDocenteEmail(3) ||
        actor(during, DOTTED_ID) !== e2eDocenteEmail(5) ||
        actor(afterVariation, 'LAB.SEMINARIO_POMERIDIANO') !== e2eDocenteEmail(20) ||
        actor(afterVariation, 'LAB.GRUPPO_A') !== e2eDocenteEmail(3) ||
        actor(afterVariation, DOTTED_ID) !== e2eDocenteEmail(5) ||
        hasBaseLab
      ) {
        throw new ValidationError('Sostituzione/variazione dotted traslocata a base o sorella.');
      }
    }
  );

  runner.add(
    groupName('itpDotted', 'continuita titolare/ITP e campi assenti'),
    sample.sampleSpreadsheetUrl,
    () => {
      const contextBuilder = container.get<ContextBuilder>('contextBuilder');
      const materie = classCdu(contextBuilder, '3C').focus.classe?.materie ?? [];
      const inf = materie.find((materia) => materia.sigla === 'INF');
      const mat = materie.find((materia) => materia.sigla === 'MAT');
      const continuitaInf = inf?.continuita;
      const continuitaMat = mat?.continuita;
      const infYears = continuitaInf?.docentiAnniPrecedenti ?? [];
      const matHasItpKeys =
        continuitaMat !== undefined &&
        ('continuitaUltimiDueAnniItp' in continuitaMat ||
          'continuitaUltimiTreAnniItp' in continuitaMat ||
          continuitaMat.docentiAnniPrecedenti.some((anno) => 'itp' in anno));
      if (
        inf?.hasItp !== true ||
        continuitaInf?.continuitaUltimiDueAnni !== true ||
        continuitaInf.continuitaUltimiTreAnni !== true ||
        continuitaInf.continuitaUltimiDueAnniItp !== false ||
        continuitaInf.continuitaUltimiTreAnniItp !== false ||
        infYears[0]?.itp?.email !== e2eDocenteEmail(11) ||
        infYears[1]?.itp !== null ||
        mat?.hasItp !== false ||
        matHasItpKeys
      ) {
        throw new ValidationError(
          'Continuita principale/ITP o omissione campi senza ITP incoerente.'
        );
      }
    }
  );

  runner.add(
    groupName('itpDotted', 'CONF_DOC_DOTTED renderizzato'),
    sample.sampleSpreadsheetUrl,
    () => {
      const db = container.get<TableDatabase>('db');
      const config = db
        .table(TABLE.CONF_DOC)
        .findAll()
        .find((row) => row[COL_CONF_DOC.ID] === CONF_DOC_DOTTED);
      if (config?.[COL_CONF_DOC.GENERATORE] !== 'DOCUMENTO_GENERICO') {
        throw new ValidationError(`CONF_DOC ${CONF_DOC_DOTTED} assente o con generatore errato.`);
      }
      const documents = container.get<DocumentGenerationService>('documentGenerationService');
      const generated = documents.generateForClasse(ClasseId.of(FOCAL_CLASS), CONF_DOC_DOTTED);
      const persisted = db
        .table(TABLE.LOG_DOCS)
        .findAll()
        .find(
          (row) =>
            row[COL_LOG_DOCS.ID_GEN] === CONF_DOC_DOTTED && row[COL_LOG_DOCS.CLASSI] === FOCAL_CLASS
        );
      const fileId = generated.fileId ?? stringCell(persisted?.[COL_LOG_DOCS.ID]).trim();
      if (fileId === '') throw new ValidationError('CONF_DOC_DOTTED privo di file persistito.');
      const text = container.get<IDriveFacade>('drive').getFileText(fileId);
      const names = [
        'Laboratorio (Gruppo A)',
        'Laboratorio (Seminario pomeridiano)',
        'Interpretazione ed esecuzione (Chitarra)',
        'Interpretazione ed esecuzione — indirizzo flauto'
      ];
      const cdu = classCdu(container.get<ContextBuilder>('contextBuilder'), FOCAL_CLASS);
      const chitarra = cdu.focus.classe?.materie?.find((materia) => materia.sigla === DOTTED_ID);
      if (
        names.some((name) => countOccurrences(text, name) !== 1) ||
        chitarra?.docentiDescrizione === undefined ||
        !text.includes(chitarra.docentiDescrizione) ||
        !text.includes('ITP presente') ||
        /\{\{[^}]*\}\}/.test(text)
      ) {
        throw new ValidationError(
          'CONF_DOC_DOTTED: nomi, ownership ITP o placeholder renderizzati in modo errato.'
        );
      }
    }
  );
}
