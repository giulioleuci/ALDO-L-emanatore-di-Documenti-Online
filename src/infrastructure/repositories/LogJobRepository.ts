import { LogJob } from '../../domain/entities/LogJob';
import { StatoJob } from '../../domain/value-objects/enums';
import type {
  ILogJobRepository,
  LogJobEntryInput
} from '../../domain/repositories/ILogJobRepository';
import { TABLE, COL_LOG_JOB } from '../../config/schema';

/** Sheets single-cell cap is ~50KB (ref NEW_TABLE_LOG_JOB.md); truncate JSON with headroom for the marker entry. */
const LISTA_FALLIMENTI_CAP = 45_000;

function truncateFallimenti(list: string[]): string {
  const full = JSON.stringify(list);
  if (full.length <= LISTA_FALLIMENTI_CAP) return full;
  const kept = [...list];
  let json = JSON.stringify([...kept, '… troncato']);
  while (kept.length > 0 && json.length > LISTA_FALLIMENTI_CAP) {
    kept.pop();
    json = JSON.stringify([...kept, `… troncato (${list.length - kept.length} in più)`]);
  }
  return json;
}

/**
 * LOG_JOB repository on the DomainRepositoryLib Repository base
 * (SPECS_ALDO/NEW_TABLE_LOG_JOB.md). Composite PK (ID_JOB, ESECUZIONE);
 * append-only. TIPO and ID_JOB get hot-lookup indexes (same seam as
 * LogEmailRepository's PATTERN index) since `listByType`/`getById` are the
 * two read paths the spec calls out as needed by a future job-history view.
 */
export class LogJobRepository extends Repository<LogJob> implements ILogJobRepository {
  constructor(database: RepositoryDatabase) {
    super(database, TABLE.LOG_JOB, LogJob);
    database.tables[TABLE.LOG_JOB]!.createIndex(COL_LOG_JOB.TIPO);
    database.tables[TABLE.LOG_JOB]!.createIndex(COL_LOG_JOB.ID_JOB);
  }

  append(entry: LogJobEntryInput): LogJob {
    const log = LogJob.fromData({
      [COL_LOG_JOB.ID_JOB]: entry.idJob,
      [COL_LOG_JOB.ESECUZIONE]: entry.esecuzione,
      [COL_LOG_JOB.TIPO]: entry.tipo,
      [COL_LOG_JOB.ID_CONFIG]: entry.idConfig,
      [COL_LOG_JOB.NOME_CONFIG]: entry.nomeConfig,
      [COL_LOG_JOB.STATO]: entry.stato,
      [COL_LOG_JOB.TOTALE_TASK]: entry.totaleTask,
      [COL_LOG_JOB.COMPLETATI_OK]: entry.completatiOk,
      [COL_LOG_JOB.FALLITI]: entry.falliti,
      [COL_LOG_JOB.LISTA_FALLIMENTI]: truncateFallimenti(entry.listaFallimenti),
      [COL_LOG_JOB.DURATA_SEC]: entry.durataSec,
      [COL_LOG_JOB.INIZIO]: entry.inizio,
      [COL_LOG_JOB.FINE]: entry.fine,
      [COL_LOG_JOB.ESEGUITO_DA]: entry.eseguitoDa
    });
    this.database.tables[TABLE.LOG_JOB]!.insertRow(log.toData());
    this.database.save();
    return log;
  }

  listByType(tipo: string): LogJob[] {
    const hits = this.database.tables[TABLE.LOG_JOB]!.indexedLookup(COL_LOG_JOB.TIPO, tipo);
    if (hits !== null) return hits.map((row) => LogJob.fromData(row));
    return this.findAll().filter((j) => j.tipo === tipo);
  }

  getById(idJob: string): LogJob[] {
    const hits = this.database.tables[TABLE.LOG_JOB]!.indexedLookup(COL_LOG_JOB.ID_JOB, idJob);
    const rows =
      hits !== null
        ? hits.map((row) => LogJob.fromData(row))
        : this.findAll().filter((j) => j.idJob === idJob);
    return rows.sort((a, b) => a.esecuzione - b.esecuzione);
  }

  getFailuresSince(dataIsoInclusive: string): LogJob[] {
    return this.findAll().filter((j) => {
      const isFailure = j.stato === StatoJob.FALLITO || j.stato === StatoJob.COMPLETATO_CON_ERRORI;
      if (!isFailure) return false;
      const when = j.fine || j.inizio;
      return when >= dataIsoInclusive;
    });
  }
}
