import type { MateriaId } from '../value-objects/MateriaId';
import type { ValoreCarenza } from '../value-objects/ValoreCarenza';
import { COL_CARENZE } from '../../config/schema';
import { AldoEntity } from './AldoEntity';

/**
 * CARENZE row. Matrice studente × data: oltre alle colonne fisse sotto, la
 * tabella porta una colonna dinamica per ogni materia (siglata, es. `MAT`),
 * più le colonne riservate all'utente con prefisso `_`. Tipo volutamente
 * aperto; il valore di ogni cella-materia è letto da CarenzaRepository via
 * {@link Carenza.getCella}, che possiede la mappa delle colonne dinamiche.
 *
 * Colonne fisse (01 §CARENZE): STUDENTE, PROGRESSIVO, CLASSE, DATA,
 * NOTIFICATO, ASSENZE, NOTE, DATA_MODIFICA.
 */
export type CarenzaData = Record<string, unknown>;

/**
 * CARENZE entity — a single matrix row (student × date) of shortfalls, with
 * dynamic per-subject columns. Composite PK (STUDENTE, PROGRESSIVO); no
 * single-column id (ref 01/04 §11). Part of the Alunno aggregate. Per-subject
 * cell resolution is done by CarenzaRepository, which owns the dynamic column
 * map; this entity retains its raw row so the repository can read those cells.
 */
export class Carenza extends AldoEntity {
  public readonly studente: string;
  public readonly progressivo: number;
  public readonly classe: string;
  public readonly data: string;
  private notificato: string;
  private readonly assenze: boolean;
  private readonly raw: Record<string, unknown>;

  constructor(data: CarenzaData = {}) {
    super(data);
    this.raw = { ...data };
    this.studente =
      typeof data[COL_CARENZE.STUDENTE] === 'string' ? (data[COL_CARENZE.STUDENTE] as string) : '';
    this.progressivo =
      typeof data[COL_CARENZE.PROGRESSIVO] === 'number'
        ? (data[COL_CARENZE.PROGRESSIVO] as number)
        : 0;
    this.classe =
      typeof data[COL_CARENZE.CLASSE] === 'string' ? (data[COL_CARENZE.CLASSE] as string) : '';
    this.data =
      typeof data[COL_CARENZE.DATA] === 'string' ? (data[COL_CARENZE.DATA] as string) : '';
    this.notificato =
      typeof data[COL_CARENZE.NOTIFICATO] === 'string'
        ? (data[COL_CARENZE.NOTIFICATO] as string)
        : '';
    this.assenze = data[COL_CARENZE.ASSENZE] === true;
    this.id = this.studente && this.progressivo ? `${this.studente}::${this.progressivo}` : null;
  }

  /** Raw value of a (possibly dynamic) column — used by the repository for matrix cells. */
  getCella(colonna: string): unknown {
    return this.raw[colonna];
  }

  isNotificato(): boolean {
    return this.notificato.trim().length > 0;
  }

  getNotificato(): Date | null {
    if (!this.isNotificato()) return null;
    const d = new Date(this.notificato);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  hasAssenzeElevate(): boolean {
    return this.assenze;
  }

  /** Free-text NOTE cell (ref 01, 02 §4.3); '' when absent. */
  getNote(): string {
    return typeof this.raw[COL_CARENZE.NOTE] === 'string'
      ? (this.raw[COL_CARENZE.NOTE] as string)
      : '';
  }

  /** Number of subjects with a shortfall in the map supplied by the repository (ref 04 §11). */
  getNumeroCarenze(carenzePerMateria: Map<MateriaId, ValoreCarenza>): number {
    return carenzePerMateria.size;
  }

  hasCarenzaMateria(materia: MateriaId, carenzePerMateria: Map<MateriaId, ValoreCarenza>): boolean {
    for (const m of carenzePerMateria.keys()) {
      if (m.equals(materia)) return true;
    }
    return false;
  }

  /** Stamps NOTIFICATO with the current timestamp and marks the entity dirty (ref 04 §11). */
  notifica(): void {
    this.notificato = new Date().toISOString();
    this.raw[COL_CARENZE.NOTIFICATO] = this.notificato;
    this.markDirty(COL_CARENZE.NOTIFICATO);
  }

  override toData(): EntityData {
    return { ...this.raw, [COL_CARENZE.NOTIFICATO]: this.notificato };
  }

  static fromData(data: Record<string, unknown>): Carenza {
    return new Carenza(data);
  }
}
