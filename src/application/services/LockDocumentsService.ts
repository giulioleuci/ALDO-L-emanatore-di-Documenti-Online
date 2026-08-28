import type { ILogDocumentoRepository } from '../../domain/repositories/ILogDocumentoRepository';
import type { IDriveFacade } from '../../infrastructure/facades/DriveServiceFacade';

// Only 'writer' is downgraded. 'owner'/'organizer' are deliberately left alone:
// Drive rejects downgrading them and they keep full access regardless.
const RUOLO_SCRITTURA = 'writer';
const RUOLO_LETTURA = 'reader';

// Progress-logging cadence for bloccaTutti()'s unbounded loop: with hundreds+
// of LOG_DOCS rows this run can exceed the GAS execution cap. It's safely
// re-runnable (already-processed files have no writer permissions left, so a
// re-run skips them), but a periodic log line gives the GAS execution
// transcript itself as an audit trail if the run is killed mid-way.
const INTERVALLO_LOG_PROGRESSO = 25;

export interface LockOutcome {
  totaleDocumenti: number;
  documentiModificati: number;
  permessiDeclassati: number;
  falliti: Array<{ fileId: string; permissionId: string | null; errore: string }>;
}

export interface LockDocumentsDeps {
  logDocs: ILogDocumentoRepository;
  drive: IDriveFacade;
  logger?: LoggerService;
}

/**
 * Feature 3: downgrades every write permission to read on every document
 * registered in LOG_DOCS for the current school year.
 *
 * Irreversible from inside the system — permissions can only be restored
 * manually by the Drive owner — so the menu wrapper demands a typed
 * confirmation, and every change is logged for the audit trail. Failure
 * isolation is per file AND per permission: one unreadable file never stops
 * the run.
 */
export class LockDocumentsService {
  private readonly logger: LoggerService;

  constructor(private readonly deps: LockDocumentsDeps) {
    this.logger = deps.logger ?? new LoggerService();
  }

  bloccaTutti(): LockOutcome {
    const documenti = this.deps.logDocs.findAll();
    const esito: LockOutcome = {
      totaleDocumenti: documenti.length,
      documentiModificati: 0,
      permessiDeclassati: 0,
      falliti: []
    };

    let indice = 0;
    for (const documento of documenti) {
      indice += 1;
      if (indice % INTERVALLO_LOG_PROGRESSO === 0) {
        this.logger.info(`Blocco documenti: elaborati ${indice}/${documenti.length}`);
      }
      const fileId = documento.id;
      if (fileId === null || fileId === '') continue;
      try {
        const permessi = this.deps.drive.listPermissions(fileId);
        const daDeclassare = permessi.filter((p) => p.role === RUOLO_SCRITTURA);
        if (daDeclassare.length === 0) continue;

        const falliti = this.deps.drive.changePermissionRoles(
          fileId,
          daDeclassare.map((p) => ({ permissionId: p.id, role: RUOLO_LETTURA }))
        );
        const riusciti = daDeclassare.length - falliti.length;
        if (riusciti > 0) {
          esito.documentiModificati += 1;
          esito.permessiDeclassati += riusciti;
          this.logger.info(
            `Blocco documenti: ${fileId} — ${riusciti} permessi da scrittura a lettura`
          );
        }
        for (const fallito of falliti) {
          esito.falliti.push({ fileId, permissionId: fallito.permissionId, errore: fallito.errore });
          this.logger.warn(
            `Blocco documenti: ${fileId}/${fallito.permissionId} non declassato — ${fallito.errore}`
          );
        }
      } catch (error) {
        const messaggio = error instanceof Error ? error.message : String(error);
        esito.falliti.push({ fileId, permissionId: null, errore: messaggio });
        this.logger.warn(`Blocco documenti: ${fileId} non elaborato — ${messaggio}`);
      }
    }
    return esito;
  }
}
