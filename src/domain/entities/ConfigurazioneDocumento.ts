import { FormatoOutput, GestioneArticolazione, GeneratoreAxis } from '../value-objects/enums';
import { COL_CONF_DOC } from '../../config/schema';
import { AldoEntity } from './AldoEntity';
import { ConfigurationError } from '../errors/DomainError';

/** The subset of PARAMETRI this entity's own constructor validates (spec §5.2.2) — typed narrowly so a
 * typo'd flag name is a compile error here, not a silently-ignored key. PARAMETRI also carries other,
 * generator-specific parameters (e.g. `sheetName`, `includiStorico`, `classiTarget`) read by individual
 * strategies/providers via the untyped `getParametri()` bag — those are intentionally out of this type. */
interface DocumentoParametriFlags {
  aggiungiMaterie?: boolean;
  aggiungiMaterieConPermessi?: boolean;
  tabelleImportate?: boolean;
  overwrite?: boolean;
}

export type ConfigurazioneDocumentoData = {
  [COL_CONF_DOC.ID]?: string;
  [COL_CONF_DOC.TIPO]?: string;
  [COL_CONF_DOC.GENERATORE]?: string;
  [COL_CONF_DOC.CONDIZIONE]?: string;
  [COL_CONF_DOC.MODELLI]?: string | null;
  [COL_CONF_DOC.FILE_NAME]?: unknown;
  [COL_CONF_DOC.PATH_OUT]?: unknown;
  [COL_CONF_DOC.DUPLICAZIONE]?: unknown;
  [COL_CONF_DOC.PERMESSI]?: string | null;
  [COL_CONF_DOC.POST_PROCESSO]?: unknown;
  [COL_CONF_DOC.PARAMETRI]?: string | null;
  [COL_CONF_DOC.GESTIONE_ARTICOLAZIONE]?: string;
  [COL_CONF_DOC.FORMATO]?: string;
  [COL_CONF_DOC.REGISTRA_DOC]?: unknown;
  [COL_CONF_DOC.REGISTRA_FOLD]?: unknown;
};

/**
 * CONF_DOC entity (PK = ID) — declarative definition of a generable document
 * type (ref 04, 06 §8). Aggregate Root correlated to LogDocumento/LogCartella.
 * Condition evaluation (shouldGenerate via ExpressionEngine) and conditional
 * MODELLI selection land with the ContextEngine/expression increment; here the
 * simple-form template id and the static config accessors are provided.
 */
export class ConfigurazioneDocumento extends AldoEntity {
  public readonly tipo: string;
  public readonly generatore: GeneratoreAxis;
  public readonly formato: FormatoOutput;
  public readonly gestioneArticolazione: GestioneArticolazione;
  private readonly modelliRaw: string | null;
  private readonly condizioneRaw: string;
  private readonly parametriRaw: string | null;
  private readonly permessiRaw: string | null;

  constructor(data: ConfigurazioneDocumentoData = {}) {
    super(data);
    this.id = typeof data[COL_CONF_DOC.ID] === 'string' ? (data[COL_CONF_DOC.ID] as string) : null;
    this.tipo =
      typeof data[COL_CONF_DOC.TIPO] === 'string' ? (data[COL_CONF_DOC.TIPO] as string) : '';
    const generatoreRaw = data[COL_CONF_DOC.GENERATORE];
    if (!Object.values(GeneratoreAxis).includes(generatoreRaw as GeneratoreAxis)) {
      throw new ConfigurationError(`CONF_DOC ${this.id ?? '?'}: GENERATORE non valido: ${String(generatoreRaw)}`);
    }
    this.generatore = generatoreRaw as GeneratoreAxis;
    const formatoRaw = data[COL_CONF_DOC.FORMATO];
    if (formatoRaw !== FormatoOutput.GDOC && formatoRaw !== FormatoOutput.GSHEET) {
      throw new ConfigurationError(`CONF_DOC ${this.id ?? '?'}: FORMATO non valido: ${String(formatoRaw)}`);
    }
    this.formato = formatoRaw;
    this.gestioneArticolazione =
      data[COL_CONF_DOC.GESTIONE_ARTICOLAZIONE] === GestioneArticolazione.ARTICOLATA
        ? GestioneArticolazione.ARTICOLATA
        : GestioneArticolazione.COMPLETA;
    this.modelliRaw =
      typeof data[COL_CONF_DOC.MODELLI] === 'string' ? (data[COL_CONF_DOC.MODELLI] as string) : null;
    this.condizioneRaw =
      typeof data[COL_CONF_DOC.CONDIZIONE] === 'string' ? (data[COL_CONF_DOC.CONDIZIONE] as string) : '';
    this.parametriRaw =
      typeof data[COL_CONF_DOC.PARAMETRI] === 'string' ? (data[COL_CONF_DOC.PARAMETRI] as string) : null;
    this.permessiRaw =
      typeof data[COL_CONF_DOC.PERMESSI] === 'string' ? (data[COL_CONF_DOC.PERMESSI] as string) : null;

    const parametri = this.getParametri() as DocumentoParametriFlags;
    const aggiungiMaterie = Boolean(parametri.aggiungiMaterie);
    const aggiungiMaterieConPermessi = Boolean(parametri.aggiungiMaterieConPermessi);
    if (this.formato === FormatoOutput.GSHEET && parametri.tabelleImportate === true) {
      throw new ConfigurationError("L'importazione tabelle è supportata unicamente su formato GDOC");
    }
    if (this.formato === FormatoOutput.GDOC && (aggiungiMaterie || aggiungiMaterieConPermessi)) {
      throw new ConfigurationError('Le colonne materie sono supportate unicamente su formato GSHEET');
    }
    if (
      (this.generatore === GeneratoreAxis.DIPARTIMENTO || this.generatore === GeneratoreAxis.DOCENTE) &&
      (aggiungiMaterie || aggiungiMaterieConPermessi)
    ) {
      throw new ConfigurationError(
        `Le colonne materie non sono applicabili all'asse ${this.generatore} (nessun consiglio di classe)`
      );
    }
    if (aggiungiMaterie && aggiungiMaterieConPermessi) {
      throw new ConfigurationError('aggiungiMaterie e aggiungiMaterieConPermessi sono mutuamente esclusivi');
    }
  }

  getCondizione(): string | null {
    return this.condizioneRaw.trim() === '' ? null : this.condizioneRaw;
  }

  /** True when no condition is set — the unconditional case (ref 06 §8). */
  hasNoCondizione(): boolean {
    return this.getCondizione() === null;
  }

  getParametri(): Record<string, unknown> {
    // A live Sheets round-trip never preserves an unset cell as `null` — it
    // comes back as `''` — so a bare `=== null` check lets that empty string
    // through into `JSON.parse('')`, which throws (same class of bug fixed
    // for CURRICULUM in `Alunno.getCurriculum` and for POST_PROCESSO/PERMESSI
    // via `hasJsonValue` in `postProcessActions.ts`).
    return this.parametriRaw === null || this.parametriRaw.trim() === ''
      ? {}
      : (JSON.parse(this.parametriRaw) as Record<string, unknown>);
  }

  /** Parsed CONF_DOC.PERMESSI; an unset Sheets cell is an empty configuration. */
  getPermessi(): Record<string, unknown> {
    return this.permessiRaw === null || this.permessiRaw.trim() === ''
      ? {}
      : (JSON.parse(this.permessiRaw) as Record<string, unknown>);
  }

  /** Reserved PARAMETRI.overwrite flag — skips the duplicate check (ref 01, 10 Step 2). */
  isOverwrite(): boolean {
    return (this.getParametri() as DocumentoParametriFlags).overwrite === true;
  }

  getModelli(): Record<string, unknown> {
    return this.modelliRaw === null ? {} : (JSON.parse(this.modelliRaw) as Record<string, unknown>);
  }

  /** Raw parsed MODELLI: the simple object form `{templateId}` or the conditional array. */
  getModelliJson(): unknown {
    return this.modelliRaw === null ? null : JSON.parse(this.modelliRaw);
  }

  /** Template id in the simple MODELLI form {"templateId": "..."}; null otherwise (ref 06 §8). */
  getTemplateIdSemplice(): string | null {
    const t = this.getModelli().templateId;
    return typeof t === 'string' && t.length > 0 ? t : null;
  }

  override toData(): EntityData {
    return {
      [COL_CONF_DOC.ID]: this.id,
      [COL_CONF_DOC.TIPO]: this.tipo,
      [COL_CONF_DOC.GENERATORE]: this.generatore,
      [COL_CONF_DOC.FORMATO]: this.formato,
      [COL_CONF_DOC.GESTIONE_ARTICOLAZIONE]: this.gestioneArticolazione,
      [COL_CONF_DOC.MODELLI]: this.modelliRaw,
      [COL_CONF_DOC.CONDIZIONE]: this.condizioneRaw,
      [COL_CONF_DOC.PARAMETRI]: this.parametriRaw,
      [COL_CONF_DOC.PERMESSI]: this.permessiRaw
    };
  }

  static fromData(data: Record<string, unknown>): ConfigurazioneDocumento {
    return new ConfigurazioneDocumento(data);
  }
}
