import type { Azione, AzioneHandler, PostProcessDb } from './standaloneActions';
import { csvValues } from './standaloneActions';
import type {
  IDriveFacade,
  PermissionGrant
} from '../../infrastructure/facades/DriveServiceFacade';
import { DRIVE_ROLE_BY_PERMESSO } from '../../infrastructure/facades/DriveServiceFacade';
import type { IRoleResolver } from './documentSteps';
import type { IExpressionEngine } from '../../infrastructure/facades/ExpressionEngineFacade';
import { parseRegola, risolviAcl, type PermessiConfig } from './permessiAcl';
import type { Cdu } from '../context-engine/Cdu';
import type { StoricoDocumentiService } from '../storico/StoricoDocumentiService';
import { TABLE, COL_CONF_DOC, COL_LOG_DOCS, COL_LOG_FOLD } from '../../config/schema';
import type { BounceFilters, BounceSummary } from '../email/BounceReconciliationService';
import { ConfigurationError } from '../../domain/errors/DomainError';
import { hasJsonValue } from './standaloneActions';

/** Drive roles ordered by privilege; owner/organizer are absent on purpose —
 * Drive rejects downgrading them and they keep full access regardless
 * (same rule LockDocumentsService documents). */
const RANK: Record<string, number> = { reader: 1, commenter: 2, writer: 3 };

/** Log columns whose cells hold a CSV list and therefore match by containment (01 §CLASSI/UTENTI). */
const CSV_COLUMNS = new Set(['CLASSI', 'UTENTI', 'MATERIE']);

/** Sheet cell -> string; a LOG_DOCS/LOG_FOLD cell is always a scalar in practice. */
function cellString(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
    ? String(value)
    : '';
}

export interface ValidatoreDb {
  esegui(tabelle?: string[]): { violazioni: unknown[]; nome: string };
}

export interface AzioniInfraDeps {
  db: PostProcessDb;
  drive: IDriveFacade;
  roles: IRoleResolver;
  /** CDU of the current target — the role resolver's context. */
  cdu: Cdu;
  /** Needed only by AGGIORNA_PERMESSI with `profondita` > 0. */
  storico?: StoricoDocumentiService;
  /** Needed only by VALIDA_DB; absent off-GAS (no SpreadsheetService). */
  validator?: ValidatoreDb;
  /** Needed only by VERIFICA_EMAIL_INVIATE. */
  bounces?: { riconcilia(f: BounceFilters): BounceSummary };
  /** Needed only by RIALLINEA_PERMESSI_DA_CONF (evaluates CONF_DOC.PERMESSI `condizione`). */
  engine?: IExpressionEngine;
  logger: LoggerService;
}

const TS_IT = /^(\d{2})-(\d{2})-(\d{4})\s+(\d{2}):(\d{2}):(\d{2})$/;
/** "GG-MM-AAAA HH:MM:SS" -> Date in the script timezone (Rome on GAS). */
function parseTimestampIt(campo: string, raw: string): Date {
  const m = TS_IT.exec(raw.trim());
  if (m === null) {
    throw new ConfigurationError(
      `AZIONE VERIFICA_EMAIL_INVIATE: ${campo} "${raw}" non è nel formato GG-MM-AAAA HH:MM:SS`
    );
  }
  return new Date(+m[3]!, +m[2]! - 1, +m[1]!, +m[4]!, +m[5]!, +m[6]!);
}

/**
 * The infra half of the azioni grammar: action types that touch Drive or run a
 * service, supplied to `eseguiAzioni` as `handlers` (the DB-only types stay
 * built in). Every handler is idempotent by construction — it computes the
 * delta between the configured state and the live one and writes only that —
 * so a resumed or re-run job repeats no work.
 */
export function creaHandlersInfra(deps: AzioniInfraDeps): Record<string, AzioneHandler> {
  const { db, drive, roles, cdu, storico, validator, bounces, engine, logger } = deps;

  /** Rows of `tab` matching `criteri`: CSV columns by containment, PATH by prefix, everything else by equality. */
  function righeCorrispondenti(
    tab: string,
    criteri: Record<string, string>
  ): Array<Record<string, unknown>> {
    const table = db.tables[tab];
    if (table === undefined) return [];
    const entries = Object.entries(criteri);
    return table.getAllRows().filter((row) =>
      entries.every(([col, value]) => {
        if (col === 'PATH') return cellString(row[col]).startsWith(value);
        if (CSV_COLUMNS.has(col)) {
          const attesi = csvValues(value);
          return attesi.length === 0
            ? cellString(row[col]) === value
            : csvValues(row[col]).some((v) => attesi.includes(v));
        }
        return cellString(row[col]) === value;
      })
    );
  }

  const idsDi = (rows: Array<Record<string, unknown>>): string[] => [
    ...new Set(rows.map((row) => cellString(row['ID'])).filter((id) => id !== ''))
  ];

  /**
   * Targets of an infra action. Without `target`, `criteri` filter the chosen log
   * table directly. With `target` (a CONF_DOC.ID) only what that CONF_DOC generated
   * is selected: on LOG_DOCS the rows with `ID_GEN=target`; on LOG_FOLD the folders
   * whose PATH is the folder of a `target` document (`criteri` then narrow those
   * documents, whose CLASSI/UTENTI/MATERIE are always filled by REGISTRA_DOC).
   * LOG_FOLD.ID_GEN is not used: it keeps only the first CONF_DOC that created a
   * folder, so it misses folders shared by several CONF_DOC.
   */
  function selezionaId(azione: Azione, criteri: Record<string, string>): string[] {
    const tab = azione.su ?? TABLE.LOG_DOCS;
    if (tab !== TABLE.LOG_DOCS && tab !== TABLE.LOG_FOLD) {
      throw new ConfigurationError(
        `AZIONE ${azione.tipo}: "su" deve essere LOG_DOCS o LOG_FOLD, non ${tab}`
      );
    }
    const target = azione.target?.trim() ?? '';
    if (target === '') return idsDi(righeCorrispondenti(tab, criteri));
    const documenti = righeCorrispondenti(TABLE.LOG_DOCS, { ...criteri, ID_GEN: target });
    if (tab === TABLE.LOG_DOCS) return idsDi(documenti);
    const percorsi = new Set(
      documenti.map((doc) => cellString(doc['PATH'])).filter((p) => p !== '')
    );
    return idsDi(
      (db.tables[TABLE.LOG_FOLD]?.getAllRows() ?? []).filter((row) =>
        percorsi.has(cellString(row['PATH']))
      )
    );
  }

  /** Current-year targets plus, when `profondita` > 0, the matching historical LOG_DOCS ids (documents only: a folder selection never gets document ids). */
  function targetIds(azione: Azione, criteri: Record<string, string>): string[] {
    const correnti = selezionaId(azione, criteri);
    const profondita = azione.profondita ?? 0;
    if (
      profondita <= 0 ||
      storico === undefined ||
      (azione.su ?? TABLE.LOG_DOCS) !== TABLE.LOG_DOCS
    ) {
      return correnti;
    }
    // StoricoDocumentiService only understands LOG_DOCS metadata criteria; PATH
    // is a current-year folder-tree concept and is dropped for the history scan.
    const storiciCriteri = Object.fromEntries(
      Object.entries(criteri).filter(([col]) => col !== 'PATH')
    );
    if (azione.target !== undefined && azione.target.trim() !== '')
      storiciCriteri['ID_GEN'] = azione.target.trim();
    return [...new Set([...correnti, ...storico.idsMatching(storiciCriteri, profondita)])];
  }

  function destinatari(azione: Azione): string[] {
    if (azione.ruolo !== undefined && azione.ruolo.trim() !== '') {
      return roles.risolvi(azione.ruolo, cdu).map((email) => email.value);
    }
    return (azione.emails ?? []).filter((email) => email.trim() !== '');
  }

  /**
   * Aligns one target's live ACL to `desiderati` (email -> permesso): a missing
   * address becomes a batched grant (pushed on `grants`), an address holding a
   * different role becomes a role change, and with `revoca` every non-owner
   * address outside `desiderati` is removed (never when `desiderati` is empty).
   * Per-target isolation: a Drive failure is warned and never aborts the others.
   */
  function allineaTarget(
    tag: string,
    targetId: string,
    desiderati: Map<string, string>,
    grants: PermissionGrant[],
    revoca: boolean
  ): number {
    let applicati = 0;
    try {
      const attuali = new Map(
        drive
          .listPermissions(targetId)
          .filter((p) => p.email !== null)
          .map((p) => [p.email!, p])
      );
      const changes: Array<{ permissionId: string; role: string }> = [];
      for (const [email, permesso] of desiderati) {
        const role = DRIVE_ROLE_BY_PERMESSO[permesso] ?? 'reader';
        const attuale = attuali.get(email);
        if (attuale === undefined) {
          grants.push({ targetId, email, permesso });
          continue;
        }
        if (attuale.role === role || RANK[attuale.role] === undefined) continue;
        changes.push({ permissionId: attuale.id, role });
      }
      if (changes.length > 0) {
        const falliti = drive.changePermissionRoles(targetId, changes);
        applicati += changes.length - falliti.length;
        for (const fallito of falliti) {
          logger.warn(`${tag}: ${targetId}/${fallito.permissionId} — ${fallito.errore}`);
        }
      }
      if (revoca && desiderati.size > 0) {
        const daRimuovere = [...attuali.values()]
          .filter((p) => !desiderati.has(p.email!) && RANK[p.role] !== undefined)
          .map((p) => p.id);
        if (daRimuovere.length > 0) {
          const falliti = drive.removePermissions(targetId, daRimuovere);
          applicati += daRimuovere.length - falliti.length;
          for (const fallito of falliti) {
            logger.warn(`${tag}: ${targetId}/${fallito.permissionId} — ${fallito.errore}`);
          }
        }
      }
    } catch (error) {
      const messaggio = error instanceof Error ? error.message : String(error);
      logger.warn(`${tag}: ${targetId} non elaborato — ${messaggio}`);
    }
    return applicati;
  }

  return {
    /**
     * Applies the configured ACL to every selected file/folder, writing only the
     * delta against `listPermissions`: a missing address becomes a batched grant,
     * an address holding a different role becomes a role change. owner/organizer
     * are never touched. This is what makes the action re-runnable as a
     * cattedra/supplenza realignment.
     */
    AGGIORNA_PERMESSI: (azione, criteri) => {
      const permesso = azione.permesso ?? 'LETTURA';
      const emails = destinatari(azione);
      if (emails.length === 0) return 0;
      const desiderati = new Map(emails.map((email) => [email, permesso]));
      const grants: PermissionGrant[] = [];
      let cambiati = 0;
      // Per-target isolation lives in allineaTarget: grants already computed for
      // earlier targets stay in `grants` and are flushed in the single batched
      // setPermissions call below.
      for (const targetId of targetIds(azione, criteri)) {
        cambiati += allineaTarget('AGGIORNA_PERMESSI', targetId, desiderati, grants, false);
      }
      // One shareWithUsers call per targetId+permesso pair, batched by the facade.
      if (grants.length > 0) drive.setPermissions(grants);
      return grants.length + cambiati;
    },

    /**
     * Realigns the files selected from LOG_DOCS (`criteri`, optional `target` =
     * CONF_DOC.ID) AND the folders that hold them (LOG_FOLD.PATH = LOG_DOCS.PATH)
     * to the ACL their generating CONF_DOC.PERMESSI prescribes (sections
     * `file`/`folder`, `condizione`, `regolaSupplente`), resolved over the current
     * iteration CDU. A folder shared by several documents gets the union of their
     * ACLs (highest permesso wins). With `revoca: true` it also removes every
     * non-owner ACL outside the prescribed set (never on an empty set).
     */
    RIALLINEA_PERMESSI_DA_CONF: (azione, criteri) => {
      if (engine === undefined) {
        logger.warn(
          'AZIONE RIALLINEA_PERMESSI_DA_CONF: motore espressioni non disponibile — saltata'
        );
        return 0;
      }
      const target = azione.target?.trim() ?? '';
      const documenti = righeCorrispondenti(
        TABLE.LOG_DOCS,
        target === '' ? criteri : { ...criteri, ID_GEN: target }
      );
      const confRows = db.tables[TABLE.CONF_DOC]?.getAllRows() ?? [];
      const cartellePerPercorso = new Map<string, string>();
      for (const row of db.tables[TABLE.LOG_FOLD]?.getAllRows() ?? []) {
        const percorso = cellString(row[COL_LOG_FOLD.PATH]);
        const id = cellString(row['ID']);
        if (percorso !== '' && id !== '' && !cartellePerPercorso.has(percorso)) {
          cartellePerPercorso.set(percorso, id);
        }
      }
      const rango = (permesso: string): number =>
        RANK[DRIVE_ROLE_BY_PERMESSO[permesso] ?? 'reader'] ?? 1;
      const desiderati = new Map<string, Map<string, string>>();
      const accumula = (
        targetId: string,
        acl: Array<{ email: string; permesso: string }>
      ): void => {
        const perTarget = desiderati.get(targetId) ?? new Map<string, string>();
        for (const { email, permesso } of acl) {
          const attuale = perTarget.get(email);
          if (attuale === undefined || rango(permesso) > rango(attuale))
            perTarget.set(email, permesso);
        }
        desiderati.set(targetId, perTarget);
      };
      for (const doc of documenti) {
        const idGen = cellString(doc[COL_LOG_DOCS.ID_GEN]);
        const conf = confRows.find((row) => cellString(row[COL_CONF_DOC.ID]) === idGen);
        const raw = conf?.[COL_CONF_DOC.PERMESSI];
        if (conf === undefined || !hasJsonValue(raw)) {
          logger.warn(
            `RIALLINEA_PERMESSI_DA_CONF: ${cellString(doc['ID'])} — CONF_DOC "${idGen}" assente o senza PERMESSI, saltato`
          );
          continue;
        }
        try {
          const perms = JSON.parse(String(raw)) as PermessiConfig;
          const fileId = cellString(doc['ID']);
          if (fileId !== '') {
            accumula(
              fileId,
              risolviAcl(
                perms.file ?? [],
                cdu,
                parseRegola(perms.regolaSupplente?.file),
                roles,
                engine
              )
            );
          }
          const folderId = cartellePerPercorso.get(cellString(doc[COL_LOG_DOCS.PATH]));
          if (folderId !== undefined) {
            accumula(
              folderId,
              risolviAcl(
                perms.folder ?? [],
                cdu,
                parseRegola(perms.regolaSupplente?.folder),
                roles,
                engine
              )
            );
          }
        } catch (error) {
          const messaggio = error instanceof Error ? error.message : String(error);
          logger.warn(
            `RIALLINEA_PERMESSI_DA_CONF: ${cellString(doc['ID'])} non elaborato — ${messaggio}`
          );
        }
      }
      const grants: PermissionGrant[] = [];
      let cambiati = 0;
      for (const [targetId, attesi] of desiderati) {
        cambiati += allineaTarget(
          'RIALLINEA_PERMESSI_DA_CONF',
          targetId,
          attesi,
          grants,
          azione.revoca === true
        );
      }
      if (grants.length > 0) drive.setPermissions(grants);
      return grants.length + cambiati;
    },

    /**
     * The inverse of AGGIORNA_PERMESSI: removes every non-owner/organizer ACL
     * on the selected targets whose holder is NOT in the resolved
     * ruolo/emails set — closes a cattedra realignment (e.g. supplente
     * uscito) that AGGIORNA_PERMESSI alone only grows, never shrinks. Safety
     * guard mirrors AGGIORNA_PERMESSI's own empty-destinatari no-op: an
     * empty resolved roster must never be read as "revoke everyone".
     */
    REVOCA_PERMESSI: (azione, criteri) => {
      const attesi = new Set(destinatari(azione));
      if (attesi.size === 0) return 0;
      let rimossi = 0;
      for (const targetId of targetIds(azione, criteri)) {
        // Per-target isolation (mirrors LockDocumentsService.bloccaTutti): a
        // Drive failure on one target never aborts the remaining targets.
        try {
          const daRimuovere = drive
            .listPermissions(targetId)
            .filter((p) => p.email !== null && !attesi.has(p.email) && RANK[p.role] !== undefined)
            .map((p) => p.id);
          if (daRimuovere.length === 0) continue;
          const falliti = drive.removePermissions(targetId, daRimuovere);
          rimossi += daRimuovere.length - falliti.length;
          for (const fallito of falliti) {
            logger.warn(`REVOCA_PERMESSI: ${targetId}/${fallito.permissionId} — ${fallito.errore}`);
          }
        } catch (error) {
          const messaggio = error instanceof Error ? error.message : String(error);
          logger.warn(`REVOCA_PERMESSI: ${targetId} non elaborato — ${messaggio}`);
        }
      }
      return rimossi;
    },

    /** Caps every ACL at `soglia` (default LETTURA) on the selected targets — writer/commenter -> reader. */
    RIDUCI_PERMESSI: (azione, criteri) => {
      const soglia = azione.soglia ?? 'LETTURA';
      const roleSoglia = DRIVE_ROLE_BY_PERMESSO[soglia] ?? 'reader';
      const max = RANK[roleSoglia] ?? 1;
      let declassati = 0;
      for (const targetId of targetIds(azione, criteri)) {
        // Per-target isolation (mirrors LockDocumentsService.bloccaTutti): a
        // Drive failure on one target never aborts the remaining targets.
        try {
          const changes = drive
            .listPermissions(targetId)
            .filter((p) => (RANK[p.role] ?? 0) > max)
            .map((p) => ({ permissionId: p.id, role: roleSoglia }));
          if (changes.length === 0) continue;
          const falliti = drive.changePermissionRoles(targetId, changes);
          declassati += changes.length - falliti.length;
          for (const fallito of falliti) {
            logger.warn(`RIDUCI_PERMESSI: ${targetId}/${fallito.permissionId} — ${fallito.errore}`);
          }
        } catch (error) {
          const messaggio = error instanceof Error ? error.message : String(error);
          logger.warn(`RIDUCI_PERMESSI: ${targetId} non elaborato — ${messaggio}`);
        }
      }
      return declassati;
    },

    /** Read-only: runs the validator (optionally over a table subset) and reports the violation count. */
    VALIDA_DB: (azione) => {
      if (validator === undefined) {
        logger.warn('AZIONE VALIDA_DB: servizio di validazione non disponibile — saltata');
        return 0;
      }
      const esito = validator.esegui(azione.tabelle);
      logger.info(`VALIDA_DB: ${esito.violazioni.length} violazioni — report ${esito.nome}`);
      return esito.violazioni.length;
    },

    VERIFICA_EMAIL_INVIATE: (azione) => {
      if (bounces === undefined) {
        logger.warn('AZIONE VERIFICA_EMAIL_INVIATE: servizio non disponibile — saltata');
        return 0;
      }
      const f: BounceFilters = {};
      if (azione.daTimestamp !== undefined)
        f.da = parseTimestampIt('daTimestamp', azione.daTimestamp);
      if (azione.aTimestamp !== undefined) f.a = parseTimestampIt('aTimestamp', azione.aTimestamp);
      if (azione.lookbackGiorni !== undefined) f.lookbackGiorni = azione.lookbackGiorni;
      if (azione.pattern !== undefined) {
        f.patterns = Array.isArray(azione.pattern) ? azione.pattern : [azione.pattern];
      }
      return bounces.riconcilia(f).riconciliati;
    }
  };
}
