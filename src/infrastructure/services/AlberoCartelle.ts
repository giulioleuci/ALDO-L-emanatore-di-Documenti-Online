import type { IDriveFacade } from '../facades/DriveServiceFacade';
import type { IDatabase, Row } from '../db/Database';
import { TABLE, COL_LOG_FOLD } from '../../config/schema';

interface FindOrCreateOptions {
  classi?: string;
  utenti?: string;
  materie?: string;
  classe?: string;
  utente?: string;
  tipo?: string;
  nome?: string;
}

interface CartellaResult {
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
    const table = this.db.table(TABLE.LOG_FOLD);
    const logged = table.find((r) => String(r[COL_LOG_FOLD.PATH]) === path);
    if (logged !== null) {
      const folderId = String(logged[COL_LOG_FOLD.ID]);
      this.upsertLog(table, folderId, path, options, logged);
      return { folderId, created: false };
    }
    const existing = this.drive.findFolderByPath(path);
    if (existing !== null) {
      this.upsertLog(
        table,
        existing,
        path,
        options,
        table.find((row) => String(row[COL_LOG_FOLD.ID]) === existing)
      );
      return { folderId: existing, created: false };
    }
    const folderId = this.drive.createFolder(path);
    this.upsertLog(table, folderId, path, options, null);
    return { folderId, created: true };
  }

  /** Writes the complete audit row and heals legacy rows while preserving known metadata. */
  private upsertLog(
    table: ReturnType<IDatabase['table']>,
    folderId: string,
    path: string,
    options: FindOrCreateOptions,
    current: Row | null
  ): void {
    const row: Row = {
      ...(current ?? {}),
      [COL_LOG_FOLD.ID]: folderId,
      [COL_LOG_FOLD.TIPO]: firstNonBlank(current?.[COL_LOG_FOLD.TIPO], options.tipo),
      [COL_LOG_FOLD.NOME]: firstNonBlank(
        current?.[COL_LOG_FOLD.NOME],
        options.nome,
        folderName(path)
      ),
      [COL_LOG_FOLD.PATH]: firstNonBlank(current?.[COL_LOG_FOLD.PATH], path),
      [COL_LOG_FOLD.LINK]: firstNonBlank(
        current?.[COL_LOG_FOLD.LINK],
        `https://drive.google.com/drive/folders/${folderId}`
      ),
      [COL_LOG_FOLD.CLASSI]: mergeCsv(current?.[COL_LOG_FOLD.CLASSI], options.classi ?? options.classe),
      [COL_LOG_FOLD.UTENTI]: mergeCsv(current?.[COL_LOG_FOLD.UTENTI], options.utenti ?? options.utente),
      [COL_LOG_FOLD.MATERIE]: mergeCsv(current?.[COL_LOG_FOLD.MATERIE], options.materie)
    };
    if (current === null) table.insert(row);
    else table.updateRowWhere({ [COL_LOG_FOLD.ID]: folderId }, row);
  }

}

function firstNonBlank(...values: Array<unknown>): string {
  for (const value of values) {
    if (typeof value === 'string' && value.trim() !== '') return value;
  }
  return '';
}

function folderName(path: string): string {
  const segments = path.split('/').filter((segment) => segment !== '');
  return segments[segments.length - 1] ?? '';
}

function mergeCsv(current: unknown, next: string | undefined): string {
  const values = typeof current === 'string' ? current.split(',').map((value) => value.trim()) : [];
  if (next !== undefined) values.push(...next.split(',').map((value) => value.trim()));
  return [...new Set(values.filter((value) => value !== ''))].join(',');
}
