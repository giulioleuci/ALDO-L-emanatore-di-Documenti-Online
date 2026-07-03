import { AnnoScolastico } from '../value-objects/AnnoScolastico';
import { COL_MASTER } from '../../config/schema';

export interface MasterConfigData {
  [key: string]: unknown;
}

/**
 * A Master Sheet row (PK = ANNO_SCOLASTICO, ref 01 §0). Maps a school year to
 * its physical year database (spreadsheet + Drive root), the head teacher, and
 * the optional BCC supervisor. The source of truth that replaces PropertiesService
 * for SPREADSHEET_ID.
 */
export class MasterConfig extends Entity {
  public readonly annoScolasticoRaw: string;
  public readonly idSpreadsheet: string;
  public readonly idCartellaRoot: string;
  public readonly dirigente: string;
  public readonly supervisoreEmail: string;

  constructor(data: MasterConfigData = {}) {
    super(data);
    this.annoScolasticoRaw = typeof data[COL_MASTER.ANNO_SCOLASTICO] === 'string' ? (data[COL_MASTER.ANNO_SCOLASTICO] as string) : '';
    this.idSpreadsheet = typeof data[COL_MASTER.ID_SPREADSHEET] === 'string' ? (data[COL_MASTER.ID_SPREADSHEET] as string) : '';
    this.idCartellaRoot = typeof data[COL_MASTER.ID_CARTELLA_GOOGLE] === 'string' ? (data[COL_MASTER.ID_CARTELLA_GOOGLE] as string) : '';
    this.dirigente = typeof data[COL_MASTER.DIRIGENTE_SCOLASTICO] === 'string' ? (data[COL_MASTER.DIRIGENTE_SCOLASTICO] as string) : '';
    this.supervisoreEmail = typeof data[COL_MASTER.SUPERVISORE_EMAIL] === 'string' ? (data[COL_MASTER.SUPERVISORE_EMAIL] as string) : '';
    this.id = this.annoScolasticoRaw || null;
  }

  get annoScolastico(): AnnoScolastico { return AnnoScolastico.of(this.annoScolasticoRaw); }

  /** True when a BCC supervisor address is configured (ref 01 §0, 11 Step 4). */
  hasSupervisore(): boolean { return this.supervisoreEmail.trim().length > 0; }

  override toData(): EntityData {
    return {
      [COL_MASTER.ANNO_SCOLASTICO]: this.annoScolasticoRaw,
      [COL_MASTER.ID_SPREADSHEET]: this.idSpreadsheet,
      [COL_MASTER.ID_CARTELLA_GOOGLE]: this.idCartellaRoot,
      [COL_MASTER.DIRIGENTE_SCOLASTICO]: this.dirigente,
      [COL_MASTER.SUPERVISORE_EMAIL]: this.supervisoreEmail
    };
  }

  static fromData(data: MasterConfigData): MasterConfig {
    return new MasterConfig(data);
  }
}
