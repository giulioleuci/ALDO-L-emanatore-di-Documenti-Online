import type { ContextProvider } from '../ContextProvider';
import type { Cdu, DocenteEsameVM, MateriaEsameVM, MateriaVM, PersonaVM } from '../Cdu';
import { descriviPersone } from '../mappers/personVmMapper';

type Prova = 'PRIMA_PROVA' | 'SECONDA_PROVA';

const prova = (materia: MateriaVM, value: Prova): MateriaEsameVM => ({
  ...materia,
  docenti: materia.docenti ?? [],
  hasDocenti: materia.hasDocenti ?? false,
  docentiDescrizione: materia.docentiDescrizione ?? '',
  docentiDescrizioneEstesa: materia.docentiDescrizioneEstesa ?? '',
  hasCattedraItp: materia.hasCattedraItp ?? false,
  prova: value,
  provaLabel: value === 'PRIMA_PROVA' ? 'Prima prova' : 'Seconda prova',
  isPrimaProva: value === 'PRIMA_PROVA',
  isSecondaProva: value === 'SECONDA_PROVA'
});

export class EsameProvider implements ContextProvider {
  provide(cdu: Cdu): void {
    const focus = cdu.focus.classe;
    if (focus?.materie === undefined) return;
    const prima = focus.materie.elenco.filter((materia) => materia.isMateriaPrimaProva).map((materia) => prova(materia, 'PRIMA_PROVA'));
    const seconda = focus.materie.elenco.filter((materia) => materia.isMateriaSecondaProva).map((materia) => prova(materia, 'SECONDA_PROVA'));
    const docentiPrima = this.docenti(prima, 'PRIMA_PROVA');
    const docentiSeconda = this.docenti(seconda, 'SECONDA_PROVA');
    const materie = [...prima, ...seconda];
    const docenti = [...docentiPrima, ...docentiSeconda];
    focus.esame = {
      hasEsame: materie.length > 0,
      materie,
      docenti,
      hasMaterie: materie.length > 0,
      hasDocenti: docenti.length > 0,
      materiePrimaProva: prima,
      materieSecondaProva: seconda,
      docentiPrimaProva: docentiPrima,
      docentiSecondaProva: docentiSeconda,
      hasMateriePrimaProva: prima.length > 0,
      hasMaterieSecondaProva: seconda.length > 0,
      hasDocentiPrimaProva: docentiPrima.length > 0,
      hasDocentiSecondaProva: docentiSeconda.length > 0,
      materiePrimaProvaDescrizione: prima.map((materia) => materia.nome).join(', '),
      materieSecondaProvaDescrizione: seconda.map((materia) => materia.nome).join(', '),
      docentiPrimaProvaDescrizione: descriviPersone(docentiPrima),
      docentiSecondaProvaDescrizione: descriviPersone(docentiSeconda)
    };
  }

  private docenti(materie: MateriaEsameVM[], provaEsame: Prova): DocenteEsameVM[] {
    const byEmail = new Map<string, { persona: PersonaVM; materie: MateriaVM[] }>();
    for (const materia of materie) {
      for (const docente of materia.docenti) {
        const key = docente.email ?? docente.nomeCompleto;
        const item = byEmail.get(key) ?? { persona: docente, materie: [] };
        item.materie.push(materia);
        byEmail.set(key, item);
      }
    }
    return [...byEmail.values()]
      .map(({ persona, materie: materieDocente }): DocenteEsameVM => ({
        ...persona,
        prova: provaEsame,
        provaLabel: provaEsame === 'PRIMA_PROVA' ? 'Prima prova' : 'Seconda prova',
        isPrimaProva: provaEsame === 'PRIMA_PROVA',
        isSecondaProva: provaEsame === 'SECONDA_PROVA',
        materie: materieDocente,
        hasMaterie: materieDocente.length > 0,
        numeroMaterie: materieDocente.length,
        materieDescrizione: materieDocente.map((materia) => materia.nome).join(', '),
        materieSigle: materieDocente.map((materia) => materia.sigla).join(', ')
      }))
      .sort((a, b) => a.nomeCompleto.localeCompare(b.nomeCompleto));
  }
}
