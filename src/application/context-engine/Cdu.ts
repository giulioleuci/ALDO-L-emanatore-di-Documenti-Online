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

import type { TipoPiano } from '../../domain/value-objects/enums';
import type { PersonVM } from './mappers/personVmMapper';
import type { SubjectVM } from './mappers/subjectVmMapper';
import type { CurriculumVM } from './mappers/carenzeMapper';
import type { SpecificitaAlunniVM } from './mappers/specificitaAlunniMapper';
import type { MateriaPerPrincipaleVM } from './mappers/materiePerPrincipaleMapper';
import type { StudentStoricoVM } from './mappers/storicoMapper';
import type { ProgettoVM } from './providers/ProgettiProvider';
import type { ClasseStoricoVM } from './providers/StoricoClasseProvider';
import type { SingleClassProjection } from './providers/PartnerProjectionProvider';

/** Docente-in-CDC view model, shared by `focus.classe.consiglioDiClasse` and `focus.alunno.consiglioDiClasseFiltrato` (02 §4.1/§4.2). */
export interface DocenteCdcVM {
  anagrafica: PersonVM;
  materie: SubjectVM[];
  /** Every subject in `materie`, names comma-joined (09 §10 — for flat, template-simple display). */
  materieDescrizione: string;
  /** `materie` sigle, comma-joined, for flat/compact display. */
  materieSigle: string;
  ruoli: {
    isCoordinatore: boolean;
    isTutorAsl: boolean;
    isTutorOrientamento: boolean;
    descrizione: string[];
  };
  stato: { isSupplente: boolean; sostituisce: PersonVM | null };
  tipoArticolazione: 'COMUNE' | 'SEPARATO_PRIMO' | 'SEPARATO_SECONDO' | null;
  /** Resolved major name for SEPARATO_PRIMO/SEPARATO_SECONDO; null for COMUNE and non-articulated classes (09 §10). */
  gruppoNome: string | null;
  isITP: boolean;
  flags: { isNotLast: boolean };
}

/**
 * Alunno-in-context view model inside `focus.classe.studenti.listaCompleta`
 * (02 §4.1/§8.7). Self-contained (Principle 2): carries its own `classe`/
 * `indirizzo` so templates never navigate back to `focus.classe.anagrafica`
 * inside a loop. For the parent of an articulated class these always reflect
 * the FOCUSED (parent) class, not each student's own partner class.
 */
export interface AlunnoContestoVM {
  anagrafica: { nomeCompleto: string; email: string };
  classe: { nome: string };
  indirizzo: { nome: string; nomeSintetico: string };
  status: {
    isBes: boolean;
    isRipetente: boolean;
    isRappresentante: boolean;
    religione: string;
    religioneLabel: string;
  };
  curriculum: CurriculumVM[];
  didattica: {
    carenze: {
      hasCarenze: boolean;
      numero: number;
      dettaglio: Array<{ materia: string; materiaNome: string; voto: string }>;
    };
    piani: {
      hasPiani: boolean;
      hasBes: boolean;
      items: Array<{ tipo: string; tipoLabel: string; isBes: boolean }>;
    };
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
  progressivo?: number;
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
    tipoTarget: 'classe' | 'alunno' | 'dipartimento';
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
  notificaSoloCoordinatori: boolean;
  includiPartnerDettaglio: boolean;
  gestioneSupplenti: string;
  [key: string]: unknown;
}

export interface CduIstituto {
  organizzazione: { annoScolastico: string; dirigente: { nomeCompleto: string } };
  staff: { referenteBes: PersonVM | null; animatoreDigitale: PersonVM | null };
  statistiche?: { totaleClassi: number; totaleDocenti: number; totaleAlunni: number };
}

export interface CduClasse {
  anagrafica: {
    nome: string;
    anno: number;
    sezione: string;
    annoScolastico: string;
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
    parent: {
      id: string;
      anno: number;
      indirizzi: Array<{ sigla: string; nome: string; nomeSintetico: string; tipo: string }>;
    } | null;
    materieCondivise: SubjectVM[];
    materieSeparatePrimoGruppo: SubjectVM[];
    materieSeparateSecondoGruppo: SubjectVM[];
  };
  coordinatori?: {
    appellativo?: string;
    articolo?: string;
    coordina?: string;
    presiede?: string;
    elenco: PersonVM[];
  };
  tutor?: {
    appellativo?: string;
    articolo?: string;
    tutor?: string;
    asl: PersonVM[];
    orientamento: PersonVM[];
  };
  rappresentanti?: {
    studenti: Array<{ nomeCompleto: string; email: string; indirizzo?: { nome: string } }>;
    genitori: Array<{ nomeCompleto: string; studente: { nomeCompleto: string }; indirizzo?: { nome: string } }>;
  };
  consiglioDiClasse?: DocenteCdcVM[];
  consiglioDiClasseComune?: DocenteCdcVM[];
  consiglioDiClasseSeparato?: DocenteCdcVM[];
  /** Disaggregated per-partner-class projection for an articulated parent (02 §2.5), only when `includiPartnerDettaglio` is true. */
  partner?: { primo: SingleClassProjection; secondo: SingleClassProjection };
  /** Flat, deduped subject catalog of the class council (02 §2.8, §4.1). */
  materie?: SubjectVM[];
  /** `materie` grouped by base materia id, for composite-specificità display (02 §2.8). */
  materiePerPrincipale?: MateriaPerPrincipaleVM[];
  /** Pre-split prima/seconda prova partitions of `materie` (02 §2.9, §4.1) — runs after `materie`. */
  esame?: {
    hasEsame: boolean;
    materie: Array<SubjectVM & { prova: 'PRIMA_PROVA' | 'SECONDA_PROVA' }>;
    docenti: Array<PersonVM & { prova: 'PRIMA_PROVA' | 'SECONDA_PROVA'; materie: SubjectVM[] }>;
    materiePrimaProva: SubjectVM[];
    materieSecondaProva: SubjectVM[];
    docentiPrimaProva: PersonVM[];
    docentiSecondaProva: PersonVM[];
  };
  /** PROGETTI assigned to the class (02 §2.10, §4.1). */
  hasProgetti?: boolean;
  progetti?: ProgettoVM[];
  /** Lazy prior-years history (13 §2/§5), populated only when `includiStorico` is true (02 §2.11, §8.6). */
  storico?: LazyRef<ClasseStoricoVM>;
  /** Sheet-expansion column list (MAT_NON_STANDARD) — built on demand by SheetMaterieConPermessiGeneratorStrategy, not a standard provider output. */
  elencoMaterieConPermessi?: import('./ElencoMaterieConPermessi').ElencoMateriaConPermessiVM[];
  /**
   * Printable projection of the `materieColonne` groups already computed by
   * `SheetMaterieGeneratorStrategy.buildGroups`/its `_E_PERMESSI` override —
   * built on demand by those strategies, not a standard provider output. This
   * CDU-facing shape is intentionally narrower than the strategy's internal
   * `MateriaColumn` (drops the ACL-only `classeId`/`specificita`/`kind`
   * fields from the printable contract).
   */
  sheet?: {
    materieColonne: {
      group1: Array<{ sigla: string; header: string; isSpecial?: boolean; roles?: string[] }>;
      group2: Array<{ sigla: string; header: string; isSpecial?: boolean; roles?: string[] }>;
      group3: Array<{ sigla: string; header: string; isSpecial?: boolean; roles?: string[] }>;
      group2Label?: string;
      group3Label?: string;
    };
  };
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
    perSpecificita: SpecificitaAlunniVM[];
  };
  didattica?: {
    pianiPersonalizzati: {
      items: PianoPersonalizzatoItem[];
      storico?: LazyRef<
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
  status: {
    religione: string;
    religioneLabel: string;
    isBes: boolean;
    isRipetente: boolean;
    isRappresentante: boolean;
  };
  curriculum: CurriculumVM[];
  classe: { nome: string; indirizzoSigla: string; indirizzoNome: string };
  consiglioDiClasseFiltrato?: DocenteCdcVM[];
  storico?: LazyRef<StudentStoricoVM>;
  didattica: {
    carenze: {
      dettaglio: Array<{ materia: string; materiaNome: string; voto: string }>;
      numero: number;
      hasCarenze: boolean;
    };
    asl: { oreCumulate: number; oreAnnoCorrente: number };
    piani: {
      items: Array<{
        tipo: string;
        tipoLabel: string;
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
      storico?: LazyRef<
        import('../storico/StoricoDocumentiService').DocumentoStoricoConTipo[]
      >;
    };
    pianiPersonalizzati?: {
      items: PianoPersonalizzatoItem[];
      /** Lazy prior-year PIANO_PERS documents, matched to rows by SOTTOTIPO. */
      storico?: LazyRef<
        import('../storico/StoricoDocumentiService').DocumentoStoricoConTipo[]
      >;
    };
  };
}

/**
 * `focus.dipartimento` — anagrafica/capo/materie/docenti of a DIPART row plus
 * its LOG_DOCS aggregation (11 §11 new, department-scoped batch generation).
 * `materie` is a light `{ sigla }` projection, not the full `SubjectVM`: a
 * `MateriaId` alone doesn't carry a `SubjectVM`'s other fields (`nome`,
 * `colore1`, etc.) without a lookup against `IMateriaRepository`, and nothing
 * in this extension's templates needs more than the sigla. `didattica.
 * documenti.items` mirrors `DocumentiClasseProvider`'s output shape exactly
 * (`{ id?, nome, link, tipo, idGen, stato, dataCreazione }`), filtered by
 * materia overlap instead of `findByClasse` since a department has no class
 * dimension.
 */
export interface CduDipartimentoFocus {
  anagrafica: { id: string; nome: string };
  capo: PersonVM | null;
  materie: Array<{ sigla: string }>;
  docenti: PersonVM[];
  didattica: {
    documenti: {
      items: Array<{
        id?: string | undefined;
        nome: string;
        link: string;
        tipo: string;
        idGen: string;
        stato: string;
        dataCreazione: string;
      }>;
    };
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
  tipoLabel: string;
  isBes: boolean;
  parametriGenerazione: Record<string, unknown>;
}

export interface CduDestinatario {
  anagrafica: PersonVM;
  ruoliAttivi: string[];
  flags: {
    isCoordinatore: boolean;
    isTutor: boolean;
    isTutorAsl: boolean;
    isDocenteSostegno: boolean;
    isSupplente: boolean;
  };
  contesto: {
    sostituisce: PersonVM | null;
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
  progressivo?: number;
  istituto?: CduIstituto;
  focus: {
    classe?: CduClasse;
    alunno?: CduAlunno;
    dipartimento?: CduDipartimentoFocus;
    carenza?: CduCarenzaFocus;
    piano?: CduPianoFocus;
    docente?: PersonVM;
    materia?: SubjectVM;
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
