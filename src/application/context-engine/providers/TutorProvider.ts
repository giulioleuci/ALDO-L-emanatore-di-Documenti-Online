import type { ContextProvider } from '../ContextProvider';
import type { Cdu, PersonaVM } from '../Cdu';
import type { IClasseRepository } from '../../../domain/repositories/IClasseRepository';
import { getClasseEntity } from '../techEntities';
import { buildCollettivoPersone, buildPersonaVm, descriviPersone } from '../mappers/personVmMapper';

export class TutorProvider implements ContextProvider {
  constructor(private readonly classi: IClasseRepository) {}

  provide(cdu: Cdu): void {
    const focus = cdu.focus.classe;
    if (focus === undefined) return;
    const classe = getClasseEntity(cdu);
    const asl = this.docenti(classe, 'TUTOR_ASL');
    const orientamento = this.docenti(classe, 'TUTOR_ORIENT');
    const elenco = [...asl, ...orientamento]
      .filter(
        (persona, index, persone) => persone.findIndex((x) => x.email === persona.email) === index
      )
      .sort((a, b) => a.nomeCompleto.localeCompare(b.nomeCompleto));
    const collettivo = buildCollettivoPersone(elenco);
    focus.tutor = {
      asl,
      orientamento,
      elenco,
      hasAsl: asl.length > 0,
      hasOrientamento: orientamento.length > 0,
      hasElenco: elenco.length > 0,
      numero: elenco.length,
      aslDescrizione: descriviPersone(asl),
      orientamentoDescrizione: descriviPersone(orientamento),
      elencoDescrizione: descriviPersone(elenco),
      collettivo: {
        appellativo: collettivo.appellativo,
        articolo: collettivo.articolo,
        sostantivo: 'Tutor',
        numero: elenco.length
      }
    };
  }

  private docenti(classe: ReturnType<typeof getClasseEntity>, ruolo: string): PersonaVM[] {
    return this.classi
      .getDocentiRuoloArticolato(classe, ruolo)
      .map((docente) =>
        buildPersonaVm({
          nome: docente.nome,
          cognome: docente.cognome,
          email: docente.id,
          genere: docente.genere,
          isEsterno: false
        })
      )
      .sort((a, b) => a.nomeCompleto.localeCompare(b.nomeCompleto));
  }
}
