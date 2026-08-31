import type { ServiceContainer } from '../../config/ServiceContainer';
import type { ContextBuilder } from '../../application/context-engine/ContextBuilder';
import { recipe } from '../../application/context-engine/Recipe';
import type { Cdu } from '../../application/context-engine/Cdu';
import { ValidationError } from '../../domain/errors/DomainError';
import { GestioneSupplenti } from '../../domain/value-objects/enums';
import { ConfigurazioneDocumento } from '../../domain/entities/ConfigurazioneDocumento';
import { ApplyPermissionsStep } from '../../application/pipelines/documentSteps';
import { ExpressionEngineFacade } from '../../infrastructure/facades/ExpressionEngineFacade';
import {
  SheetMaterieConPermessiGeneratorStrategy,
  protectionGestioneSupplenti
} from '../../application/strategies/SheetMaterieConPermessiGeneratorStrategy';
import { MateriaRepository } from '../../infrastructure/repositories/MateriaRepository';
import type { IDriveFacade } from '../../infrastructure/facades/DriveServiceFacade';
import type { ITemplateEngine } from '../../infrastructure/facades/TemplateEngineFacade';
import type { RisolutoreRuoliService } from '../../application/services/RisolutoreRuoliService';
import type { TestRunner } from '../report/OnlineTestReport';
import {
  SUPPLENZA_FINE,
  SUPPLENZA_INIZIO,
  e2eDocenteEmail
} from '../data/SharedTestDatabaseBuilder';
import type { SharedTestDatabase } from '../data/SharedTestDatabaseBuilder';

export interface ConsumerVisibilitySnapshot {
  cdu: string[];
  recipients: string[];
  documentAcl: string[];
  folderAcl: string[];
  protectedRangeEditors: string[];
}

const CHANNELS: Array<keyof ConsumerVisibilitySnapshot> = [
  'cdu',
  'recipients',
  'documentAcl',
  'folderAcl',
  'protectedRangeEditors'
];

function normalized(values: string[]): string[] {
  return [...values].sort();
}

export function assertActorVisibility(
  label: string,
  actual: ConsumerVisibilitySnapshot,
  principal: string,
  substitute: string,
  mode: GestioneSupplenti
): void {
  const expected =
    principal === substitute
      ? [principal]
      : mode === GestioneSupplenti.SOLO_TITOLARI
        ? [principal]
        : mode === GestioneSupplenti.SOLO_SUPPLENTI
          ? [substitute]
          : [principal, substitute];
  const focal = new Set([principal, substitute]);
  for (const channel of CHANNELS) {
    const values = actual[channel];
    if (new Set(values).size !== values.length) {
      throw new ValidationError(`${label}: ${channel} contiene actor duplicati: ${values.join(',')}`);
    }
    const visible = normalized(values.filter((email) => focal.has(email)));
    if (JSON.stringify(visible) !== JSON.stringify(normalized(expected))) {
      throw new ValidationError(
        `${label}: ${channel} atteso=${normalized(expected).join(',')} reale=${visible.join(',')}`
      );
    }
  }
}

function classCdu(
  builder: ContextBuilder,
  classeId: string,
  now: Date,
  mode: GestioneSupplenti
): Cdu {
  return builder.build(
    { target: classeId, tipoTarget: 'classe', now, configurazioneId: 'ONLINE_CHECK', esecuzioneId: 'ONLINE_CHECK', tipoOperazione: 'GENERAZIONE_DOCUMENTO' },
    recipe('CLASSE_COMPLETA', { gestioneSupplenti: mode })
  );
}

function subjectActors(cdu: Cdu, subject: string): string[] {
  return (cdu.focus.classe?.consiglio?.elenco ?? []).flatMap((docente) =>
    docente.materie.some((materia) => materia.sigla === subject) &&
    docente.email !== null
      ? [docente.email]
      : []
  );
}

function assertActors(label: string, actual: string[], expected: string[]): void {
  if (JSON.stringify(normalized(actual)) !== JSON.stringify(normalized(expected))) {
    throw new ValidationError(`${label}: atteso=${expected.join(',')} reale=${actual.join(',')}`);
  }
}

export function visibilitySnapshot(
  container: ServiceContainer,
  now: Date,
  mode: GestioneSupplenti
): ConsumerVisibilitySnapshot {
  const builder = container.get<ContextBuilder>('contextBuilder');
  const cdu = classCdu(builder, '4A', now, mode);
  const roles = container.get<RisolutoreRuoliService>('risolutoreRuoli');
  const grants: Array<{ targetId: string; email: string }> = [];
  const drive = {
    setPermissions: (values: Array<{ targetId: string; email: string }>): void => {
      grants.push(...values);
    }
  } as unknown as IDriveFacade;
  const permissionsRow = {
    ID: 'E2E_VISIBILITY',
    TIPO: 'ACL_VISIBILITY',
    GENERATORE: 'CLASSE',
    CONDIZIONE: null,
    MODELLI: '{"templateId":"visibility"}',
    FILE_NAME: 'visibility',
    PATH_OUT: 'visibility',
    DUPLICAZIONE: 'PERMESSA',
    PERMESSI: JSON.stringify({
      file: [{ ruolo: 'CDC', permesso: 'SCRITTURA' }],
      folder: [{ ruolo: 'CDC', permesso: 'SCRITTURA' }],
      regolaSupplente: { file: mode, folder: mode }
    }),
    POST_PROCESSO: null,
    PARAMETRI: null,
    GESTIONE_ARTICOLAZIONE: 'COMPLETA',
    FORMATO: 'GDOC',
    REGISTRA_DOC: '{}',
    REGISTRA_FOLD: '{}'
  };
  const pipeline = new PipelineContext();
  pipeline.set('config', permissionsRow);
  pipeline.set('confDoc', ConfigurazioneDocumento.fromData(permissionsRow));
  pipeline.set('cdu', cdu);
  pipeline.set('shouldGenerate', true);
  pipeline.set('newFileId', 'visibility-file');
  pipeline.set('destFolderId', 'visibility-folder');
  new ApplyPermissionsStep(new LoggerService(), drive, roles, new ExpressionEngineFacade()).execute(
    pipeline
  );

  const protectionRequests: SpreadsheetProtectRequest[] = [];
  const capturedLayout: SheetColumnLayout[] = [];
  const sheets = {
    getSheetInfo: (): SpreadsheetSheetInfo[] => [
      {
        name: 'Sheet1',
        sheetId: 0,
        index: 0,
        hidden: false,
        gridProperties: { rowCount: 20, columnCount: 20 }
      }
    ],
    protectRanges: (
      _id: string,
      requests: SpreadsheetProtectRequest | SpreadsheetProtectRequest[]
    ): SpreadsheetProtectResult => {
      protectionRequests.push(...(Array.isArray(requests) ? requests : [requests]));
      return {
        spreadsheetId: 'visibility-sheet',
        protectedCount: protectionRequests.length,
        protectedRangeIds: protectionRequests.map((_request, index) => index),
        replies: []
      };
    }
  } as unknown as SpreadsheetService;
  const templates = {
    processSheet: (
      _spreadsheetId: string,
      context: Record<string, unknown>
    ): SheetColumnLayout[] => {
      const focus = context['focus'] as { classe?: { sheet?: { materieColonne?: unknown } } };
      const groups = focus.classe?.sheet?.materieColonne as {
        gruppi: Array<{ colonne: Array<Record<string, unknown>> }>;
      };
      const layout = groups.gruppi.flatMap((group) => group.colonne).map(
        (item, index) => ({
          sheetName: 'Sheet1',
          column: index + 1,
          header:
            typeof item['header'] === 'string'
              ? item['header']
              : typeof item['sigla'] === 'string'
                ? item['sigla']
                : '',
          isLabel: false,
          item
        })
      );
      capturedLayout.push(...layout);
      return layout;
    }
  } as unknown as ITemplateEngine;
  const sheetConfig = ConfigurazioneDocumento.fromData({
    ...permissionsRow,
    ID: 'E2E_VISIBILITY_SHEET',
    GENERATORE: 'CLASSE',
    FORMATO: 'GSHEET',
    PERMESSI: JSON.stringify({ regolaSupplente: { file: mode } }),
    // Deliberately conflicting legacy/undocumented key: PERMESSI must win.
    PARAMETRI: JSON.stringify({ gestioneSupplenti: GestioneSupplenti.SOLO_TITOLARI })
  });
  const strategy = new SheetMaterieConPermessiGeneratorStrategy(
    sheets,
    new MateriaRepository(container.get('db')),
    templates,
    roles
  );
  strategy.render('visibility-sheet', cdu, sheetConfig);
  // Pure resolution, independent of the synthetic-principal skip in `protectColumns`
  // (2026-08-21 round 1): this check asserts that effective-assignment resolution reaches
  // the column-ACL layer, not that Sheets would accept the call — and every E2E teacher is
  // a synthetic principal, so the real call is always skipped.
  const resolvedRequests = strategy.resolveColumnRequests(
    cdu,
    'Sheet1',
    capturedLayout,
    protectionGestioneSupplenti(sheetConfig)
  );
  const matProtection = resolvedRequests.find((request) =>
    request.description?.includes(' MAT ')
  );

  return {
    cdu: subjectActors(cdu, 'MAT'),
    recipients: roles
      .risolvi('CDC', cdu, { regolaSupplente: mode })
      .map((email) => email.value),
    documentAcl: grants
      .filter((grant) => grant.targetId === 'visibility-file')
      .map((grant) => grant.email),
    folderAcl: grants
      .filter((grant) => grant.targetId === 'visibility-folder')
      .map((grant) => grant.email),
    protectedRangeEditors: matProtection?.editors?.users ?? []
  };
}

export function registerSupplenzeRuoliChecks(
  runner: TestRunner,
  container: ServiceContainer,
  sample: SharedTestDatabase
): void {
  if (!sample.masterTestMode) {
    runner.add('supplenze.ruoli::MASTER.TEST_MODE guard', sample.sampleSpreadsheetUrl, () => {
      throw new ValidationError('SUPPLENZE_RUOLI richiede MASTER.TEST_MODE=true.');
    });
    return;
  }

  runner.add(
    'supplenze.ruoli::confini inclusivi ed esclusivi',
    sample.sampleSpreadsheetUrl,
    () => {
      const builder = container.get<ContextBuilder>('contextBuilder');
      const principal = e2eDocenteEmail(19);
      const substitute = e2eDocenteEmail(20);
      const actorsAt = (date: Date): string[] =>
        subjectActors(classCdu(builder, '4A', date, GestioneSupplenti.SOLO_SUPPLENTI), 'MAT');
      assertActors('prima DAL', actorsAt(new Date(SUPPLENZA_INIZIO.getTime() - 1)), [principal]);
      assertActors('DAL inclusivo', actorsAt(SUPPLENZA_INIZIO), [substitute]);
      assertActors('AL inclusivo', actorsAt(SUPPLENZA_FINE), [substitute]);
      // AL is persisted date-only (COL_SUPPLENZE.AL is sliced to YYYY-MM-DD),
      // so it's inclusive of the whole calendar day — a +1ms probe stays on
      // the same day and never actually crosses the boundary. Advance a full
      // day instead.
      assertActors(
        'dopo AL',
        actorsAt(new Date(SUPPLENZA_FINE.getTime() + 24 * 60 * 60 * 1000)),
        [principal]
      );
    }
  );

  runner.add(
    'supplenze.ruoli::isolamento classi sovrapposte',
    sample.sampleSpreadsheetUrl,
    () => {
      const builder = container.get<ContextBuilder>('contextBuilder');
      const at = SUPPLENZA_INIZIO;
      assertActors(
        '4A/MAT',
        subjectActors(classCdu(builder, '4A', at, GestioneSupplenti.SOLO_SUPPLENTI), 'MAT'),
        [e2eDocenteEmail(20)]
      );
      assertActors(
        '2B/ING',
        subjectActors(classCdu(builder, '2B', at, GestioneSupplenti.SOLO_SUPPLENTI), 'ING'),
        [e2eDocenteEmail(18)]
      );
    }
  );

  runner.add(
    'supplenze.ruoli::variazione prima durante dopo sostituzione',
    sample.sampleSpreadsheetUrl,
    () => {
      const builder = container.get<ContextBuilder>('contextBuilder');
      const actorAt = (date: string): string[] =>
        subjectActors(
          classCdu(builder, '1A', new Date(date), GestioneSupplenti.SOLO_SUPPLENTI),
          'LAB.SEMINARIO_POMERIDIANO'
        );
      assertActors('prima sostituzione', actorAt('2026-07-31T23:59:59.999Z'), [e2eDocenteEmail(4)]);
      assertActors('durante sostituzione', actorAt('2026-08-05T12:00:00Z'), [e2eDocenteEmail(18)]);
      assertActors('dopo sostituzione', actorAt('2026-08-11T00:00:00Z'), [e2eDocenteEmail(4)]);
      assertActors('dopo variazione', actorAt('2026-10-16T00:00:00Z'), [e2eDocenteEmail(20)]);
    }
  );

  runner.add(
    'supplenze.ruoli::visibilita CDU destinatari ACL e protezioni',
    sample.sampleSpreadsheetUrl,
    () => {
      // Dedicated window/pair (not SUPPLENZA_INIZIO's 19->20): 'CDC' is a
      // whole-class-roster role, and docente20 is independently 4A/ITA's real
      // titolare, so he'd surface in a SOLO_TITOLARI roster regardless of this
      // substitution's mode — a false leak unrelated to what's under test.
      // Docente9 holds no other nominal 4A slot, so this window isolates it.
      const visibilityAt = new Date('2026-10-22T12:00:00Z');
      for (const mode of [
        GestioneSupplenti.SOLO_TITOLARI,
        GestioneSupplenti.SOLO_SUPPLENTI,
        GestioneSupplenti.ENTRAMBI
      ]) {
        assertActorVisibility(
          String(mode),
          visibilitySnapshot(container, visibilityAt, mode),
          e2eDocenteEmail(19),
          e2eDocenteEmail(9),
          mode
        );
      }
    }
  );

  runner.add(
    'supplenze.ruoli::dedupe titolare e supplente',
    sample.sampleSpreadsheetUrl,
    () => {
      const same = e2eDocenteEmail(19);
      assertActorVisibility(
        'same-email',
        visibilitySnapshot(container, new Date('2026-11-05T12:00:00Z'), GestioneSupplenti.ENTRAMBI),
        same,
        same,
        GestioneSupplenti.ENTRAMBI
      );
    }
  );
}
