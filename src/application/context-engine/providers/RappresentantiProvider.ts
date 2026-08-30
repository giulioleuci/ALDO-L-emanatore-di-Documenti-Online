import type { ContextProvider } from '../ContextProvider';
import type { Cdu, RappresentanteGenitoreVM, RappresentanteStudenteVM } from '../Cdu';
import type { IClasseRepository } from '../../../domain/repositories/IClasseRepository';
import { getClasseEntity } from '../techEntities';
import { elencoVm } from '../mappers/elencoVm';
import { indirizzoTipoLabel } from '../mappers/labels';

export class RappresentantiProvider implements ContextProvider {
  constructor(private readonly classi: IClasseRepository) {}

  provide(cdu: Cdu): void {
    const focus = cdu.focus.classe;
    if (focus === undefined) return;
    const classe = getClasseEntity(cdu);
    const sorgenti = this.classi.getArticolazione(classe)?.isParent() ? this.classi.getClassiPartner(classe) : [classe];
    const studenti: RappresentanteStudenteVM[] = [];
    const genitori: RappresentanteGenitoreVM[] = [];
    for (const sorgente of sorgenti) {
      const indirizzo = sorgenti.length > 1
        ? (() => { const value = this.classi.getIndirizzo(sorgente); return { sigla: sorgente.indirizzo, nome: value.nome, nomeSintetico: value.nomeSintetico, tipo: value.tipo, tipoLabel: indirizzoTipoLabel(value.tipo) }; })()
        : null;
      for (const alunno of this.classi.getStudenti(sorgente)) {
        const studente = { nomeCompleto: alunno.cognomeNome, email: alunno.email.value };
        if (alunno.isRappresentante()) studenti.push({ studente, indirizzo, hasIndirizzo: indirizzo !== null });
        const nomeCompleto = alunno.getRappresentanteGenitore().trim();
        if (nomeCompleto !== '') genitori.push({ nomeCompleto, studente, indirizzo, hasIndirizzo: indirizzo !== null, descrizione: `${nomeCompleto} (${alunno.cognomeNome})` });
      }
    }
    studenti.sort((a, b) => a.studente.nomeCompleto.localeCompare(b.studente.nomeCompleto));
    genitori.sort((a, b) => a.nomeCompleto.localeCompare(b.nomeCompleto));
    focus.rappresentanti = {
      studenti: { ...elencoVm(studenti), elencoDescrizione: studenti.map((item) => item.studente.nomeCompleto).join(', ') },
      genitori: { ...elencoVm(genitori), elencoDescrizione: genitori.map((item) => item.descrizione).join(', ') }
    };
  }
}
