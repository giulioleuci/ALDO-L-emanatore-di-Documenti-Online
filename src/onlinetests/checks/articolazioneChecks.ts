import type { ServiceContainer } from '../../config/ServiceContainer';
import { COL_CONF_DOC, COL_LOG_DOCS, TABLE } from '../../config/schema';
import { ContextBuilder } from '../../application/context-engine/ContextBuilder';
import { recipe } from '../../application/context-engine/Recipe';
import type { DocumentGenerationService } from '../../application/services/DocumentGenerationService';
import type { EmailNotificationService } from '../../application/services/EmailNotificationService';
import { ConfigurazioneDocumento } from '../../domain/entities/ConfigurazioneDocumento';
import { ValidationError } from '../../domain/errors/DomainError';
import { ClasseId } from '../../domain/value-objects/ClasseId';
import { GestioneSupplenti } from '../../domain/value-objects/enums';
import { ClasseRepository } from '../../infrastructure/repositories/ClasseRepository';
import type { TestRunner } from '../OnlineTestReport';
import {
  CLASSE_A,
  CLASSE_B,
  CLASSE_C,
  CLASSE_C_PARENT,
  CLASSE_C_PARTNER,
  CONF_DOC_ARTICOLATA,
  CONF_DOC_RIEPILOGO,
  CONF_DOC_RIEPILOGO_FIRME_CDC,
  CONF_MAIL_CONDOTTA,
  CONF_MAIL_VERBALE,
  INDIRIZZO_E2E,
  e2eDocenteEmail,
  type E2eSampleDatabase
} from '../E2eSampleDatabaseBuilder';

interface TableDatabase {
  table(name: string): { findAll(): Array<Record<string, unknown>> };
}

const COMPLETA_TARGETS = [CLASSE_A, CLASSE_B, CLASSE_C_PARENT];
const ARTICOLATA_TARGETS = [CLASSE_A, CLASSE_B, CLASSE_C, CLASSE_C_PARTNER];

function ids(values: Iterable<string>): string[] {
  return [...values].sort();
}

function assertSameTargets(label: string, actual: Iterable<string>, expected: string[]): void {
  const normalized = ids(actual);
  const wanted = ids(expected);
  if (JSON.stringify(normalized) !== JSON.stringify(wanted)) {
    throw new ValidationError(
      `${label}: attesi ${wanted.join(', ')}, ricevuti ${normalized.join(', ')}`
    );
  }
}

function classCdu(contextBuilder: ContextBuilder, target: string, now = new Date('2026-07-15')) {
  return contextBuilder.build(
    { target, tipoTarget: 'classe', now },
    recipe('CLASSE_COMPLETA', {
      includiSupplenti: true,
      includiSpecificita: true,
      gestioneSupplenti: GestioneSupplenti.ENTRAMBI
    })
  );
}

function documentConfig(db: TableDatabase, id: string): ConfigurazioneDocumento {
  const row = db
    .table(TABLE.CONF_DOC)
    .findAll()
    .find((candidate) => candidate[COL_CONF_DOC.ID] === id);
  if (row === undefined) {
    throw new ValidationError(`Configurazione documento ${id} non trovata`);
  }
  return ConfigurazioneDocumento.fromData(row);
}

/**
 * Read-only online assertions for the articulated CDU fixture.  Target selection stays in
 * ClasseRepository; this module only observes its outcome and the production services that
 * consume it.
 */
export function registerArticolazioneChecks(
  runner: TestRunner,
  container: ServiceContainer,
  sample: E2eSampleDatabase & { testMode: boolean }
): void {
  if (!sample.testMode) {
    runner.add('Articolazione CDU: MASTER.TEST_MODE guard', sample.sampleSpreadsheetUrl, () => {
      throw new ValidationError(
        'Articolazione CDU checks refuse to run: sample MASTER.TEST_MODE is not true.'
      );
    });
    return;
  }

  runner.add(
    'Articolazione CDU: supplenza, titolare finale e confini data',
    sample.sampleSpreadsheetUrl,
    () => {
      const contextBuilder = container.get<ContextBuilder>('contextBuilder');
      const duringSubstitution = classCdu(contextBuilder, CLASSE_A, new Date('2026-08-05'));
      const afterSubstitution = classCdu(contextBuilder, CLASSE_A, new Date('2026-08-11'));
      const current = duringSubstitution.focus.classe?.consiglioDiClasse ?? [];
      const after = afterSubstitution.focus.classe?.consiglioDiClasse ?? [];
      const seminar = current.find((docente) => docente.anagrafica.email === e2eDocenteEmail(18));
      const original = after.find((docente) => docente.anagrafica.email === e2eDocenteEmail(4));
      const finalHolder = current.find(
        (docente) => docente.anagrafica.email === e2eDocenteEmail(16)
      );

      if (
        seminar === undefined ||
        !seminar.materie.some(
          (materia) => materia.sigla === 'LAB' && materia.specificita === 'SEMINARIO_POMERIDIANO'
        ) ||
        original === undefined ||
        !original.materie.some(
          (materia) => materia.sigla === 'LAB' && materia.specificita === 'SEMINARIO_POMERIDIANO'
        ) ||
        finalHolder === undefined
      ) {
        throw new ValidationError(
          'Risoluzione CDU articolazione: attesi supplente LAB.SEMINARIO_POMERIDIANO, titolare dopo il confine e titolare finale ITA.'
        );
      }
    }
  );

  runner.add(
    'Articolazione CDU: serializzabilita, CdC unico, materie e indirizzo',
    sample.sampleSpreadsheetUrl,
    () => {
      const contextBuilder = container.get<ContextBuilder>('contextBuilder');
      const cdu = classCdu(contextBuilder, CLASSE_C_PARENT);
      const classe = cdu.focus.classe;
      const council = classe?.consiglioDiClasse ?? [];
      const emails = council.map((docente) => docente.anagrafica.email);

      if (
        JSON.stringify(cdu) === '' ||
        new Set(emails).size !== emails.length ||
        council.some((docente) => docente.materieDescrizione.trim() === '') ||
        classe?.anagrafica.indirizzo.sigla !== INDIRIZZO_E2E ||
        classe.anagrafica.indirizzo.nomeSintetico !== 'SCI'
      ) {
        throw new ValidationError(
          'CDU articolazione non serializzabile o con CdC/descrizioni materie/indirizzo incoerenti.'
        );
      }
    }
  );

  runner.add(
    'Articolazione CDU: round trip partner-parent e split comune/separato',
    sample.sampleSpreadsheetUrl,
    () => {
      const classi = container.get<ClasseRepository>('classi');
      const contextBuilder = container.get<ContextBuilder>('contextBuilder');
      const parent = classi.findById(ClasseId.of(CLASSE_C_PARENT));
      if (parent === null)
        throw new ValidationError(`Classe parent ${CLASSE_C_PARENT} non trovata`);

      const partners = classi.getClassiPartner(parent).map((classe) => classe.id ?? '');
      const parentIds = partners.map((partnerId) => {
        const partner = classi.findById(ClasseId.of(partnerId));
        return partner === null ? null : (classi.getClasseParent(partner)?.id ?? null);
      });
      const cdu = classCdu(contextBuilder, CLASSE_C_PARENT);
      const articolazione = cdu.focus.classe?.articolazione;

      if (
        JSON.stringify(partners) !== JSON.stringify([CLASSE_C, CLASSE_C_PARTNER]) ||
        parentIds.some((id) => id !== CLASSE_C_PARENT) ||
        articolazione === undefined ||
        JSON.stringify(articolazione.partners) !== JSON.stringify([CLASSE_C, CLASSE_C_PARTNER]) ||
        !articolazione.materieCondivise.includes('MAT') ||
        !articolazione.materieSeparatePrimoGruppo.includes('ITA') ||
        !articolazione.materieSeparateSecondoGruppo.includes('ITA')
      ) {
        throw new ValidationError(
          'Round trip partner-parent o split comune/separato della CDU non valido.'
        );
      }
    }
  );

  runner.add(
    'Articolazione CDU: target documenti COMPLETA e ARTICOLATA',
    sample.sampleSpreadsheetUrl,
    () => {
      const classi = container.get<ClasseRepository>('classi');
      const db = container.get<TableDatabase>('db');
      const active = classi.findAttive();
      const completa = documentConfig(db, CONF_DOC_RIEPILOGO);
      const articolata = documentConfig(db, CONF_DOC_ARTICOLATA);
      assertSameTargets(
        'CONF_DOC COMPLETA',
        classi
          .filterPerGestioneArticolazione(active, completa.gestioneArticolazione)
          .map((classe) => classe.id ?? ''),
        COMPLETA_TARGETS
      );
      assertSameTargets(
        'CONF_DOC ARTICOLATA',
        classi
          .filterPerGestioneArticolazione(active, articolata.gestioneArticolazione)
          .map((classe) => classe.id ?? ''),
        ARTICOLATA_TARGETS
      );
    }
  );

  runner.add(
    'Articolazione CDU: target mail COMPLETA e ARTICOLATA',
    sample.sampleSpreadsheetUrl,
    () => {
      const email = container.get<EmailNotificationService>('emailNotificationService');
      const completa = email.enumerateTargets(email.getConfigurazione(CONF_MAIL_CONDOTTA));
      const articolata = email.enumerateTargets(email.getConfigurazione(CONF_MAIL_VERBALE));
      assertSameTargets(
        'CONF_MAIL COMPLETA',
        completa.map((target) => target.target),
        COMPLETA_TARGETS
      );
      assertSameTargets(
        'CONF_MAIL ARTICOLATA',
        articolata.flatMap((target) => target.classiCompetenza),
        ARTICOLATA_TARGETS
      );
    }
  );

  runner.add(
    'Articolazione CDU: documento CDC include partner ed esclude parent',
    sample.sampleSpreadsheetUrl,
    () => {
      const db = container.get<TableDatabase>('db');
      const documents = container.get<DocumentGenerationService>('documentGenerationService');
      for (const classe of [CLASSE_C, CLASSE_C_PARTNER]) {
        const result = documents.generateForClasse(
          ClasseId.of(classe),
          CONF_DOC_RIEPILOGO_FIRME_CDC
        );
        if (result.fileId === null) {
          throw new ValidationError(
            `Documento CDC per ${classe} non generato (status=${result.status})`
          );
        }
      }
      const generated = db
        .table(TABLE.LOG_DOCS)
        .findAll()
        .filter((row) => row[COL_LOG_DOCS.ID_GEN] === CONF_DOC_RIEPILOGO_FIRME_CDC)
        .map((row) => {
          const classe = row[COL_LOG_DOCS.CLASSI];
          return typeof classe === 'string' ? classe : '';
        });
      assertSameTargets('LOG_DOCS CDC ARTICOLATA', generated, [CLASSE_C, CLASSE_C_PARTNER]);
    }
  );

  runner.add('Articolazione CDU: specifica nel repeater', sample.sampleSpreadsheetUrl, () => {
    const contextBuilder = container.get<ContextBuilder>('contextBuilder');
    const cdu = classCdu(contextBuilder, CLASSE_A, new Date('2026-08-05'));
    const seminar = (cdu.focus.classe?.consiglioDiClasse ?? []).find(
      (docente) => docente.anagrafica.email === e2eDocenteEmail(18)
    );
    const hasSpecifica =
      seminar?.materie.some(
        (materia) => materia.sigla === 'LAB' && materia.specificita === 'SEMINARIO_POMERIDIANO'
      ) ?? false;
    if (!hasSpecifica) {
      throw new ValidationError('Il repeater CDU ha perso la specifica LAB.SEMINARIO_POMERIDIANO.');
    }
  });
}
