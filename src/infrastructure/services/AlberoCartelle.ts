import type { IDriveFacade } from '../facades/DriveServiceFacade';
import type { IDatabase, Row } from '../db/Database';
import { TABLE, COL_LOG_FOLD } from '../../config/schema';

export interface FindOrCreateOptions {
  classe?: string;
  utente?: string;
  tipo?: string;
  nome?: string;
}

export interface CartellaResult {
  folderId: string;
  created: boolean;
}

/**
 * AlberoCartelle (14 §4): findOrCreate for the Drive folder tree. Checks the
 * LOG_FOLD audit trail first (the cache that prevents duplicate folders and
 * cuts Drive API calls), then the Drive facade, and only creates + registers a
 * folder when neither knows it. The LOG_FOLD insert does NOT call `save()`:
 * inside the document pipeline the service owns the transaction (SheetDBLib
 * forbids save() while one is open); a standalone caller commits itself.
 */
export class AlberoCartelle {
  constructor(
    private readonly drive: IDriveFacade,
    private readonly db: IDatabase
  ) {}

  findOrCreate(path: string, options: FindOrCreateOptions = {}): CartellaResult {
    const logged = this.db.table(TABLE.LOG_FOLD).find((r) => this.matches(r, path, options));
    if (logged !== null) {
      return { folderId: String(logged[COL_LOG_FOLD.ID]), created: false };
    }
    const existing = this.drive.findFolderByPath(path);
    if (existing !== null) {
      return { folderId: existing, created: false };
    }
    const folderId = this.drive.createFolder(path);
    const row: Row = {
      [COL_LOG_FOLD.ID]: folderId,
      [COL_LOG_FOLD.PATH]: path,
      [COL_LOG_FOLD.LINK]: `https://drive.google.com/drive/folders/${folderId}`,
      [COL_LOG_FOLD.CLASSI]: options.classe ?? '',
      [COL_LOG_FOLD.UTENTI]: options.utente ?? ''
    };
    this.db.table(TABLE.LOG_FOLD).insert(row);
    return { folderId, created: true };
  }

  /** A LOG_FOLD row matches when PATH is equal and any given classe/utente is contained (CSV, 14 §4). */
  private matches(row: Row, path: string, options: FindOrCreateOptions): boolean {
    if (String(row[COL_LOG_FOLD.PATH]) !== path) return false;
    if (options.classe !== undefined && !csvContains(row[COL_LOG_FOLD.CLASSI], options.classe)) return false;
    if (options.utente !== undefined && !csvContains(row[COL_LOG_FOLD.UTENTI], options.utente)) return false;
    return true;
  }
}

function csvContains(raw: unknown, value: string): boolean {
  return typeof raw === 'string' && raw.split(',').map((s) => s.trim()).includes(value);
}
