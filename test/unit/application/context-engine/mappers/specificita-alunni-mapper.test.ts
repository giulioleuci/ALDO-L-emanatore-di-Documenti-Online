import { buildPerSpecificita } from '../../../../../src/application/context-engine/mappers/specificitaAlunniMapper';
import type { AlunnoContestoVM } from '../../../../../src/application/context-engine/Cdu';

function studente(
  nomeCompleto: string,
  email: string,
  curriculum: AlunnoContestoVM['curriculum']
): AlunnoContestoVM {
  return {
    anagrafica: { nomeCompleto, email },
    classe: { nome: 'x' },
    indirizzo: { nome: 'x', nomeSintetico: 'x' },
    status: {
      isBes: false,
      isRipetente: false,
      isRappresentante: false,
      religione: 'IRC',
      religioneLabel: 'x'
    },
    curriculum,
    didattica: {
      carenze: { hasCarenze: false, numero: 0, dettaglio: [] },
      piani: { hasPiani: false, hasBes: false, items: [] },
      pcto: { oreCumulate: 0 }
    }
  };
}

describe('buildPerSpecificita', () => {
  it('groups students by materia then specifica, in a 3-level array', () => {
    const marco = studente('Marco Neri', 'marco.neri@x.it', [
      {
        materiaId: 'INTERPRET',
        materiaSigla: 'INTERPRET',
        materiaNome: 'Esecuzione ed interpretazione',
        specifiche: [{ nome: 'chitarra' }]
      }
    ]);
    const anna = studente('Anna Leone', 'anna.leone@x.it', [
      {
        materiaId: 'INTERPRET',
        materiaSigla: 'INTERPRET',
        materiaNome: 'Esecuzione ed interpretazione',
        specifiche: [{ nome: 'chitarra' }]
      }
    ]);
    const result = buildPerSpecificita([marco, anna]);
    expect(result).toEqual([
      {
        materiaId: 'INTERPRET',
        materiaSigla: 'INTERPRET',
        materiaNome: 'Esecuzione ed interpretazione',
        specifiche: [
          {
            nome: 'chitarra',
            alunni: [
              { nome: null, cognome: null, nomeCompleto: 'Marco Neri', email: 'marco.neri@x.it' },
              { nome: null, cognome: null, nomeCompleto: 'Anna Leone', email: 'anna.leone@x.it' }
            ]
          }
        ]
      }
    ]);
  });

  it('returns an empty array when no student has a curriculum entry', () => {
    expect(buildPerSpecificita([studente('x', 'x@x.it', [])])).toEqual([]);
  });
});
