import { MaterieClasseProvider } from '../../../../../src/application/context-engine/providers/MaterieClasseProvider';
import type { Cdu, DocenteCdcVM } from '../../../../../src/application/context-engine/Cdu';
import { makeOptions } from '../../../../../src/application/context-engine/Recipe';
import type { BuildParams } from '../../../../../src/application/context-engine/Recipe';
import { Classe } from '../../../../../src/domain/entities/Classe';
import { Materia } from '../../../../../src/domain/entities/Materia';
import type { IDocenteRepository } from '../../../../../src/domain/repositories/IDocenteRepository';
import type { IClasseRepository } from '../../../../../src/domain/repositories/IClasseRepository';
import type { IMateriaRepository } from '../../../../../src/domain/repositories/IMateriaRepository';
import type { StoricoDatabaseProvider } from '../../../../../src/application/storico/StoricoDatabaseProvider';

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

const params: BuildParams = { target: '3A', tipoTarget: 'classe', now: new Date('2026-08-06T09:00:00Z') };

function cduConClasse(consiglio: DocenteCdcVM[]): Cdu {
  const classe = Classe.fromData({ ID: '3A', ANNO: 3, INDIRIZZO: 'SCIENTIFICO' });
  return {
    focus: { classe: { consiglioDiClasse: consiglio } },
    tech: { entita: { classe } }
  } as unknown as Cdu;
}

describe('MaterieClasseProvider', () => {
  it('groups the class council into a flat, deduped subject catalog with docentiDescrizione/hasItp', () => {
    const cdu = { focus: { classe: { consiglioDiClasse: [docenteCdc('Mario Rossi', 'm@x.it', 'ITA'), docenteCdc('Laura Gialli', 'l@x.it', 'ITA', true)] } } } as unknown as Cdu;
    new MaterieClasseProvider().provide(cdu, params, makeOptions());
    expect(cdu.focus.classe!.materie).toHaveLength(1);
    const ita = cdu.focus.classe!.materie![0]!;
    expect(ita.docenti?.map((d) => d.nomeCompleto)).toEqual(['Mario Rossi', 'Laura Gialli']);
    expect(ita.docentiDescrizione).toBe('Mario Rossi, Laura Gialli');
    expect(ita.hasItp).toBe(true);
  });

  describe('continuita attachment (includiStorico)', () => {
    const docenti: IDocenteRepository = { findById: () => null } as unknown as IDocenteRepository;
    const classi: IClasseRepository = { getStorico: () => [] } as unknown as IClasseRepository;
    const storicoDb: StoricoDatabaseProvider = { anniStorici: () => [] };
    const materie: IMateriaRepository = {
      findById: (id: string) => Materia.fromData({ ID: id, NOME: id })
    } as unknown as IMateriaRepository;

    it('attaches continuita to each subject only when includiStorico is true', () => {
      const provider = new MaterieClasseProvider(materie, docenti, storicoDb, classi);
      const cdu = cduConClasse([docenteCdc('Mario Rossi', 'm@x.it', 'ITA')]);
      provider.provide(cdu, params, makeOptions({ includiStorico: true, profonditaAnniStorico: 2 }));
      expect(cdu.focus.classe!.materie![0]!.continuita).toBeDefined();

      const cdu2 = cduConClasse([docenteCdc('Mario Rossi', 'm@x.it', 'ITA')]);
      provider.provide(cdu2, params, makeOptions({ includiStorico: false }));
      expect(cdu2.focus.classe!.materie![0]!.continuita).toBeUndefined();
    });

    it('does not attach continuita when a required dependency is missing, even with includiStorico true', () => {
      const provider = new MaterieClasseProvider(materie); // docenti/storicoDb/classi absent
      const cdu = cduConClasse([docenteCdc('Mario Rossi', 'm@x.it', 'ITA')]);
      provider.provide(cdu, params, makeOptions({ includiStorico: true, profonditaAnniStorico: 1 }));
      expect(cdu.focus.classe!.materie![0]!.continuita).toBeUndefined();
    });
  });
});
