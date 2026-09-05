import { StatoJob } from '../value-objects/enums';
import { COL_LOG_JOB } from '../../config/schema';
import { AldoEntity } from './AldoEntity';

export type LogJobData = {
  [COL_LOG_JOB.ID_JOB]?: string;
  [COL_LOG_JOB.ESECUZIONE]?: number;
  [COL_LOG_JOB.TIPO]?: string;
  [COL_LOG_JOB.ID_CONFIG]?: string;
  [COL_LOG_JOB.NOME_CONFIG]?: string;
  [COL_LOG_JOB.STATO]?: string;
  [COL_LOG_JOB.TOTALE_TASK]?: number;
  [COL_LOG_JOB.COMPLETATI_OK]?: number;
  [COL_LOG_JOB.FALLITI]?: number;
  [COL_LOG_JOB.LISTA_FALLIMENTI]?: string | null;
  [COL_LOG_JOB.DURATA_SEC]?: number;
  [COL_LOG_JOB.INIZIO]?: string;
  [COL_LOG_JOB.FINE]?: string;
  [COL_LOG_JOB.ESEGUITO_DA]?: string;
};

/**
 * LOG_JOB entity (SPECS_ALDO/NEW_TABLE_LOG_JOB.md) — append-only, one row per
 * job execution window. Composite PK (ID_JOB, ESECUZIONE): ESECUZIONE=0 is the
 * initial `start()`, N>0 is the N-th resume (trigger timeout or, for
 * EmailBatchService, a quota-suspend restart) — see `runCount` on each batch
 * service (ESECUZIONE = runCount - 1).
 */
export class LogJob extends AldoEntity {
  public readonly idJob: string;
  public readonly esecuzione: number;
  public readonly tipo: string;
  public readonly idConfig: string;
  public readonly nomeConfig: string;
  public readonly stato: StatoJob;
  public readonly totaleTask: number;
  public readonly completatiOk: number;
  public readonly falliti: number;
  private readonly listaFallimentiRaw: string | null;
  public readonly durataSec: number;
  public readonly inizio: string;
  public readonly fine: string;
  public readonly eseguitoDa: string;

  constructor(data: LogJobData = {}) {
    super(data);
    this.idJob =
      typeof data[COL_LOG_JOB.ID_JOB] === 'string' ? (data[COL_LOG_JOB.ID_JOB] as string) : '';
    this.esecuzione =
      typeof data[COL_LOG_JOB.ESECUZIONE] === 'number'
        ? (data[COL_LOG_JOB.ESECUZIONE] as number)
        : 0;
    this.tipo =
      typeof data[COL_LOG_JOB.TIPO] === 'string' ? (data[COL_LOG_JOB.TIPO] as string) : '';
    this.idConfig =
      typeof data[COL_LOG_JOB.ID_CONFIG] === 'string'
        ? (data[COL_LOG_JOB.ID_CONFIG] as string)
        : '';
    this.nomeConfig =
      typeof data[COL_LOG_JOB.NOME_CONFIG] === 'string'
        ? (data[COL_LOG_JOB.NOME_CONFIG] as string)
        : '';
    this.stato = (data[COL_LOG_JOB.STATO] as StatoJob) ?? StatoJob.COMPLETATO;
    this.totaleTask =
      typeof data[COL_LOG_JOB.TOTALE_TASK] === 'number'
        ? (data[COL_LOG_JOB.TOTALE_TASK] as number)
        : 0;
    this.completatiOk =
      typeof data[COL_LOG_JOB.COMPLETATI_OK] === 'number'
        ? (data[COL_LOG_JOB.COMPLETATI_OK] as number)
        : 0;
    this.falliti =
      typeof data[COL_LOG_JOB.FALLITI] === 'number' ? (data[COL_LOG_JOB.FALLITI] as number) : 0;
    this.listaFallimentiRaw =
      typeof data[COL_LOG_JOB.LISTA_FALLIMENTI] === 'string'
        ? (data[COL_LOG_JOB.LISTA_FALLIMENTI] as string)
        : null;
    this.durataSec =
      typeof data[COL_LOG_JOB.DURATA_SEC] === 'number'
        ? (data[COL_LOG_JOB.DURATA_SEC] as number)
        : 0;
    this.inizio =
      typeof data[COL_LOG_JOB.INIZIO] === 'string' ? (data[COL_LOG_JOB.INIZIO] as string) : '';
    this.fine =
      typeof data[COL_LOG_JOB.FINE] === 'string' ? (data[COL_LOG_JOB.FINE] as string) : '';
    this.eseguitoDa =
      typeof data[COL_LOG_JOB.ESEGUITO_DA] === 'string'
        ? (data[COL_LOG_JOB.ESEGUITO_DA] as string)
        : '';
    this.id = this.idJob ? `${this.idJob}::${this.esecuzione}` : null;
  }

  getListaFallimenti(): string[] {
    if (this.listaFallimentiRaw === null) return [];
    try {
      const parsed: unknown = JSON.parse(this.listaFallimentiRaw);
      return Array.isArray(parsed) ? (parsed as string[]) : [];
    } catch {
      return [];
    }
  }

  isSospeso(): boolean {
    return this.stato === StatoJob.SOSPESO_QUOTA || this.stato === StatoJob.SOSPESO_TEMPO;
  }

  override toData(): EntityData {
    return {
      [COL_LOG_JOB.ID_JOB]: this.idJob,
      [COL_LOG_JOB.ESECUZIONE]: this.esecuzione,
      [COL_LOG_JOB.TIPO]: this.tipo,
      [COL_LOG_JOB.ID_CONFIG]: this.idConfig,
      [COL_LOG_JOB.NOME_CONFIG]: this.nomeConfig,
      [COL_LOG_JOB.STATO]: this.stato,
      [COL_LOG_JOB.TOTALE_TASK]: this.totaleTask,
      [COL_LOG_JOB.COMPLETATI_OK]: this.completatiOk,
      [COL_LOG_JOB.FALLITI]: this.falliti,
      [COL_LOG_JOB.LISTA_FALLIMENTI]: this.listaFallimentiRaw,
      [COL_LOG_JOB.DURATA_SEC]: this.durataSec,
      [COL_LOG_JOB.INIZIO]: this.inizio,
      [COL_LOG_JOB.FINE]: this.fine,
      [COL_LOG_JOB.ESEGUITO_DA]: this.eseguitoDa
    };
  }

  static fromData(data: Record<string, unknown>): LogJob {
    return new LogJob(data);
  }
}
