import type { Azione, AzioneHandler, PostProcessDb } from './standaloneActions';
import { csvValues } from './standaloneActions';
import type { IDriveFacade, PermissionGrant } from '../../infrastructure/facades/DriveServiceFacade';
import { DRIVE_ROLE_BY_PERMESSO } from '../../infrastructure/facades/DriveServiceFacade';
import type { IRoleResolver } from './documentSteps';
import type { Cdu } from '../context-engine/Cdu';
import type { StoricoDocumentiService } from '../storico/StoricoDocumentiService';
import { TABLE } from '../../config/schema';
import { ConfigurationError } from '../../domain/errors/DomainError';

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
  logger: LoggerService;
}

/**
 * The infra half of the azioni grammar: action types that touch Drive or run a
 * service, supplied to `eseguiAzioni` as `handlers` (the DB-only types stay
 * built in). Every handler is idempotent by construction — it computes the
 * delta between the configured state and the live one and writes only that —
 * so a resumed or re-run job repeats no work.
 */
export function creaHandlersInfra(deps: AzioniInfraDeps): Record<string, AzioneHandler> {
  const { db, drive, roles, cdu, storico, validator, logger } = deps;

  /** Rows of LOG_DOCS/LOG_FOLD matching `criteri`: CSV columns by containment, PATH by prefix, everything else by equality. */
  function selezionaId(azione: Azione, criteri: Record<string, string>): string[] {
    const tab = azione.su ?? TABLE.LOG_DOCS;
    if (tab !== TABLE.LOG_DOCS && tab !== TABLE.LOG_FOLD) {
      throw new ConfigurationError(`AZIONE ${azione.tipo}: "su" deve essere LOG_DOCS o LOG_FOLD, non ${tab}`);
    }
    const table = db.tables[tab];
    if (table === undefined) return [];
    const entries = Object.entries(criteri);
    return table
      .getAllRows()
      .filter((row) =>
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
      )
      .map((row) => cellString(row['ID']))
      .filter((id) => id !== '');
  }

  /** Current-year targets plus, when `profondita` > 0, the matching historical LOG_DOCS ids. */
  function targetIds(azione: Azione, criteri: Record<string, string>): string[] {
    const correnti = selezionaId(azione, criteri);
    const profondita = azione.profondita ?? 0;
    if (profondita <= 0 || storico === undefined) return correnti;
    // StoricoDocumentiService only understands LOG_DOCS metadata criteria; PATH
    // is a current-year folder-tree concept and is dropped for the history scan.
    const storiciCriteri = Object.fromEntries(Object.entries(criteri).filter(([col]) => col !== 'PATH'));
    return [...new Set([...correnti, ...storico.idsMatching(storiciCriteri, profondita)])];
  }

  function destinatari(azione: Azione): string[] {
    if (azione.ruolo !== undefined && azione.ruolo.trim() !== '') {
      return roles.risolvi(azione.ruolo, cdu).map((email) => email.value);
    }
    return (azione.emails ?? []).filter((email) => email.trim() !== '');
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
      const role = DRIVE_ROLE_BY_PERMESSO[permesso] ?? 'reader';
      const emails = destinatari(azione);
      if (emails.length === 0) return 0;
      const grants: PermissionGrant[] = [];
      let cambiati = 0;
      for (const targetId of targetIds(azione, criteri)) {
        const attuali = new Map(
          drive
            .listPermissions(targetId)
            .filter((p) => p.email !== null)
            .map((p) => [p.email!, p])
        );
        const changes: Array<{ permissionId: string; role: string }> = [];
        for (const email of emails) {
          const attuale = attuali.get(email);
          if (attuale === undefined) {
            grants.push({ targetId, email, permesso });
            continue;
          }
          if (attuale.role === role || RANK[attuale.role] === undefined) continue;
          changes.push({ permissionId: attuale.id, role });
        }
        if (changes.length === 0) continue;
        const falliti = drive.changePermissionRoles(targetId, changes);
        cambiati += changes.length - falliti.length;
        for (const fallito of falliti) {
          logger.warn(`AGGIORNA_PERMESSI: ${targetId}/${fallito.permissionId} — ${fallito.errore}`);
        }
      }
      // One shareWithUsers call per targetId+permesso pair, batched by the facade.
      if (grants.length > 0) drive.setPermissions(grants);
      return grants.length + cambiati;
    },

    /** Caps every ACL at `soglia` (default LETTURA) on the selected targets — writer/commenter -> reader. */
    RIDUCI_PERMESSI: (azione, criteri) => {
      const soglia = azione.soglia ?? 'LETTURA';
      const roleSoglia = DRIVE_ROLE_BY_PERMESSO[soglia] ?? 'reader';
      const max = RANK[roleSoglia] ?? 1;
      let declassati = 0;
      for (const targetId of targetIds(azione, criteri)) {
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
    }
  };
}
