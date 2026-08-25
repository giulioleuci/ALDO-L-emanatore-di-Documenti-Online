import { MateriaId } from '../value-objects/MateriaId';
import { EsameConfig } from '../value-objects/EsameConfig';
import { COL_MATERIE } from '../../config/schema';
import { AldoEntity } from './AldoEntity';

/**
 * MATERIE row. Tipo volutamente aperto in vista della futura funzionalità
 * MATERIE × INDIRIZZI (spec §8), che porterà colonne aggiuntive per indirizzo;
 * lo schema odierno (01 §MATERIE) è comunque fisso — vedi elenco sotto — e le
 * colonne riservate all'utente con prefisso `_` sono preservate come sempre.
 *
 * Colonne fisse (01 §MATERIE): ID, NOME, SINTESI, COLORE_1, COLORE_2, SIMBOLO,
 * ESAME_CFG, EVOLUZIONE, IS_RELIGIONE_ALT, PRINCIPALE, SPECIFICITA.
 */
export type MateriaData = Record<string, unknown>;

/** Default border colour when a MATERIA has no COLORE_1 (ref 11 §11). */
const DEFAULT_COLORE_1 = '#ddd';

/** MATERIE entity (PK = ID). Subject-catalogue lookup (ref 01, 04). */
export class Materia extends AldoEntity {
  public readonly sintesi: string;
  public readonly colore1: string;
  public readonly colore2: string;
  public readonly simbolo: string;
  public readonly isReligioneAlt: boolean;
  public readonly principale: string | null;
  public readonly specificita: string | null;
  private readonly rawNome: string;
  private readonly esameCfgRaw: string | null;
  private readonly evoluzioneRaw: string | null;

  constructor(data: MateriaData = {}) {
    super(data);
    const id = data[COL_MATERIE.ID];
    this.id = typeof id === 'string' ? id : null;
    const nome = data[COL_MATERIE.NOME];
    this.rawNome = typeof nome === 'string' ? nome : '';
    const sintesi = data[COL_MATERIE.SINTESI];
    this.sintesi = typeof sintesi === 'string' ? sintesi : '';
    const c1 = data[COL_MATERIE.COLORE_1];
    this.colore1 = typeof c1 === 'string' && c1.trim() !== '' ? c1 : DEFAULT_COLORE_1;
    const c2 = data[COL_MATERIE.COLORE_2];
    this.colore2 = typeof c2 === 'string' ? c2 : '';
    const sym = data[COL_MATERIE.SIMBOLO];
    this.simbolo = typeof sym === 'string' ? sym : '';
    this.isReligioneAlt = data[COL_MATERIE.IS_RELIGIONE_ALT] === true;
    const principale = data[COL_MATERIE.PRINCIPALE];
    this.principale = typeof principale === 'string' && principale !== '' ? principale : null;
    const specificita = data[COL_MATERIE.SPECIFICITA];
    this.specificita = typeof specificita === 'string' && specificita !== '' ? specificita : null;
    const raw = data[COL_MATERIE.ESAME_CFG];
    this.esameCfgRaw = typeof raw === 'string' ? raw : null;
    const evo = data[COL_MATERIE.EVOLUZIONE];
    this.evoluzioneRaw = typeof evo === 'string' ? evo : null;
  }

  /** Raw `NOME` cell if set; else `"PRINCIPALE (SPECIFICITA)"` when both are present; else empty. */
  get nome(): string {
    if (this.rawNome !== '') return this.rawNome;
    if (this.principale !== null && this.specificita !== null) {
      return `${this.principale} (${this.specificita})`;
    }
    return '';
  }

  get materiaId(): MateriaId {
    return MateriaId.of(this.id ?? '');
  }

  get esameConfig(): EsameConfig | null {
    return EsameConfig.fromJson(this.esameCfgRaw);
  }

  /**
   * MATERIE.EVOLUZIONE (13 §8): `{ "<SIGLA>": number[] }` mapping each historical
   * sigla to the course years it applied to (e.g. `{"GST":[1,2],"STO":[3,4,5]}`).
   * Empty when absent. Used to reconcile shortfall sigle across school years.
   */
  getEvoluzione(): Record<string, number[]> {
    if (this.evoluzioneRaw === null || this.evoluzioneRaw.trim() === '') return {};
    const parsed = JSON.parse(this.evoluzioneRaw) as Record<string, unknown>;
    const out: Record<string, number[]> = {};
    for (const [sigla, anni] of Object.entries(parsed)) {
      if (Array.isArray(anni)) out[sigla] = anni.filter((n): n is number => typeof n === 'number');
    }
    return out;
  }

  override toData(): EntityData {
    return {
      [COL_MATERIE.ID]: this.id,
      [COL_MATERIE.NOME]: this.rawNome,
      [COL_MATERIE.SINTESI]: this.sintesi,
      [COL_MATERIE.COLORE_1]: this.colore1,
      [COL_MATERIE.COLORE_2]: this.colore2,
      [COL_MATERIE.SIMBOLO]: this.simbolo,
      [COL_MATERIE.ESAME_CFG]: this.esameCfgRaw,
      [COL_MATERIE.EVOLUZIONE]: this.evoluzioneRaw,
      [COL_MATERIE.IS_RELIGIONE_ALT]: this.isReligioneAlt,
      [COL_MATERIE.PRINCIPALE]: this.principale ?? '',
      [COL_MATERIE.SPECIFICITA]: this.specificita ?? ''
    };
  }

  static fromData(data: Record<string, unknown>): Materia {
    return new Materia(data);
  }
}
