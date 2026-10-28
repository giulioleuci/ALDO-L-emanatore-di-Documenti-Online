import type { ContextProvider } from '../ContextProvider';
import type {
  ArticolazioneClasseVM,
  ClasseFocusVM,
  ClasseParentVM,
  Cdu,
  IndirizzoVM,
  MateriaVM
} from '../Cdu';
import type { BuildParams } from '../Recipe';
import type { IClasseRepository } from '../../../domain/repositories/IClasseRepository';
import type { IAlunnoRepository } from '../../../domain/repositories/IAlunnoRepository';
import type { IMateriaRepository } from '../../../domain/repositories/IMateriaRepository';
import type { Classe } from '../../../domain/entities/Classe';
import type { Materia } from '../../../domain/entities/Materia';
import type { ArticolazioneConfig } from '../../../domain/value-objects/ArticolazioneConfig';
import { ClasseId } from '../../../domain/value-objects/ClasseId';
import { MateriaId } from '../../../domain/value-objects/MateriaId';
import { IndirizzoId } from '../../../domain/value-objects/IndirizzoId';
import { setClasseEntity } from '../techEntities';
import { EntityNotFoundError, ValidationError } from '../../../domain/errors/DomainError';
import {
  buildCollettivoPersone,
  buildPersonaVm,
  descriviPersone,
  descriviPersoneEsteso,
  minuscolaIniziale
} from '../mappers/personVmMapper';
import { buildMateriaVm } from '../mappers/subjectVmMapper';
import { elencoVm } from '../mappers/elencoVm';
import { indirizzoTipoLabel } from '../mappers/labels';

/**
 * `ClasseSintesiVM.sezione` is "sezione pura, senza anno o sigle d'indirizzo"
 * (08 §8.20/§4.1) — distinct from `CattedraVM.sezioneEstesa` (`Classe.sezione`,
 * the class name minus its leading year digits, e.g. "F-LSO"). Articulated
 * partner classes append their indirizzo code after a hyphen (e.g. "1F-LSO");
 * the pure section is the leading segment before it.
 */
export function sezionePura(classe: Classe): string {
  return classe.sezione.split('-')[0] ?? classe.sezione;
}

function indirizzoVm(classe: Classe, classi: IClasseRepository): IndirizzoVM {
  const indirizzo = classi.getIndirizzo(classe);
  return {
    sigla: classe.indirizzo,
    nome: indirizzo.nome,
    nomeSintetico: indirizzo.nomeSintetico,
    tipo: indirizzo.tipo,
    tipoLabel: indirizzoTipoLabel(indirizzo.tipo)
  };
}

export class ClasseProvider implements ContextProvider {
  constructor(
    private readonly classi: IClasseRepository,
    private readonly alunni?: IAlunnoRepository,
    private readonly materie?: IMateriaRepository
  ) {}

  provide(cdu: Cdu, params: BuildParams): void {
    const classe = this.resolveClasse(params);
    setClasseEntity(cdu, classe);
    const config = this.classi.getArticolazione(classe);
    const anno = classe.anno.value;
    const focus: ClasseFocusVM = {
      nome: classe.nome,
      anno,
      sezione: sezionePura(classe),
      indirizzo: indirizzoVm(classe, this.classi),
      isClassePrima: classe.anno.isPrima(),
      isTriennio: anno >= 3,
      isPrimoBiennio: classe.anno.isPrimoBiennio(),
      isSecondoBiennio: anno === 3 || anno === 4,
      isTerminale: classe.anno.isTerminale(),
      isArticolata: config !== null,
      isParent: config?.isParent() ?? false,
      isSottoClasse: config?.isPartner() ?? false,
      hasAsl: classe.asl,
      coordinatori: this.coordinatori(classe)
    };
    if (config !== null) focus.articolazione = this.articolazione(classe, config);
    cdu.focus.classe = focus;
  }

  private resolveClasse(params: BuildParams): Classe {
    if (params.tipoTarget === 'alunno') {
      if (this.alunni === undefined)
        throw new ValidationError('ClasseProvider richiede AlunnoRepository');
      const alunno = this.alunni.findById(params.target);
      if (alunno === null) throw new EntityNotFoundError(`Alunno ${params.target} non trovato`);
      const classe = this.classi.findById(alunno.classeId);
      if (classe === null) throw new EntityNotFoundError(`Classe ${alunno.classe} non trovata`);
      return classe;
    }
    const classe = this.classi.findById(ClasseId.of(params.target));
    if (classe === null) throw new EntityNotFoundError(`Classe ${params.target} non trovata`);
    return classe;
  }

  private coordinatori(classe: Classe): NonNullable<ClasseFocusVM['coordinatori']> {
    const sorgenti = this.classi.getArticolazione(classe)?.isParent()
      ? [classe, ...this.classi.getClassiPartner(classe)]
      : [classe];
    const elenco = sorgenti
      .flatMap((sorgente) => this.classi.getCoordinatori(sorgente))
      .map((docente) =>
        buildPersonaVm({
          nome: docente.nome,
          cognome: docente.cognome,
          email: docente.id,
          genere: docente.genere,
          isEsterno: false
        })
      )
      .filter(
        (persona, index, persone) => persone.findIndex((x) => x.email === persona.email) === index
      )
      .sort((a, b) => a.nomeCompleto.localeCompare(b.nomeCompleto));
    const collettivo = buildCollettivoPersone(elenco);
    const personeNelRuolo = minuscolaIniziale(descriviPersone(elenco));
    return {
      ...elencoVm(elenco),
      elencoDescrizione: descriviPersone(elenco),
      elencoDescrizioneEstesa: descriviPersoneEsteso(elenco),
      elencoDescrizioneElenco: elenco
        .map((persona, index) =>
          index === 0 ? persona.appellativoCompleto : minuscolaIniziale(persona.appellativoCompleto)
        )
        .join(', '),
      descrizioneRuolo: elenco.length === 0 ? '' : `${collettivo.coordinamento} ${personeNelRuolo}`,
      descrizioneRuoloEstesa:
        elenco.length === 0
          ? ''
          : `${collettivo.articolo} ${minuscolaIniziale(collettivo.coordinamento)} ${personeNelRuolo}`,
      collettivo
    };
  }

  private articolazione(classe: Classe, config: ArticolazioneConfig): ArticolazioneClasseVM {
    const materie = this.classi.getMaterieArticolazione(classe);
    const comuni = this.materieVm(materie?.condivise ?? [], classe);
    const primo = this.materieVm(materie?.separatePrimoGruppo ?? [], classe);
    const secondo = this.materieVm(materie?.separateSecondoGruppo ?? [], classe);
    const partners = config.isParent() ? this.classi.orderedPartners(classe) : [];
    return {
      classeSorella: config.partner === null ? null : { nome: config.partner.value },
      parent: this.parent(config),
      sottoClassi: partners.map((partner) => ({ nome: partner.nome })),
      hasSottoClassi: partners.length > 0,
      materieComuni: comuni,
      materieSeparatePrimo: primo,
      materieSeparateSecondo: secondo,
      hasMaterieComuni: comuni.length > 0,
      hasMaterieSeparatePrimo: primo.length > 0,
      hasMaterieSeparateSecondo: secondo.length > 0,
      materieComuniDescrizione: comuni.map((materia) => materia.nome).join(', '),
      materieComuniSigle: comuni.map((materia) => materia.sigla).join(', '),
      materieSeparatePrimoDescrizione: primo.map((materia) => materia.nome).join(', '),
      materieSeparatePrimoSigle: primo.map((materia) => materia.sigla).join(', '),
      materieSeparateSecondoDescrizione: secondo.map((materia) => materia.nome).join(', '),
      materieSeparateSecondoSigle: secondo.map((materia) => materia.sigla).join(', ')
    };
  }

  private parent(config: ArticolazioneConfig): ClasseParentVM | null {
    if (config.parent === null) return null;
    const parent = this.classi.findById(config.parent);
    if (parent === null) return null;
    const indirizzi = this.classi
      .orderedPartners(parent)
      .map((partner) => indirizzoVm(partner, this.classi));
    return {
      nome: parent.nome,
      anno: parent.anno.value,
      indirizzi,
      hasIndirizzi: indirizzi.length > 0,
      indirizziDescrizione: indirizzi.map((indirizzo) => indirizzo.nome).join(', ')
    };
  }

  private materieVm(sigle: string[], classe: Classe): MateriaVM[] {
    if (this.materie === undefined) return [];
    return sigle
      .map((sigla) => this.materie!.findByIdCached(MateriaId.of(sigla)))
      .filter((materia): materia is Materia => materia !== null)
      .map((materia) =>
        buildMateriaVm(materia, 'BASE', { indirizzo: IndirizzoId.of(classe.indirizzo) })
      )
      .sort((a, b) => a.nome.localeCompare(b.nome));
  }
}
