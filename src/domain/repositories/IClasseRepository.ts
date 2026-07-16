import type { Classe } from '../entities/Classe';
import type { ConsiglioDiClasse } from '../entities/ConsiglioDiClasse';
import type { Docente } from '../entities/Docente';
import type { Alunno } from '../entities/Alunno';
import type { Indirizzo } from '../entities/Indirizzo';
import type { ClasseId } from '../value-objects/ClasseId';
import type { MateriaId } from '../value-objects/MateriaId';
import type { ArticolazioneConfig } from '../value-objects/ArticolazioneConfig';

export type RepoRow = Record<string, string | number | boolean | null>;

export interface IClasseRepository {
  // findById accepts a raw PK string too (base Repository.findById(id: string)),
  // matching ClasseRepository's own override — several consumers resolve a
  // Classe from an already-plain-string id (e.g. Alunno.classe, BuildParams.target).
  findById(id: string | ClasseId): Classe | null;
  findAll(): Classe[];
  findAttive(): Classe[];
  getConsiglioDiClasse(id: ClasseId): ConsiglioDiClasse;
  getAlunniAttivi(id: ClasseId): RepoRow[];

  // --- Cattedra matrix / roles (ref 06 §3) ---
  getDocentiPerMateria(classe: Classe, materia: MateriaId): Docente[];
  getAllDocentiCDC(classe: Classe): Docente[];
  getDocentiIRC(classe: Classe): Docente[];
  getDocentiALT(classe: Classe): Docente[];
  getCoordinatori(classe: Classe): Docente[];
  getDocentiRuolo(classe: Classe, nomeRuolo: string): Docente[];

  // --- Indirizzo / studenti (ref 06 §3) ---
  getIndirizzo(classe: Classe): Indirizzo;
  getStudenti(classe: Classe, soloAttivi?: boolean): Alunno[];

  // --- Articolazione (ref 05, 06 §3) ---
  getArticolazione(classe: Classe): ArticolazioneConfig | null;
  isArticolata(classe: Classe): boolean;
  getClassiPartner(classe: Classe): Classe[];
  getClasseParent(classe: Classe): Classe | null;
  getGruppoArticolazione(classe: Classe): Classe[];
  getAllDocentiCDCArticolata(classe: Classe): Docente[];
  getMaterieArticolazione(classe: Classe): {
    condivise: string[];
    separatePrimoGruppo: string[];
    separateSecondoGruppo: string[];
  } | null;

  // --- Per-docente subject lookups (ref 09 §4) ---
  getMaterieDelDocente(
    classe: Classe,
    docenteEmail: string
  ): Array<{ sigla: string; isItp: boolean }>;
  getMateriaDocente(classe: Classe, docenteEmail: string): string | null;
}
