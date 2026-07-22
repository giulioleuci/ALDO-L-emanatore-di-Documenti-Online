import type { IMasterSheetRepository } from '../../domain/repositories/IMasterSheetRepository';
import { SheetDbAdapter } from '../../infrastructure/db/SheetDbAdapter';

/** A prior school year and its (lazily opened) database. */
export interface AnnoStorico {
  anno: string;
  db: RepositoryDatabase;
}

/**
 * Seam over the prior-year databases (13 §1/§7). The Master Sheet records the
 * spreadsheet id of each past school year; this provider turns the top
 * `profondita` of them into open databases, most recent first. Injected so the
 * historical services are testable offline with fake year databases.
 */
export interface StoricoDatabaseProvider {
  anniStorici(profondita: number): AnnoStorico[];
}

/**
 * Production provider: reads the historical years from the Master Sheet and
 * opens each prior-year database through the same SheetDBLib→adapter stack as
 * the current year. Databases are opened lazily inside `anniStorici` and only
 * when the requested depth needs them.
 */
export class MasterStoricoDatabaseProvider implements StoricoDatabaseProvider {
  constructor(
    private readonly master: IMasterSheetRepository,
    private readonly logger: LoggerService
  ) {}

  anniStorici(profondita: number): AnnoStorico[] {
    if (profondita <= 0) return [];
    return this.master.findAnniStorici(profondita).map((config) => ({
      anno: config.annoScolasticoRaw,
      db: new SheetDbAdapter(
        new DatabaseService(
          config.idSpreadsheet,
          this.logger,
          ServiceFactory.getUtils(),
          ServiceFactory.getCacheService().getScriptCache()
        )
      )
    }));
  }
}
