import type { ContextBuilder } from '../../application/context-engine/ContextBuilder';
import type { Cdu } from '../../application/context-engine/Cdu';
import { recipe } from '../../application/context-engine/Recipe';
import type { EmailDb } from '../../application/services/EmailNotificationService';
import type { ServiceContainer } from '../../config/ServiceContainer';
import { COL_CONF_DOC, COL_CONF_MAIL, TABLE } from '../../config/schema';
import { ValidationError } from '../../domain/errors/DomainError';
import type { IDriveFacade } from '../../infrastructure/facades/DriveServiceFacade';
import { TemplateEngineFacade } from '../../infrastructure/facades/TemplateEngineFacade';
import {
  CLASSE_A,
  CLASSE_C_PARENT,
  PIANO_DOPPIO_STUDENTE,
  RIPETENTE_3C,
  type SharedTestDatabase
} from '../data/SharedTestDatabaseBuilder';
import { CONF_DOC_STORICO, CONF_MAIL_STORICO, e2eAlunnoEmail } from '../data/fixtures';
import { materializeLazyRef } from '../report/MaterializeHelper';
import { groupName, type TestRunner } from '../report/OnlineTestReport';

export type StoricoCheckScope = 'all' | 'alunno' | 'classe' | 'documenti';

type StoricoSample = SharedTestDatabase & { testMode: boolean };
type UnknownRecord = Record<string, unknown>;

const NOW = new Date('2026-08-10T09:00:00.000Z');
const ALUNNO_STORICO = e2eAlunnoEmail(138);
const ALUNNO_RITIRATO = e2eAlunnoEmail(139);

function fail(message: string): never {
  throw new ValidationError(`Storico E2E: ${message}`);
}

function asRecord(value: unknown, label: string): UnknownRecord {
  if (value === null || typeof value !== 'object') fail(`${label} non materializzato`);
  return value as UnknownRecord;
}

function asArray(value: unknown, label: string): UnknownRecord[] {
  if (!Array.isArray(value)) fail(`${label} non è un array`);
  return value as UnknownRecord[];
}

function noMustache(value: string): boolean {
  return !/{{[\s\S]*?}}/.test(value);
}

function buildAlunno(
  builder: ContextBuilder,
  email: string,
  options: {
    includiStorico: boolean;
    profonditaAnniStorico: number;
    profonditaAnniDocumenti: number;
  }
): Cdu {
  return builder.build(
    { target: email, tipoTarget: 'alunno', now: NOW },
    recipe('ALUNNO_COMPLETO', options)
  );
}

function buildClasse(builder: ContextBuilder, classe: string, depth: number): Cdu {
  return builder.build(
    { target: classe, tipoTarget: 'classe', now: NOW },
    recipe('CLASSE_COMPLETA', {
      includiStorico: true,
      profonditaAnniStorico: depth,
      profonditaAnniDocumenti: depth
    })
  );
}

export function assertAlunnoStorico(value: unknown): void {
  const storico = asRecord(value, 'focus.alunno.storico');
  const anni = asArray(storico.anni, 'focus.alunno.storico.anni');
  if (anni.length !== 2) fail(`attesi due anni, ricevuti ${anni.length}`);
  const signatures = anni.map(
    (anno) => `${String(anno.annoScolastico)}:${String(anno.classe)}:${String(anno.esito)}`
  );
  if (!signatures.includes('2025-2026:2C:PROMOSSO')) fail('anno promosso 2025-2026/2C mancante');
  if (!signatures.includes('2024-2025:1C:NON_PROMOSSO')) {
    fail('anno non promosso 2024-2025/1C mancante');
  }
  if (storico.hasBocciature !== true) fail('hasBocciature deve essere true');
  const bocciature = asArray(storico.bocciature, 'focus.alunno.storico.bocciature');
  if (!bocciature.some((b) => b.annoScolastico === '2024-2025' && b.classe === '1C')) {
    fail('bocciatura distintiva 2024-2025/1C mancante');
  }
  for (const key of ['pianiPrimoAnnoPrecedente', 'pianiSecondoAnnoPrecedente']) {
    if (!asArray(storico[key], key).some((piano) => piano.tipo === 'PDP_BES')) {
      fail(`${key} non contiene PDP_BES`);
    }
  }
}

export function assertClasseStorico(storicoValue: unknown, materieValue: unknown): void {
  const storico = asRecord(storicoValue, 'focus.classe.storico');
  const statistiche = asArray(storico.statistiche, 'focus.classe.storico.statistiche');
  const statisticheAttese = ['2025-2026:2C:1', '2024-2025:1C:1'];
  const statisticheReali = statistiche.map((anno) => {
    const counts = asRecord(anno.statistiche, 'statistiche anno');
    return `${String(anno.annoScolastico)}:${String(anno.classe)}:${String(counts.totale)}`;
  });
  for (const expected of statisticheAttese) {
    if (!statisticheReali.includes(expected)) fail(`statistica distintiva ${expected} mancante`);
  }

  const progetti = asArray(storico.progetti, 'focus.classe.storico.progetti').flatMap((anno) =>
    asArray(anno.progetti, 'progetti anno')
  );
  const asl = progetti.find((progetto) => progetto.isAsl === true);
  const orientamento = progetti.find((progetto) => progetto.isAsl === false);
  if (asl === undefined || !String(asl.nome).startsWith('ASL storico ')) {
    fail('progetto ASL storico mancante');
  }
  const aslReferente = asRecord(asl.referente, 'referente ASL');
  if (!String(aslReferente.email).startsWith('docente.storico.')) {
    fail('referente docente storico non risolto');
  }
  const orientamentoReferente = asRecord(orientamento?.referente, 'referente esterno');
  if (
    orientamento === undefined ||
    orientamentoReferente.email !== null ||
    !String(orientamentoReferente.nomeCompleto).startsWith('Esperto Esterno ')
  ) {
    fail('fallback persona del referente esterno non preservato');
  }

  const materie = asArray(materieValue, 'focus.classe.materie');
  const bySigla = (sigla: string): UnknownRecord => {
    const materia = materie.find((candidate) => candidate.sigla === sigla);
    if (materia === undefined) fail(`materia ${sigla} mancante`);
    return materia;
  };
  const inf = asRecord(bySigla('INF').continuita, 'continuità INF');
  const infAnni = asArray(inf.docentiAnniPrecedenti, 'continuità INF anni');
  if (asRecord(infAnni[0]?.itp, 'ITP INF anno 1').email !== 'e2edocente11@onlinetest.aldo.local') {
    fail('ITP storico cambiato di INF non risolto');
  }
  if (infAnni[1]?.itp !== null) fail('ITP storico assente di INF deve essere null');

  const mat = asRecord(bySigla('MAT').continuita, 'continuità MAT');
  for (const anno of asArray(mat.docentiAnniPrecedenti, 'continuità MAT anni')) {
    if (Object.prototype.hasOwnProperty.call(anno, 'itp')) fail('MAT senza ITP espone campo itp');
  }
  if (
    Object.prototype.hasOwnProperty.call(mat, 'continuitaUltimiDueAnniItp') ||
    Object.prototype.hasOwnProperty.call(mat, 'continuitaUltimiTreAnniItp')
  ) {
    fail('MAT senza ITP espone flag di continuità ITP');
  }

  const sto = asRecord(bySigla('STO').continuita, 'continuità STO');
  const stoAnni = asArray(sto.docentiAnniPrecedenti, 'continuità STO anni');
  if (
    stoAnni.length !== 2 ||
    stoAnni.some(
      (anno) =>
        asRecord(anno.titolare, 'titolare STO').email !== 'e2edocente4@onlinetest.aldo.local'
    )
  ) {
    fail('evoluzione GST verso STO non riconciliata su due anni');
  }
}

export function assertDocumentiStorici(value: unknown): void {
  const docs = asArray(value, 'focus.alunno.didattica.pianiPersonalizzati.storico');
  for (const anno of ['2025-2026', '2024-2025']) {
    for (const sottotipo of ['PEI', 'PDP_BES']) {
      const matches = docs.filter(
        (doc) =>
          doc.anno === anno &&
          doc.idGen === 'PIANI_PERSONALIZZATI' &&
          doc.tipo === 'PIANO_PERS' &&
          doc.sottotipo === sottotipo
      );
      if (matches.length !== 1)
        fail(`${anno}/${sottotipo}: atteso un documento, trovati ${matches.length}`);
      if (!String(matches[0]!.link).includes(`${sottotipo}_${anno.replace('-', '_')}`)) {
        fail(`isolamento link PEI/PDP violato per ${anno}/${sottotipo}`);
      }
    }
  }
}

export function assertStoricoRender(documentText: string, mailText: string): void {
  if (!noMustache(documentText) || !noMustache(mailText)) fail('Mustache irrisolto nel render');
  for (const marker of ['2025-2026', '2024-2025']) {
    if (!documentText.includes(marker) || !mailText.includes(marker)) {
      fail(`marker storico ${marker} mancante da documento o mail`);
    }
  }
  if (!documentText.includes('NON_PROMOSSO') || !documentText.includes('ASL storico')) {
    fail('branch storici reali mancanti dal documento');
  }
}

function materializeStudentHistory(cdu: Cdu): unknown {
  const storico = materializeLazyRef(cdu.focus.alunno?.storico);
  if (cdu.focus.alunno !== undefined) cdu.focus.alunno.storico = storico as never;
  return storico;
}

function materializeClassHistory(cdu: Cdu): unknown {
  const storico = materializeLazyRef(cdu.focus.classe?.storico);
  if (cdu.focus.classe !== undefined) cdu.focus.classe.storico = storico as never;
  return storico;
}

function findConfig(rows: UnknownRecord[], column: string, id: string): UnknownRecord {
  const found = rows.find((row) => row[column] === id);
  if (found === undefined) fail(`configurazione ${id} mancante`);
  return found;
}

export function registerStoricoChecks(
  runner: TestRunner,
  container: ServiceContainer,
  sample: StoricoSample,
  scope: StoricoCheckScope = 'all'
): void {
  const builder = container.get<ContextBuilder>('contextBuilder');

  if (scope === 'all' || scope === 'alunno') {
    runner.add(
      groupName('storico.alunno', 'depth 2 materializzato'),
      sample.priorSampleSpreadsheetUrl,
      () => {
        const cdu = buildAlunno(builder, ALUNNO_STORICO, {
          includiStorico: true,
          profonditaAnniStorico: 2,
          profonditaAnniDocumenti: 2
        });
        assertAlunnoStorico(materializeStudentHistory(cdu));
      }
    );
    runner.add(
      groupName('storico.alunno', 'casi limite depth 0, mancanti e sconosciuto'),
      sample.priorSampleSpreadsheetUrl2,
      () => {
        const depthZero = buildAlunno(builder, ALUNNO_STORICO, {
          includiStorico: true,
          profonditaAnniStorico: 0,
          profonditaAnniDocumenti: 0
        });
        const depthZeroStorico = asRecord(materializeStudentHistory(depthZero), 'storico depth 0');
        if (asArray(depthZeroStorico.anni, 'storico depth 0.anni').length !== 0) {
          fail('depth 0 deve produrre anni vuoti');
        }
        const unknown = asRecord(
          materializeStudentHistory(
            buildAlunno(builder, e2eAlunnoEmail(1), {
              includiStorico: true,
              profonditaAnniStorico: 2,
              profonditaAnniDocumenti: 0
            })
          ),
          'storico sconosciuto'
        );
        if (
          !asArray(unknown.anni, 'anni sconosciuti').every((anno) => anno.esito === 'SCONOSCIUTO')
        ) {
          fail('alunno storico mancante non produce SCONOSCIUTO stabile');
        }
        const ritirato = asRecord(
          materializeStudentHistory(
            buildAlunno(builder, ALUNNO_RITIRATO, {
              includiStorico: true,
              profonditaAnniStorico: 2,
              profonditaAnniDocumenti: 0
            })
          ),
          'storico ritirato'
        );
        if (!asArray(ritirato.anni, 'anni ritirato').every((anno) => anno.esito === 'RITIRATO')) {
          fail('movimento OUT non produce RITIRATO');
        }
        const ripetente = buildAlunno(builder, RIPETENTE_3C, {
          includiStorico: true,
          profonditaAnniStorico: 2,
          profonditaAnniDocumenti: 0
        });
        if (ripetente.focus.alunno?.status.isRipetente !== true) {
          fail('flag ripetenza corrente non preservato');
        }
      }
    );
  }

  if (scope === 'all' || scope === 'classe') {
    runner.add(
      groupName('storico.classe', 'statistiche, progetti e referente'),
      sample.priorSampleSpreadsheetUrl,
      () => {
        const cdu = buildClasse(builder, CLASSE_C_PARENT, 2);
        const storico = materializeClassHistory(cdu);
        assertClasseStorico(storico, cdu.focus.classe?.materie);
      }
    );
    runner.add(
      groupName('storico.classe', 'continuità CdC, ITP ed evoluzione materie'),
      sample.priorSampleSpreadsheetUrl2,
      () => {
        const cdu = buildClasse(builder, CLASSE_C_PARENT, 2);
        assertClasseStorico(materializeClassHistory(cdu), cdu.focus.classe?.materie);
        const missingChain = buildClasse(builder, CLASSE_A, 2);
        const empty = asRecord(
          materializeClassHistory(missingChain),
          'storico classe senza catena'
        );
        if (
          asArray(empty.statistiche, 'statistiche senza catena').length !== 0 ||
          asArray(empty.progetti, 'progetti senza catena').length !== 0
        ) {
          fail('catena classe mancante non resta vuota');
        }
      }
    );
  }

  if (scope === 'all' || scope === 'documenti') {
    runner.add(
      groupName('storico.documenti', 'ID_GEN, famiglia, sottotipo e isolamento PEI/PDP'),
      sample.priorSampleSpreadsheetUrl,
      () => {
        const pianoCdu = buildAlunno(builder, PIANO_DOPPIO_STUDENTE, {
          includiStorico: true,
          profonditaAnniStorico: 2,
          profonditaAnniDocumenti: 2
        });
        const pianoHistory = materializeLazyRef(
          pianoCdu.focus.alunno?.didattica.pianiPersonalizzati?.storico
        );
        assertDocumentiStorici(pianoHistory);

        const genericCdu = buildAlunno(builder, ALUNNO_STORICO, {
          includiStorico: true,
          profonditaAnniStorico: 2,
          profonditaAnniDocumenti: 2
        });
        const genericHistory = asArray(
          materializeLazyRef(genericCdu.focus.alunno?.didattica.pianiPersonalizzati?.storico),
          'documenti CONF_DOC_STORICO'
        );
        if (
          genericHistory.filter(
            (doc) =>
              doc.idGen === CONF_DOC_STORICO &&
              doc.tipo === 'PIANO_PERS' &&
              doc.sottotipo === 'PDP_BES'
          ).length !== 2
        ) {
          fail('ID_GEN/famiglia/sottotipo di CONF_DOC_STORICO non preservati');
        }
      }
    );
    runner.add(
      groupName('storico.render', 'template documento e mail senza placeholder'),
      sample.sampleFolderUrl,
      () => {
        const db = container.get<EmailDb>('db');
        const drive = container.get<IDriveFacade>('drive');
        const templates = new TemplateEngineFacade();
        const docConfig = findConfig(
          db.table(TABLE.CONF_DOC).findAll(),
          COL_CONF_DOC.ID,
          CONF_DOC_STORICO
        );
        const mailConfig = findConfig(
          db.table(TABLE.CONF_MAIL).findAll(),
          COL_CONF_MAIL.ID,
          CONF_MAIL_STORICO
        );
        const models = JSON.parse(String(docConfig[COL_CONF_DOC.MODELLI])) as {
          templateId?: unknown;
        };
        if (typeof models.templateId !== 'string' || models.templateId === '') {
          fail('CONF_DOC_STORICO senza templateId');
        }

        const alunnoCdu = buildAlunno(builder, ALUNNO_STORICO, {
          includiStorico: true,
          profonditaAnniStorico: 2,
          profonditaAnniDocumenti: 2
        });
        materializeStudentHistory(alunnoCdu);
        const classeCdu = buildClasse(builder, CLASSE_C_PARENT, 2);
        materializeClassHistory(classeCdu);
        const renderContext = {
          ...alunnoCdu,
          focus: { ...alunnoCdu.focus, classe: classeCdu.focus.classe }
        } as unknown as Record<string, unknown>;

        const folderId = drive.createFolder(String(docConfig[COL_CONF_DOC.PATH_OUT]));
        const fileId = drive.copyFile(models.templateId, 'E2E Storico Render Check', folderId);
        try {
          templates.processDocument(fileId, renderContext);
          const documentText = drive.getFileText(fileId);
          const mailText = templates.processStringEscaped(
            `${String(mailConfig[COL_CONF_MAIL.OGGETTO])} ${String(mailConfig[COL_CONF_MAIL.TESTO])}`,
            renderContext
          );
          assertStoricoRender(documentText, mailText);
        } finally {
          drive.deleteFile(fileId);
        }
      }
    );
  }
}
