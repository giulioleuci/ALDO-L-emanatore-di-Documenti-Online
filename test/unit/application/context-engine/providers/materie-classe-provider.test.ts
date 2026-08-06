import { MaterieClasseProvider } from '../../../../../src/application/context-engine/providers/MaterieClasseProvider';
import type { Cdu, DocenteCdcVM } from '../../../../../src/application/context-engine/Cdu';

function docenteCdc(nomeCompleto: string, email: string, sigla: string, isITP = false): DocenteCdcVM {
  return {
    anagrafica: { nome: '', cognome: '', email, genere: 'M', appellativo: 'Prof.', articolo: 'il', coordinatore: 'coordinatore', nomeCompleto, materia: null, appellativoCompleto: `Prof. ${nomeCompleto}`, appellativoCognome: `Prof. ${nomeCompleto}` },
    materie: [{ sigla, nome: sigla, nomeSintetico: sigla, colore1: '', colore2: '', isMateriaPrimaProva: false, isMateriaSecondaProva: false, principale: null, specificita: null, isITP, evoluzione: null }],
    materieDescrizione: sigla,
    materieSigle: sigla,
    ruoli: { isCoordinatore: false, isTutorAsl: false, isTutorOrientamento: false, descrizione: [] },
    stato: { isSupplente: false, sostituisce: null },
    tipoArticolazione: null,
    gruppoNome: null,
    isITP,
    flags: { isNotLast: false }
  };
}

describe('MaterieClasseProvider', () => {
  it('groups the class council into a flat, deduped subject catalog with docentiDescrizione/hasItp', () => {
    const cdu = { focus: { classe: { consiglioDiClasse: [docenteCdc('Mario Rossi', 'm@x.it', 'ITA'), docenteCdc('Laura Gialli', 'l@x.it', 'ITA', true)] } } } as unknown as Cdu;
    new MaterieClasseProvider().provide(cdu);
    expect(cdu.focus.classe!.materie).toHaveLength(1);
    const ita = cdu.focus.classe!.materie![0]!;
    expect(ita.docenti?.map((d) => d.nomeCompleto)).toEqual(['Mario Rossi', 'Laura Gialli']);
    expect(ita.docentiDescrizione).toBe('Mario Rossi, Laura Gialli');
    expect(ita.hasItp).toBe(true);
  });
});
