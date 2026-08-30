import { EsameProvider } from '../../../../../src/application/context-engine/providers/EsameProvider';
import type { Cdu } from '../../../../../src/application/context-engine/Cdu';
import { buildPersonaVm } from '../../../../../src/application/context-engine/mappers/personVmMapper';

function subject(sigla: string, prima: boolean, seconda: boolean, docenti: ReturnType<typeof buildPersonaVm>[]) {
  return { sigla, nome: sigla, nomeSintetico: sigla, colore1: '', colore2: '', isMateriaPrimaProva: prima, isMateriaSecondaProva: seconda, principale: null, specificita: null, isItp: false, evoluzione: { siglePrecedenti: [], hasSiglePrecedenti: false }, docenti, docentiDescrizione: docenti.map((d) => d.nomeCompleto).join(', ') };
}

describe('EsameProvider', () => {
  it('partitions the class catalog into prima/seconda prova materie and docenti', () => {
    const mario = buildPersonaVm({ nome: 'Mario', cognome: 'Rossi', email: 'm@x.it', genere: 'M' });
    const cdu = {
      focus: { classe: { materie: { elenco: [subject('ITA', true, false, [mario]), subject('STO', false, false, [])] } } }
    } as unknown as Cdu;
    new EsameProvider().provide(cdu);
    const esame = cdu.focus.classe!.esame!;
    expect(esame.hasEsame).toBe(true);
    expect(esame.materiePrimaProva.map((m) => m.sigla)).toEqual(['ITA']);
    expect(esame.materieSecondaProva).toEqual([]);
    expect(esame.docentiPrimaProva.map((d) => d.email)).toEqual(['m@x.it']);
    expect(esame.docenti[0]).toMatchObject({ email: 'm@x.it', prova: 'PRIMA_PROVA', materie: [expect.objectContaining({ sigla: 'ITA' })] });
  });

  it('hasEsame is false and every array is empty when no subject is a prova', () => {
    const cdu = { focus: { classe: { materie: { elenco: [subject('STO', false, false, [])] } } } } as unknown as Cdu;
    new EsameProvider().provide(cdu);
    expect(cdu.focus.classe!.esame).toMatchObject({
      hasEsame: false,
      materie: [],
      docenti: [],
      materiePrimaProva: [],
      materieSecondaProva: [],
      docentiPrimaProva: [],
      docentiSecondaProva: []
    });
  });
});
