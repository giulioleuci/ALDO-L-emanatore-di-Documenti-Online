import type { Classe } from '../entities/Classe';
import type { ConsiglioDiClasse } from '../entities/ConsiglioDiClasse';
import type { Docente } from '../entities/Docente';
import type { Alunno } from '../entities/Alunno';
import type { Indirizzo } from '../entities/Indirizzo';
import type { ClasseId } from '../value-objects/ClasseId';
import type { MateriaId } from '../value-objects/MateriaId';
import type { ArticolazioneConfig } from '../value-objects/ArticolazioneConfig';
import type { GestioneArticolazione } from '../value-objects/enums';

export type RepoRow = Record<string, string | number | boolean | null>;
export type TeachingSlotKind = 'MAIN' | 'ITP' | 'SPECIFICA';

export interface TeachingSlotDescriptor {
  column: string;
  materia: MateriaId;
  kind: TeachingSlotKind;
  specifica: string | null;
  actorEmails: string[];
}

export interface IClasseRepository {
  findById(id: ClasseId): Classe | null;
  findAll(): Classe[];
  findAttive(): Classe[];
  getConsiglioDiClasse(id: ClasseId): ConsiglioDiClasse;
  getAlunniAttivi(id: ClasseId): RepoRow[];

  // --- Cattedra matrix / roles (ref 06 §3) ---
  getDocentiPerMateria(classe: Classe, materia: MateriaId): Docente[];
  getITPPerMateria(classe: Classe, materia: MateriaId): Docente[];
  getTeachingSlots(classe: Classe): TeachingSlotDescriptor[];
  /** Classes where the docente holds any teaching slot (MAIN/ITP/SPECIFICA), across all subjects. */
  findByDocenteAssegnato(docenteEmail: string): Classe[];
  getAllDocentiCDC(classe: Classe): Docente[];
  getDocentiIRC(classe: Classe): Docente[];
  getDocentiALT(classe: Classe): Docente[];
  getCoordinatori(classe: Classe): Docente[];
  getDocentiRuolo(classe: Classe, nomeRuolo: string): Docente[];
  /** Merges a RUOLI-based role across an articulated parent's partner classes; plain getDocentiRuolo otherwise. */
  getDocentiRuoloArticolato(classe: Classe, nomeRuolo: string): Docente[];

  // --- Indirizzo / studenti (ref 06 §3) ---
  getIndirizzo(classe: Classe): Indirizzo;
  getStudenti(classe: Classe, soloAttivi?: boolean): Alunno[];

  // --- Articolazione (ref 05, 06 §3) ---
  getArticolazione(classe: Classe): ArticolazioneConfig | null;
  isArticolata(classe: Classe): boolean;
  getClassiPartner(classe: Classe): Classe[];
  getClasseParent(classe: Classe): Classe | null;
  /** Ordered CSV of the class's own historical names, index 0 = immediately-prior year (ref 01, `CLASSI.STORICO`). */
  getStorico(classe: Classe): ClasseId[];
  getGruppoArticolazione(classe: Classe): Classe[];
  getAllDocentiCDCArticolata(classe: Classe): Docente[];
  getMaterieArticolazione(classe: Classe): {
    condivise: string[];
    separatePrimoGruppo: string[];
    separateSecondoGruppo: string[];
  } | null;
  /** The parent's two partners in canonical [primo, secondo] order, from any class in the group. */
  orderedPartners(classe: Classe): Classe[];
  /**
   * Filters `classi` by CONF_DOC/CONF_MAIL.GESTIONE_ARTICOLAZIONE: `COMPLETA`
   * excludes articolazione partners, `ARTICOLATA` excludes the parent.
   * Standard (non-articulated) classes always pass. The single place in the
   * app that decides class inclusion by articulation type.
   */
  filterPerGestioneArticolazione(classi: Classe[], gestione: GestioneArticolazione): Classe[];

  // --- Per-docente subject lookups (ref 09 §4) ---
  getMaterieDelDocente(
    classe: Classe,
    docenteEmail: string
  ): Array<{ sigla: string; isItp: boolean }>;
  getMateriaDocente(classe: Classe, docenteEmail: string): string | null;
}
