import { LogCartella } from '../entities/LogCartella';
import { LogDocumento } from '../entities/LogDocumento';
import { StatoDocumento } from '../value-objects/enums';
import { Specification } from './Specification';

export type EntitaSorgente = 'documenti' | 'cartelle';

type ModalitaCsv = 'any' | 'all';
type FiltriComuni = {
  csv?: ModalitaCsv;
  classi?: string[];
  utenti?: string[];
  materie?: string[];
};
type FiltriDocumenti = FiltriComuni & {
  tipo?: string;
  stato?: StatoDocumento;
  sottotipo?: string;
  idGen?: string;
  idOrig?: string;
  notificato?: boolean;
};
type FiltriCartelle = FiltriComuni & {
  idGen?: string;
  nome?: string;
  path?: string;
};

export type FiltriSorgente = (FiltriDocumenti | FiltriCartelle) & {
  not?: FiltriDocumenti | FiltriCartelle;
};

type Oggetto = Record<string, unknown>;

const CAMPI_COMUNI = ['csv', 'classi', 'utenti', 'materie', 'not'] as const;
const CAMPI_DOCUMENTI = ['tipo', 'stato', 'sottotipo', 'idGen', 'idOrig', 'notificato'] as const;
const CAMPI_CARTELLE = ['idGen', 'nome', 'path'] as const;
const CAMPI_CSV = ['classi', 'utenti', 'materie'] as const;
const STATI_DOCUMENTO = Object.values(StatoDocumento) as string[];

class PredicateSpecification<T> extends Specification<T> {
  constructor(private readonly predicate: (candidate: T) => boolean) {
    super();
  }

  isSatisfiedBy(candidate: T): boolean {
    return this.predicate(candidate);
  }

  toQueryObject(): null {
    return null;
  }
}

function isPlainObject(value: unknown): value is Oggetto {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function allowedKeys(entita: EntitaSorgente, nested: boolean): readonly string[] {
  const specifici = entita === 'documenti' ? CAMPI_DOCUMENTI : CAMPI_CARTELLE;
  return nested ? [...specifici, ...CAMPI_CSV] : [...specifici, ...CAMPI_COMUNI];
}

function parseCriteria(
  raw: Oggetto,
  entita: EntitaSorgente,
  nested: boolean,
  errori: string[],
  path = ''
): FiltriDocumenti | FiltriCartelle {
  const result: Oggetto = {};
  const allowed = allowedKeys(entita, nested);

  for (const key of Object.keys(raw)) {
    const keyPath = `${path}${key}`;
    if (!allowed.includes(key)) {
      errori.push(`Chiave filtro non ammessa: ${keyPath}`);
      continue;
    }

    const value = raw[key];
    if (key === 'csv') {
      if (value !== 'any' && value !== 'all') errori.push(`Valore non valido per ${keyPath}`);
      else result.csv = value;
      continue;
    }
    if (key === 'not') {
      if (!isPlainObject(value)) {
        errori.push(`Valore non valido per ${keyPath}`);
      } else {
        result.not = parseCriteria(value, entita, true, errori, 'not.');
      }
      continue;
    }
    if ((CAMPI_CSV as readonly string[]).includes(key)) {
      const values = typeof value === 'string' ? [value] : value;
      if (
        !Array.isArray(values) ||
        values.length === 0 ||
        values.some((item) => typeof item !== 'string')
      ) {
        errori.push(`Valore non valido per ${keyPath}`);
      } else {
        result[key] = values;
      }
      continue;
    }
    if (key === 'notificato') {
      if (typeof value !== 'boolean') errori.push(`Valore non valido per ${keyPath}`);
      else result.notificato = value;
      continue;
    }
    if (key === 'stato') {
      if (typeof value !== 'string' || !STATI_DOCUMENTO.includes(value)) {
        errori.push(`Valore non valido per ${keyPath}`);
      } else {
        result.stato = value;
      }
      continue;
    }
    if (typeof value !== 'string') errori.push(`Valore non valido per ${keyPath}`);
    else result[key] = value;
  }

  return result;
}

export function parseFiltriSorgente(
  raw: unknown,
  entita: EntitaSorgente
): { filtri?: FiltriSorgente | undefined; errori: string[] } {
  if (raw === undefined) return { filtri: undefined, errori: [] };
  if (!isPlainObject(raw))
    return { filtri: undefined, errori: ['filtri deve essere un oggetto plain'] };
  if (Object.keys(raw).length === 0) return { filtri: undefined, errori: [] };

  const errori: string[] = [];
  const filtri = parseCriteria(raw, entita, false, errori) as FiltriSorgente;
  return errori.length > 0 ? { filtri: undefined, errori } : { filtri, errori };
}

function combine<T>(criteria: Specification<T>[]): Specification<T> {
  return criteria.reduce<Specification<T>>(
    (combined, criterion) => combined.and(criterion) as Specification<T>,
    new PredicateSpecification<T>(() => true)
  );
}

function matchesCsv(
  filter: string[],
  candidateContains: (value: string) => boolean,
  csv: ModalitaCsv
): boolean {
  return csv === 'all'
    ? filter.every((value) => candidateContains(value))
    : filter.some((value) => candidateContains(value));
}

function documentCriteria(
  filtri: FiltriDocumenti | FiltriCartelle,
  csvMode = filtri.csv ?? 'any'
): Specification<LogDocumento>[] {
  const documenti = filtri as FiltriDocumenti;
  const criteria: Specification<LogDocumento>[] = [];
  if (documenti.tipo !== undefined)
    criteria.push(new PredicateSpecification((item) => item.tipo === documenti.tipo));
  if (documenti.stato !== undefined)
    criteria.push(new PredicateSpecification((item) => item.getStato() === documenti.stato));
  if (documenti.sottotipo !== undefined)
    criteria.push(
      new PredicateSpecification((item) => item.getSottotipo() === documenti.sottotipo)
    );
  if (documenti.idGen !== undefined)
    criteria.push(new PredicateSpecification((item) => item.idGen === documenti.idGen));
  if (documenti.idOrig !== undefined)
    criteria.push(new PredicateSpecification((item) => item.getIdOrig() === documenti.idOrig));
  if (documenti.notificato !== undefined)
    criteria.push(
      new PredicateSpecification((item) => item.isNotificato() === documenti.notificato)
    );
  if (documenti.classi)
    criteria.push(
      new PredicateSpecification((item) =>
        matchesCsv(documenti.classi!, (value) => item.containsClasse(value), csvMode)
      )
    );
  if (documenti.utenti)
    criteria.push(
      new PredicateSpecification((item) =>
        matchesCsv(documenti.utenti!, (value) => item.containsUtente(value), csvMode)
      )
    );
  if (documenti.materie)
    criteria.push(
      new PredicateSpecification((item) =>
        matchesCsv(documenti.materie!, (value) => item.containsMateria(value), csvMode)
      )
    );
  return criteria;
}

function folderCriteria(
  filtri: FiltriDocumenti | FiltriCartelle,
  csvMode = filtri.csv ?? 'any'
): Specification<LogCartella>[] {
  const cartelle = filtri as FiltriCartelle;
  const criteria: Specification<LogCartella>[] = [];
  if (cartelle.idGen !== undefined)
    criteria.push(new PredicateSpecification((item) => item.tipo === cartelle.idGen));
  if (cartelle.nome !== undefined)
    criteria.push(new PredicateSpecification((item) => item.nome.includes(cartelle.nome!)));
  if (cartelle.path !== undefined)
    criteria.push(new PredicateSpecification((item) => item.getPath().includes(cartelle.path!)));
  if (cartelle.classi)
    criteria.push(
      new PredicateSpecification((item) =>
        matchesCsv(cartelle.classi!, (value) => item.containsClasse(value), csvMode)
      )
    );
  if (cartelle.utenti)
    criteria.push(
      new PredicateSpecification((item) =>
        matchesCsv(cartelle.utenti!, (value) => item.containsUtente(value), csvMode)
      )
    );
  if (cartelle.materie)
    criteria.push(
      new PredicateSpecification((item) =>
        matchesCsv(cartelle.materie!, (value) => item.containsMateria(value), csvMode)
      )
    );
  return criteria;
}

export function specDocumenti(filtri: FiltriSorgente): Specification<LogDocumento> {
  const criteria = documentCriteria(filtri);
  if (filtri.not)
    criteria.push(
      combine(
        documentCriteria(filtri.not, filtri.csv ?? 'any')
      ).not() as Specification<LogDocumento>
    );
  return combine(criteria);
}

export function specCartelle(filtri: FiltriSorgente): Specification<LogCartella> {
  const criteria = folderCriteria(filtri);
  if (filtri.not)
    criteria.push(
      combine(folderCriteria(filtri.not, filtri.csv ?? 'any')).not() as Specification<LogCartella>
    );
  return combine(criteria);
}
