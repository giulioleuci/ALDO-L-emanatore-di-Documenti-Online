import type { LogJob } from '../entities/LogJob';
import type { StatoJob } from '../value-objects/enums';

export interface LogJobEntryInput {
  idJob: string;
  esecuzione: number;
  tipo: string;
  idConfig: string;
  nomeConfig: string;
  stato: StatoJob;
  totaleTask: number;
  completatiOk: number;
  falliti: number;
  listaFallimenti: string[];
  durataSec: number;
  inizio: string;
  fine: string;
  eseguitoDa: string;
}

export interface ILogJobRepository {
  /** Appends one execution-window row (ID_JOB+ESECUZIONE composite PK). Truncates LISTA_FALLIMENTI if oversized (ref NEW_TABLE_LOG_JOB.md). */
  append(entry: LogJobEntryInput): LogJob;
  /** Every row for a job type, across all ID_JOB/ESECUZIONE. */
  listByType(tipo: string): LogJob[];
  /** Every row for one ID_JOB, across all resumes — the job's full timeline. */
  getById(idJob: string): LogJob[];
  /** Rows whose FINE (or INIZIO, if FINE is empty) is >= dataIsoInclusive and whose STATO is FALLITO or COMPLETATO_CON_ERRORI. */
  getFailuresSince(dataIsoInclusive: string): LogJob[];
}
