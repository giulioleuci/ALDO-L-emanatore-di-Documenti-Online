/**
 * Contesto Dati Unificato (CDU) — the aggregated context every document/email
 * operation reads from. Shape is the authoritative one described in
 * `SPECS_ALDO/02_CDU_STRUTTURA.md`; every access path used in templates, boxes
 * and expressions MUST correspond exactly to a path in this type.
 *
 * Sections other than `meta` are optional because a recipe activates only the
 * providers it needs (e.g. `focus.alunno` is absent in class-only recipes), so
 * the CDU is progressively filled as providers run. `tech` holds live entities
 * and is attached NON-enumerable (never serialized — see 02 §7).
 */

import type { LazyRef } from '../storico/LazyRef';
import type { AnnoAlunnoStorico } from '../storico/StoricoAlunniService';
import type { TipoPiano } from '../../domain/value-objects/enums';

/** Docente-in-CDC view model, shared by `focus.classe.consiglioDiClasse` and `focus.alunno.consiglioDiClasseFiltrato` (02 §4.1/§4.2). */
export interface DocenteCdcVM {
  anagrafica: { nome: string; cognome: string; email: string; genere: string; appellativo: string };
  materie: Array<{
    sigla: string;
    nome: string;
    colore: string;
    specificita: string | null;
    /** Assignment identity retained for downstream CDU consistency checks. */
    classeId?: string;
    kind?: string;
  }>;
  ruoli: {
    isCoordinatore: boolean;
    isTutorAsl: boolean;
    isTutorOrientamento: boolean;
    descrizione: string[];
  };
  stato: { isSupplente: boolean; sostituisce: { nome: string; email: string } | null };
  tipoArticolazione: 'COMUNE' | 'SEPARATO_PRIMO' | 'SEPARATO_SECONDO' | null;
  isITP: boolean;
  flags: { isNotLast: boolean };
}

/** Alunno-in-context view model inside `focus.classe.studenti.listaCompleta` (02 §4.1). */
export interface AlunnoContestoVM {
  anagrafica: { nomeCompleto: string; email: string };
  genitori: Array<{ email: string }>;
  status: { isBes: boolean; isRipetente: boolean; isRappresentante: boolean; religione: string };
  curriculum: Record<string, { specifiche: string[] }>;
  didattica: {
    carenze: {
      hasCarenze: boolean;
      numero: number;
      dettaglio: Array<{ materia: string; voto: string }>;
    };
    piani: { hasPiani: boolean; hasBes: boolean; items: Array<{ tipo: string; isBes: boolean }> };
    pcto: { oreCumulate: number };
  };
}

/** One row of `focus.alunno.didattica.pianiPersonalizzati.items` / `focus.classe.didattica.pianiPersonalizzati.items` (11 §11 new). */
export interface PianoPersonalizzatoItem {
  id?: string | undefined;
  nome: string;
  link: string;
  tipo: string;
  sottotipo: string;
  idGen: string;
  stato: string;
  dataCreazione: string;
  notificato: boolean;
  /** Only set by the classe-scoped provider — multiple students appear in one class-wide list. */
  studente?: { nomeCompleto: string; email: string };
}

export interface CduMeta {
  timestamp: string;
  idConfigurazione: string;
  tipoOperazione: string;
  idEsecuzione: string;
  date: {
    oggi: {
      breve: string;
      estesa: string;
      iso: string;
      giorno: string;
      mese: string;
      anno: string;
      ora: string;
    };
  };
  configurazioneBox?: {
    boxAttivi: string[];
    boxVuotiNascosti: string[];
    ordineVisualizzazione: string[];
  };
  parametriInput: {
    target: string;
    tipoTarget: 'classe' | 'alunno';
    materiaCorrente: string | null;
    opzioni: RecipeOptionsView;
  };
}

/** Snapshot of the recipe options copied into `meta.parametriInput.opzioni` (02 §2). */
export interface RecipeOptionsView {
  includiStorico: boolean;
  profonditaAnniStorico: number;
  profonditaAnniAsl: number;
  profonditaAnniDocumenti: number;
  includiSupplenti: boolean;
  includiSpecificita: boolean;
  notificaSoloCoordinatori: boolean;
  gestioneSupplenti: string;
  [key: string]: unknown;
}

export interface CduIstituto {
  organizzazione: { annoScolastico: string; dirigente: string };
  staff: { referenteBes: string; animatoreDigitale: string };
  statistiche?: { totaleClassi: number; totaleDocenti: number; totaleAlunni: number };
}

export interface CduClasse {
  anagrafica: {
    nome: string;
    anno: number;
    sezione: string;
    indirizzo: { nome: string; nomeSintetico: string; sigla: string; tipo: string };
  };
  flags: {
    isClassePrima: boolean;
    isTriennio: boolean;
    isPrimoBiennio: boolean;
    isTerminale: boolean;
    isArticolata: boolean;
  };
  articolazione?: {
    partner: string | null;
    partners: string[] | null;
    parent: string | null;
    materieCondivise: string[];
    materieSeparatePrimoGruppo: string[];
    materieSeparateSecondoGruppo: string[];
  };
  coordinatori?: Array<{ nome: string; email: string; materia: string; appellativo: string }>;
  tutor?: {
    asl: Array<{ nome: string; email: string }>;
    orientamento: Array<{ nome: string; email: string }>;
  };
  rappresentanti?: {
    studenti: Array<{ nomeCompleto: string; email: string }>;
    genitori: Array<{ nomeCompleto: string }>;
  };
  consiglioDiClasse?: DocenteCdcVM[];
  /** Sheet-expansion column list (MAT_NON_STANDARD) — built on demand by SheetMaterieConPermessiGeneratorStrategy, not a standard provider output. */
  elencoMaterieConPermessi?: import('./ElencoMaterieConPermessi').ElencoMateriaConPermessiVM[];
  studenti?: {
    listaCompleta: AlunnoContestoVM[];
    statistiche?: {
      totale: number;
      conPianiDidattici: number;
      conBes: number;
      conDsa: number;
      ripetenti: number;
      rappresentanti: number;
    };
    perIndirizzo?: Record<string, AlunnoContestoVM[]>;
    indirizziPresenti?: string[];
    perSpecificita?: Record<string, Record<string, AlunnoContestoVM[]>>;
  };
  didattica?: {
    pianiPersonalizzati: {
      items: PianoPersonalizzatoItem[];
      storico?: import('../storico/LazyRef').LazyRef<
        import('../storico/StoricoDocumentiService').DocumentoStoricoConTipo[]
      >;
    };
    /** Class-wide LOG_DOCS aggregation (mirrors `CduAlunno.didattica.documenti`, 11 §11 new). */
    documenti?: {
      items: Array<{
        nome: string;
        link: string;
        tipo: string;
        idGen: string;
        stato: string;
        dataCreazione: string;
      }>;
      hasDocumenti: boolean;
    };
  };
}

export interface CduAlunno {
  anagrafica: { nomeCompleto: string; email: string };
  status: { religione: string; isBes: boolean; isRipetente: boolean; isRappresentante: boolean };
  curriculum: Record<string, { specifiche: string[] }>;
  classe: { nome: string; indirizzoSigla: string; indirizzoNome: string };
  consiglioDiClasseFiltrato?: DocenteCdcVM[];
  didattica: {
    carenze: {
      dettaglio: Array<{ materia: string; voto: string }>;
      numero: number;
      hasCarenze: boolean;
    };
    asl: { oreCumulate: number; oreAnnoCorrente: number };
    piani: {
      items: Array<{
        tipo: string;
        isBes: boolean;
        link: string;
        parametriGenerazione: Record<string, unknown>;
      }>;
      hasPiani: boolean;
      hasBes: boolean;
    };
    documenti?: {
      items: Array<{
        nome: string;
        link: string;
        tipo: string;
        idGen: string;
        stato: string;
        dataCreazione: string;
      }>;
      hasDocumenti: boolean;
      /** Lazy prior-year documents grouped by ID_GEN at render time (11 §11 arricchisciConStorico, 13 §4). */
      storico?: import('../storico/LazyRef').LazyRef<
        import('../storico/StoricoDocumentiService').DocumentoStoricoConTipo[]
      >;
    };
    pianiPersonalizzati?: {
      items: PianoPersonalizzatoItem[];
      /** Lazy prior-year PIANO_PERS documents, matched to rows by SOTTOTIPO. */
      storico?: import('../storico/LazyRef').LazyRef<
        import('../storico/StoricoDocumentiService').DocumentoStoricoConTipo[]
      >;
    };
    /** Lazy prior-years history (13 §2/§3), populated only when `includiStorico` is true. */
    storico?: LazyRef<AnnoAlunnoStorico[]>;
  };
}

export interface CduCarenzaFocus {
  studente: string;
  progressivo: number;
  data: string;
  classe: string;
  hasAssenze: boolean;
  note: string;
}

/** The selected personalized plan, available only during plan generation. */
export interface CduPianoFocus {
  tipo: TipoPiano;
  isBes: boolean;
  parametriGenerazione: Record<string, unknown>;
}

export interface CduDestinatario {
  anagrafica: {
    nome: string;
    cognome: string;
    nomeCompleto: string;
    email: string;
    appellativo: string;
    genere: string;
  };
  ruoliAttivi: string[];
  flags: {
    isCoordinatore: boolean;
    isTutor: boolean;
    isTutorAsl: boolean;
    isDocenteSostegno: boolean;
    isSupplente: boolean;
  };
  contesto: {
    sostituisce: { nome: string; email: string } | null;
    classiCompetenza: string[];
    materieCompetenza: string[];
  };
  comunicazione: { salutoIniziale: string; oggettoCalcolato: string; testoContenutoPuro: string };
}

/** Live entities & pipeline state — attached NON-enumerable so it never appears in JSON.stringify (02 §7). */
export interface CduTech {
  entita: Record<string, unknown>;
  servizi: unknown[];
  pipeline: {
    statoCorrente: string;
    stepEseguiti: string[];
    errori: unknown[];
    logEsecuzione: string[];
  };
}

export interface Cdu {
  meta: CduMeta;
  istituto?: CduIstituto;
  focus: {
    classe?: CduClasse;
    alunno?: CduAlunno;
    carenza?: CduCarenzaFocus;
    piano?: CduPianoFocus;
  };
  destinatario?: CduDestinatario;
  render?: {
    boxes: Record<
      string,
      { id: string; titolo: string; html: string; isEmpty: boolean; visibile: boolean }
    >;
    body: { htmlCompleto: string; htmlSoloContenuto: string };
  };
  tech: CduTech;
}
