export interface ElencoVM<T> {
  elenco: T[];
  hasElenco: boolean;
  numero: number;
}

export interface DataStampabileVM {
  breve: string;
  estesa: string;
  giorno: string;
  mese: string;
  meseNome: string;
  anno: string;
  ora: string;
}

export interface OpzioniCduVM {
  includiStorico: boolean;
  profonditaAnniStorico: number;
  profonditaAnniAsl: number;
  profonditaAnniDocumenti: number;
  includiSupplenti: boolean;
  notificaSoloCoordinatori: boolean;
  includiPartnerDettaglio: boolean;
  gestioneSupplenti: 'SOLO_TITOLARI' | 'SOLO_SUPPLENTI' | 'ENTRAMBI';
}

export type ConfigurazioneBoxVM = ElencoVM<{
  boxId: string;
  ordine: number;
  isAttivo: boolean;
  isNascostoPercheVuoto: boolean;
}>;

export interface MetadatiVM {
  timestamp: string;
  configurazioneId: string;
  esecuzioneId: string;
  tipoOperazione: 'GENERAZIONE_DOCUMENTO' | 'INVIO_NOTIFICA';
  tipoOperazioneLabel: 'Generazione documento' | 'Invio notifica';
  oggi: DataStampabileVM;
  target: string;
  tipoTarget:
    | 'classe'
    | 'alunno'
    | 'docente'
    | 'piano'
    | 'carenza'
    | 'materia'
    | 'dipartimento';
  materiaCorrente: string | null;
  opzioni: OpzioniCduVM;
  progressivo?: number;
  configurazioneBox?: ConfigurazioneBoxVM;
}

export interface PersonaRiferimentoVM {
  nomeCompleto: string;
  email: string;
}

export interface PersonaVM {
  nome: string;
  cognome: string | null;
  nomeCompleto: string;
  email: string | null;
  genere: 'M' | 'F' | null;
  appellativo: string | null;
  articolo: string | null;
  coordinatore: string | null;
  appellativoCompleto: string;
  appellativoCognome: string;
  appellativoCompletoEsteso: string;
  appellativoCognomeEsteso: string;
  isEsterno: boolean;
}

export interface CollettivoPersoneVM {
  appellativo: string;
  articolo: string;
  coordinamento: string;
  coordina: string;
  presiede: string;
  numero: number;
}

export interface ClasseRiferimentoVM {
  nome: string;
}

export interface ClasseSintesiVM extends ClasseRiferimentoVM {
  anno: number;
  sezione: string;
}

export interface IndirizzoVM {
  sigla: string;
  nome: string;
  nomeSintetico: string;
  tipo: string;
  tipoLabel: string;
}

export interface MateriaVM {
  sigla: string;
  nome: string;
  nomeSintetico: string;
  colore1: string;
  colore2: string;
  principale: string | null;
  specificita: string | null;
  hasSpecificita: boolean;
  nomeConSpecificita: string;
  isItp: boolean;
  isMateriaPrimaProva: boolean;
  isMateriaSecondaProva: boolean;
  evoluzione: {
    siglePrecedenti: Array<{
      sigla: string;
      anni: number[];
      anniDescrizione: string;
    }>;
    hasSiglePrecedenti: boolean;
  };
  docenti?: PersonaVM[];
  hasDocenti?: boolean;
  docentiDescrizione?: string;
  docentiDescrizioneEstesa?: string;
  hasCattedraItp?: boolean;
  continuita?: ContinuitaVM;
}

export interface ContinuitaVM {
  anniPrecedenti: Array<{
    annoIndietro: number;
    annoScolastico: string;
    titolare: PersonaVM | null;
    hasTitolare: boolean;
    itp: PersonaVM | null;
    hasItp: boolean;
  }>;
  hasAnniPrecedenti: boolean;
  isContinuitaUltimiDueAnni: boolean;
  isContinuitaUltimiTreAnni: boolean;
  isContinuitaItpUltimiDueAnni: boolean;
  isContinuitaItpUltimiTreAnni: boolean;
}

export interface CurriculumVM {
  materiaId: string;
  materiaSigla: string;
  materiaNome: string;
  materiaNomeSintetico: string;
  specifiche: Array<{ nome: string; nomeCapitalizzato: string }>;
  hasSpecifiche: boolean;
  specificheDescrizione: string;
}

export interface SpecificitaAlunniVM {
  materiaId: string;
  materiaSigla: string;
  materiaNome: string;
  materiaNomeSintetico: string;
  specifiche: Array<{
    nome: string;
    nomeCapitalizzato: string;
    alunni: PersonaRiferimentoVM[];
    hasAlunni: boolean;
    numero: number;
    alunniDescrizione: string;
  }>;
  hasSpecifiche: boolean;
}

export interface PresenzaAlunnoVM {
  annoPrecedente: {
    isCalcolato: boolean;
    isPresente: boolean;
  };
  isPresenteTuttoAnno: boolean;
  hasCambiatoClasse: boolean;
  classePrecedente: ClasseRiferimentoVM | null;
  hasClassePrecedente: boolean;
}

export interface ProvenienzaDestinazioneVM {
  valore: string;
  descrizione: string;
  classe: ClasseRiferimentoVM | null;
  scuolaEsterna: string | null;
  isClasse: boolean;
  isScuolaEsterna: boolean;
}

export interface MovimentoAlunnoVM {
  tipo: 'IN' | 'OUT' | 'RITIRATO' | 'CAMBIO';
  tipoLabel: 'Ingresso' | 'Trasferimento in uscita' | 'Ritiro' | 'Cambio di classe';
  data: string;
  dataBreve: string;
  dataEstesa: string;
  provenienza: ProvenienzaDestinazioneVM | null;
  destinazione: ProvenienzaDestinazioneVM | null;
  isIngresso: boolean;
  isUscita: boolean;
  isRitirato: boolean;
  isCambioClasse: boolean;
  descrizione: string;
}

export type ElencoMovimentiAlunnoVM = ElencoVM<MovimentoAlunnoVM>;

export interface MovimentoClasseVM extends MovimentoAlunnoVM {
  studente: PersonaRiferimentoVM;
  direzione: 'ENTRATA' | 'USCITA' | 'INTERNA';
  direzioneLabel: 'In entrata' | 'In uscita' | 'Movimento interno';
  isEntrata: boolean;
  isUscita: boolean;
  isMovimentoInterno: boolean;
}

export interface ClasseContestoVM extends ClasseRiferimentoVM {
  indirizzo: IndirizzoVM;
}

export interface AslAlunnoVM {
  oreCumulate: number;
  oreAnnoCorrente: number;
}

export interface CarenzaVM {
  materiaSigla: string;
  materiaNome: string;
  materiaNomeSintetico: string;
  voto: string;
  descrizione: string;
}

export interface ElencoCarenzeVM extends ElencoVM<CarenzaVM> {
  elencoDescrizione: string;
}

export interface PianoVM {
  tipo: string;
  tipoLabel: string;
  isBes: boolean;
  link: string | null;
  hasLink: boolean;
  parametriGenerazione: object | null;
  hasParametriGenerazione: boolean;
}

export interface ElencoPianiVM extends ElencoVM<PianoVM> {
  elencoDescrizione: string;
  hasBes: boolean;
}

export interface AlunnoVM extends PersonaRiferimentoVM {
  classe: ClasseContestoVM;
  religione: 'IRC' | 'ALT' | 'NO';
  religioneLabel: string;
  isIrc: boolean;
  isAlt: boolean;
  isSenzaReligione: boolean;
  isBes: boolean;
  isDsa: boolean;
  isPei: boolean;
  isPfp: boolean;
  isRipetente: boolean;
  isRappresentante: boolean;
  presenza: PresenzaAlunnoVM;
  movimenti: ElencoMovimentiAlunnoVM;
  curriculum: CurriculumVM[];
  hasCurriculum: boolean;
  curriculumDescrizione: string;
  carenze: ElencoCarenzeVM;
  piani: ElencoPianiVM;
  asl: AslAlunnoVM;
}

export interface DocenteCdcVM extends PersonaVM {
  materie: MateriaVM[];
  hasMaterie: boolean;
  numeroMaterie: number;
  materieDescrizione: string;
  materieDescrizioneSintesi: string;
  materieSigle: string;
  isCoordinatore: boolean;
  isTutorAsl: boolean;
  isTutorOrientamento: boolean;
  isTutor: boolean;
  isSupplente: boolean;
  isItp: boolean;
  isComune: boolean;
  isSeparatoPrimo: boolean;
  isSeparatoSecondo: boolean;
  ruoliDescrizione: string[];
  ruoliDescrizioneTesto: string;
  sostituisce: PersonaVM | null;
  hasSostituisce: boolean;
  tipoArticolazione: 'COMUNE' | 'SEPARATO_PRIMO' | 'SEPARATO_SECONDO' | null;
  tipoArticolazioneLabel: string;
  gruppoNome: string | null;
}

export interface ProgettoVM {
  tipo: 'ASL' | 'ORIENTAMENTO' | 'ALTRO';
  tipoLabel: 'FSL' | 'Orientamento' | 'Altro';
  nome: string;
  referente: PersonaVM;
  ore: number;
  oreAsl: number;
  isAsl: boolean;
  isOrientamento: boolean;
  isAltro: boolean;
}

export interface StatisticheAlunniVM {
  totale: number;
  conPiani: number;
  conBes: number;
  conDsa: number;
  ripetenti: number;
  rappresentanti: number;
}

export interface StatisticheIstitutoVM {
  totaleClassi: number;
  totaleDocenti: number;
  totaleAlunni: number;
}

export interface CarenzaStoricaVM {
  materiaSigla: string;
  valore: string;
}

export interface PianoStoricoVM {
  tipo: string;
  tipoLabel: string;
}

export interface StoricoClasseVM {
  anni: Array<{
    annoScolastico: string;
    classe: ClasseRiferimentoVM;
    statistiche: StatisticheAlunniVM;
    progetti: ProgettoVM[];
    hasProgetti: boolean;
  }>;
  hasAnni: boolean;
  numeroAnni: number;
}

export interface StoricoAlunnoVM {
  anni: Array<{
    annoScolastico: string;
    classe: ClasseRiferimentoVM | null;
    esito: 'PROMOSSO' | 'NON_PROMOSSO' | 'TRASFERITO' | 'RITIRATO' | 'SCONOSCIUTO';
    esitoLabel: string;
    isPromosso: boolean;
    isNonPromosso: boolean;
    carenze: CarenzaStoricaVM[];
    hasCarenze: boolean;
    carenzeDescrizione: string;
    piani: PianoStoricoVM[];
    hasPiani: boolean;
    presenza: PresenzaAlunnoVM;
    movimenti: ElencoMovimentiAlunnoVM;
  }>;
  hasAnni: boolean;
  numeroAnni: number;
  bocciature: ElencoVM<{
    annoScolastico: string;
    classe: ClasseRiferimentoVM;
  }> & { elencoDescrizione: string };
}

export interface DocumentoLogVM {
  id: string | null;
  hasId: boolean;
  nome: string;
  link: string;
  tipo: string;
  tipoLabel: string;
  sottotipo: string;
  sottotipoLabel: string;
  hasSottotipo: boolean;
  generatoreId: string;
  stato: string;
  statoLabel: string;
  isNotificato: boolean;
  dataCreazione: string;
  dataCreazioneBreve: string;
}

export interface DocumentoStoricoVM {
  annoScolastico: string;
  documento: DocumentoLogVM;
}

export interface PianoPersonalizzatoVM extends DocumentoLogVM {
  isVerbalizzato: boolean;
  studente: PersonaRiferimentoVM | null;
  hasStudente: boolean;
}

export interface SupplenzaAggregataVM {
  supplente: PersonaVM;
  titolare: PersonaVM;
  materie: MateriaVM[];
  hasMaterie: boolean;
  materieDescrizione: string;
  materieSigle: string;
}

export interface CattedraVM {
  classe: ClasseSintesiVM;
  sezioneEstesa: string;
  materie: MateriaVM[];
  hasMaterie: boolean;
  numeroMaterie: number;
  materieDescrizione: string;
  materieSigle: string;
}

export interface RappresentanteStudenteVM {
  studente: PersonaRiferimentoVM;
  indirizzo: IndirizzoVM | null;
  hasIndirizzo: boolean;
}

export interface RappresentanteGenitoreVM {
  nomeCompleto: string;
  studente: PersonaRiferimentoVM;
  indirizzo: IndirizzoVM | null;
  hasIndirizzo: boolean;
  descrizione: string;
}

export interface MateriaEsameVM extends MateriaVM {
  docenti: PersonaVM[];
  hasDocenti: boolean;
  docentiDescrizione: string;
  docentiDescrizioneEstesa: string;
  hasCattedraItp: boolean;
  prova: 'PRIMA_PROVA' | 'SECONDA_PROVA';
  provaLabel: 'Prima prova' | 'Seconda prova';
  isPrimaProva: boolean;
  isSecondaProva: boolean;
}

export interface DocenteEsameVM extends PersonaVM {
  prova: 'PRIMA_PROVA' | 'SECONDA_PROVA';
  provaLabel: 'Prima prova' | 'Seconda prova';
  isPrimaProva: boolean;
  isSecondaProva: boolean;
  materie: MateriaVM[];
  hasMaterie: boolean;
  numeroMaterie: number;
  materieDescrizione: string;
  materieSigle: string;
}

export interface RuoloStaffVM {
  ruoloId: string;
  ruoloNome: string;
  persona: PersonaVM | null;
  hasPersona: boolean;
}

export interface IstitutoVM {
  annoScolastico: string;
  dirigente: PersonaVM;
  staff: ElencoVM<RuoloStaffVM> & { perId: Record<string, RuoloStaffVM> };
  statistiche?: StatisticheIstitutoVM;
}

export interface CoordinatoriVM extends ElencoVM<PersonaVM> {
  elencoDescrizione: string;
  elencoDescrizioneEstesa: string;
  elencoDescrizioneElenco: string;
  descrizioneRuolo: string;
  descrizioneRuoloEstesa: string;
  collettivo: CollettivoPersoneVM;
}

export interface TutorClasseVM {
  asl: PersonaVM[];
  orientamento: PersonaVM[];
  elenco: PersonaVM[];
  hasAsl: boolean;
  hasOrientamento: boolean;
  hasElenco: boolean;
  numero: number;
  aslDescrizione: string;
  orientamentoDescrizione: string;
  elencoDescrizione: string;
  collettivo: {
    appellativo: string;
    articolo: string;
    sostantivo: 'Tutor';
    numero: number;
  };
}

export interface RappresentantiClasseVM {
  studenti: ElencoVM<RappresentanteStudenteVM> & { elencoDescrizione: string };
  genitori: ElencoVM<RappresentanteGenitoreVM> & { elencoDescrizione: string };
}

export interface ConsiglioClasseVM {
  elenco: DocenteCdcVM[];
  titolari: DocenteCdcVM[];
  hasElenco: boolean;
  hasTitolari: boolean;
  numero: number;
  elencoDescrizione: string;
  elencoDescrizioneEstesa: string;
  comune: DocenteCdcVM[];
  separato: DocenteCdcVM[];
  separatoPrimo: DocenteCdcVM[];
  separatoSecondo: DocenteCdcVM[];
  hasComune: boolean;
  hasSeparato: boolean;
  hasSeparatoPrimo: boolean;
  hasSeparatoSecondo: boolean;
  comuneDescrizione: string;
  separatoPrimoDescrizione: string;
  separatoSecondoDescrizione: string;
  supplenze: SupplenzaAggregataVM[];
  hasSupplenze: boolean;
}

export interface MaterieClasseVM extends ElencoVM<MateriaVM> {
  elencoDescrizione: string;
  elencoDescrizioneSintesi: string;
  sigle: string;
}

export interface MateriaPerPrincipaleItemVM {
  principaleId: string;
  nome: string;
  materie: MateriaVM[];
  hasMaterie: boolean;
  numero: number;
  materieDescrizione: string;
}

export type MateriePerPrincipaleVM = ElencoVM<MateriaPerPrincipaleItemVM>;

export interface EsameClasseVM {
  hasEsame: boolean;
  materie: MateriaEsameVM[];
  docenti: DocenteEsameVM[];
  hasMaterie: boolean;
  hasDocenti: boolean;
  materiePrimaProva: MateriaEsameVM[];
  materieSecondaProva: MateriaEsameVM[];
  docentiPrimaProva: DocenteEsameVM[];
  docentiSecondaProva: DocenteEsameVM[];
  hasMateriePrimaProva: boolean;
  hasMaterieSecondaProva: boolean;
  hasDocentiPrimaProva: boolean;
  hasDocentiSecondaProva: boolean;
  materiePrimaProvaDescrizione: string;
  materieSecondaProvaDescrizione: string;
  docentiPrimaProvaDescrizione: string;
  docentiSecondaProvaDescrizione: string;
}

export interface ProgettiClasseVM extends ElencoVM<ProgettoVM> {
  asl: ProgettoVM[];
  orientamento: ProgettoVM[];
  altro: ProgettoVM[];
  hasAsl: boolean;
  hasOrientamento: boolean;
  hasAltro: boolean;
  oreAslTotali: number;
}

export interface StudentiClasseVM extends ElencoVM<AlunnoVM> {
  elencoDescrizione: string;
  statistiche: StatisticheAlunniVM;
  perStato: {
    bes: AlunnoVM[];
    dsa: AlunnoVM[];
    pfp: AlunnoVM[];
    pei: AlunnoVM[];
    ripetenti: AlunnoVM[];
    rappresentanti: AlunnoVM[];
    conPiani: AlunnoVM[];
    hasBes: boolean;
    hasDsa: boolean;
    hasPfp: boolean;
    hasPei: boolean;
    hasRipetenti: boolean;
    hasRappresentanti: boolean;
    hasConPiani: boolean;
  };
  perReligione: {
    irc: AlunnoVM[];
    alt: AlunnoVM[];
    no: AlunnoVM[];
    hasIrc: boolean;
    hasAlt: boolean;
    hasNo: boolean;
    ircDescrizione: string;
    altDescrizione: string;
    noDescrizione: string;
    elenco: Array<{
      codice: 'IRC' | 'ALT' | 'NO';
      label: string;
      alunni: AlunnoVM[];
      hasAlunni: boolean;
      numero: number;
    }>;
  };
  perSpecificita: SpecificitaAlunniVM[];
  hasPerSpecificita: boolean;
}

export interface MovimentiClasseVM extends ElencoVM<MovimentoClasseVM> {
  entrate: MovimentoClasseVM[];
  uscite: MovimentoClasseVM[];
  interni: MovimentoClasseVM[];
  hasEntrate: boolean;
  hasUscite: boolean;
  hasInterni: boolean;
  numeroEntrate: number;
  numeroUscite: number;
  numeroInterni: number;
}

export interface PianiPersonalizzatiClasseVM extends ElencoVM<PianoPersonalizzatoVM> {
  nonVerbalizzati: ElencoVM<PianoPersonalizzatoVM>;
  storico: LazyRef<DocumentoStoricoVM[]>;
}

export interface ElencoDocumentiVM extends ElencoVM<DocumentoLogVM> {
  storico: LazyRef<DocumentoStoricoVM[]>;
}

export interface ColonnaMateriaVM {
  sigla: string;
  header: string;
  isSpeciale: boolean;
  ruoli: string[];
}

export interface FoglioClasseVM {
  materieConPermessi: ElencoVM<ColonnaMateriaVM>;
  materieColonne: {
    gruppi: Array<{
      indice: number;
      label: string;
      colonne: ColonnaMateriaVM[];
      hasColonne: boolean;
      numero: number;
    }>;
  };
}

export interface ClasseParentVM extends ClasseRiferimentoVM {
  anno: number;
  indirizzi: IndirizzoVM[];
  hasIndirizzi: boolean;
  indirizziDescrizione: string;
}

export interface ArticolazioneClasseVM {
  classeSorella: ClasseRiferimentoVM | null;
  parent: ClasseParentVM | null;
  sottoClassi: ClasseRiferimentoVM[];
  hasSottoClassi: boolean;
  materieComuni: MateriaVM[];
  materieSeparatePrimo: MateriaVM[];
  materieSeparateSecondo: MateriaVM[];
  hasMaterieComuni: boolean;
  hasMaterieSeparatePrimo: boolean;
  hasMaterieSeparateSecondo: boolean;
  materieComuniDescrizione: string;
  materieComuniSigle: string;
  materieSeparatePrimoDescrizione: string;
  materieSeparatePrimoSigle: string;
  materieSeparateSecondoDescrizione: string;
  materieSeparateSecondoSigle: string;
}

export interface ProiezioneClasseVM extends ClasseSintesiVM {
  indirizzo: IndirizzoVM;
  consiglio: ConsiglioClasseVM;
  studenti: StudentiClasseVM;
  coordinatori: CoordinatoriVM;
  movimenti: MovimentiClasseVM;
}

export interface PartnerClasseVM extends ElencoVM<ProiezioneClasseVM> {
  primo: ProiezioneClasseVM;
  secondo: ProiezioneClasseVM;
}

export interface ClasseFocusVM extends ClasseSintesiVM {
  indirizzo: IndirizzoVM;
  isClassePrima: boolean;
  isTriennio: boolean;
  isPrimoBiennio: boolean;
  isSecondoBiennio: boolean;
  isTerminale: boolean;
  isArticolata: boolean;
  isParent: boolean;
  isSottoClasse: boolean;
  hasAsl: boolean;
  articolazione?: ArticolazioneClasseVM;
  partner?: PartnerClasseVM;
  coordinatori?: CoordinatoriVM;
  tutor?: TutorClasseVM;
  rappresentanti?: RappresentantiClasseVM;
  consiglio?: ConsiglioClasseVM;
  materie?: MaterieClasseVM;
  materiePerPrincipale?: MateriePerPrincipaleVM;
  esame?: EsameClasseVM;
  progetti?: ProgettiClasseVM;
  studenti?: StudentiClasseVM;
  movimenti?: MovimentiClasseVM;
  storico?: LazyRef<StoricoClasseVM>;
  pianiPersonalizzati?: PianiPersonalizzatiClasseVM;
  documenti?: ElencoDocumentiVM;
  sheet?: FoglioClasseVM;
}

export interface ConsiglioAlunnoVM extends ElencoVM<DocenteCdcVM> {
  elencoDescrizione: string;
  materie: MateriaVM[];
  hasMaterie: boolean;
  materieDescrizione: string;
}

export interface AlunnoFocusVM extends AlunnoVM {
  consiglio?: ConsiglioAlunnoVM;
  documenti?: ElencoDocumentiVM;
  storico?: LazyRef<StoricoAlunnoVM>;
}

export interface PianoFocusVM {
  tipo: string;
  tipoLabel: string;
  isBes: boolean;
  parametriGenerazione: object;
}

export interface CarenzaFocusVM {
  studente: PersonaRiferimentoVM;
  classe: ClasseRiferimentoVM;
  progressivo: number;
  data: string;
  dataBreve: string;
  dataEstesa: string;
  hasAssenze: boolean;
  note: string;
  hasNote: boolean;
}

export interface DipartimentoFocusVM {
  id: string;
  nome: string;
  capo: PersonaVM | null;
  hasCapo: boolean;
  materie: MateriaVM[];
  hasMaterie: boolean;
  numeroMaterie: number;
  materieDescrizione: string;
  materieDescrizioneSintesi: string;
  materieSigle: string;
  docenti: PersonaVM[];
  hasDocenti: boolean;
  numeroDocenti: number;
  docentiDescrizione: string;
  documenti: ElencoDocumentiVM;
}

export interface ContestoFocusVM {
  classe?: ClasseFocusVM;
  alunno?: AlunnoFocusVM;
  piano?: PianoFocusVM;
  carenza?: CarenzaFocusVM;
  docente?: PersonaVM;
  materia?: MateriaVM;
  cattedre?: CattedraVM[];
  hasCattedre?: boolean;
  cattedreDescrizione?: string;
  dipartimento?: DipartimentoFocusVM;
}

export interface DestinatarioVM extends PersonaVM {
  ruoliAttivi: string[];
  hasRuoliAttivi: boolean;
  isCoordinatore: boolean;
  isTutor: boolean;
  isTutorAsl: boolean;
  isDocenteSostegno: boolean;
  isSupplente: boolean;
  sostituisce: PersonaVM | null;
  hasSostituisce: boolean;
  classi: ElencoVM<ClasseSintesiVM> & { elencoDescrizione: string };
  materie: ElencoVM<MateriaVM> & { elencoDescrizione: string; sigle: string };
  cattedre: ElencoVM<CattedraVM> & { elencoDescrizione: string };
  comunicazione: {
    salutoIniziale: string;
    oggetto: string;
    testoContenutoPuro: string;
  };
}

export interface BoxRenderizzatoVM {
  id: string;
  titolo: string;
  html: string;
  isVuoto: boolean;
  isVisibile: boolean;
}

export interface RenderingVM {
  boxes: ElencoVM<BoxRenderizzatoVM> & {
    perId: Record<string, BoxRenderizzatoVM>;
    visibili: BoxRenderizzatoVM[];
    hasVisibili: boolean;
  };
  body: {
    htmlCompleto: string;
    htmlSoloContenuto: string;
  };
}

export interface ContestoTecnico {
  entita: {
    classe: object | null;
    alunno: object | null;
    docente: object | null;
    patternEmail: object | null;
    documentoMetadato: object | null;
  };
  servizi: object[];
  pipeline: {
    statoCorrente: string;
    stepEseguiti: string[];
    errori: string[];
    logEsecuzione: string[];
  };
}

export interface Cdu {
  meta: MetadatiVM;
  istituto?: IstitutoVM;
  focus: ContestoFocusVM;
  destinatario?: DestinatarioVM;
  render?: RenderingVM;
  readonly tech: ContestoTecnico;
}
