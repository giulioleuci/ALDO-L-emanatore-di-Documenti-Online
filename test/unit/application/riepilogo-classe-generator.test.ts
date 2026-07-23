import { RiepilogoClasseGeneratorStrategy } from '../../../src/application/strategies/RiepilogoClasseGeneratorStrategy';
import { FakeTemplateEngine } from '../../fakes/FakeTemplateEngine';
import type {
  IDocumentTableFacade,
  TablePlaceholder
} from '../../../src/infrastructure/facades/DocumentTableFacade';
import type { Cdu } from '../../../src/application/context-engine/Cdu';

class FakeDocumentTableFacade implements IDocumentTableFacade {
  insertedAtMarker: Array<{
    fileId: string;
    marker: string;
    data: string[][];
    options?: { headerRow?: boolean };
  }> = [];
  removed: Array<{ fileId: string; marker: string }> = [];
  callOrder: string[] = [];
  findTablePlaceholders(): TablePlaceholder[] {
    return [];
  }
  removeText(fileId: string, marker: string): void {
    this.removed.push({ fileId, marker });
    this.callOrder.push(`remove:${marker}`);
  }
  appendTable(): void {
    throw new Error('not used');
  }
  insertTableAtMarker(
    fileId: string,
    marker: string,
    data: string[][],
    options?: { headerRow?: boolean }
  ): void {
    this.insertedAtMarker.push({ fileId, marker, data, options });
    this.callOrder.push(`insert:${marker}`);
  }
}

function fakeCdu(): Cdu {
  return {
    meta: {
      date: { oggi: { breve: '09/07/2026' } },
      parametriInput: { target: '5A', tipoTarget: 'classe', opzioni: {} }
    },
    focus: {
      classe: {
        anagrafica: { nome: '5A', anno: 5, sezione: 'A', indirizzo: { nome: '', nomeSintetico: '', sigla: '', tipo: '' } },
        flags: { isClassePrima: false, isTriennio: true, isPrimoBiennio: false, isTerminale: true, isArticolata: false },
        consiglioDiClasse: [
          {
            anagrafica: { nome: 'Mario', cognome: 'Rossi', email: 'rossi@x.it', genere: 'M', appellativo: 'Prof.' },
            materie: [{ sigla: 'MAT', nome: 'Matematica', colore: '#c0392b', specificita: null }],
            ruoli: { isCoordinatore: true, isTutorAsl: true, isTutorOrientamento: false, descrizione: [] },
            stato: { isSupplente: false, sostituisce: null },
            tipoArticolazione: null,
            isITP: false,
            flags: { isNotLast: true }
          },
          {
            anagrafica: { nome: 'Anna', cognome: 'Bianchi', email: 'bianchi@x.it', genere: 'F', appellativo: 'Prof.ssa' },
            materie: [
              { sigla: 'ITA', nome: 'Italiano', colore: '#2980b9', specificita: null },
              { sigla: 'STO', nome: 'Storia', colore: '#2980b9', specificita: null }
            ],
            ruoli: { isCoordinatore: false, isTutorAsl: false, isTutorOrientamento: false, descrizione: [] },
            stato: { isSupplente: false, sostituisce: null },
            tipoArticolazione: null,
            isITP: false,
            flags: { isNotLast: false }
          }
        ],
        rappresentanti: {
          studenti: [{ nomeCompleto: 'Verdi Anna', email: 'a1@x.it' }],
          genitori: [{ nomeCompleto: 'Verdi Paolo' }]
        },
        studenti: {
          listaCompleta: [
            {
              anagrafica: { nomeCompleto: 'Verdi Anna', email: 'a1@x.it' },
              status: { isBes: false, isRipetente: false, isRappresentante: true, religione: 'SI' },
              curriculum: {},
              didattica: {
                carenze: { hasCarenze: false, numero: 0, dettaglio: [] },
                piani: { hasPiani: false, hasBes: false, items: [] },
                pcto: { oreCumulate: 0 }
              }
            },
            {
              anagrafica: { nomeCompleto: 'Neri Luca', email: 'a2@x.it' },
              status: { isBes: false, isRipetente: false, isRappresentante: false, religione: 'ALT' },
              curriculum: {},
              didattica: {
                carenze: { hasCarenze: false, numero: 0, dettaglio: [] },
                piani: { hasPiani: true, hasBes: false, items: [{ tipo: 'PDP_DSA', isBes: false }] },
                pcto: { oreCumulate: 0 }
              }
            }
          ],
          statistiche: { totale: 2, conPianiDidattici: 1, conBes: 0, conDsa: 1, ripetenti: 0, rappresentanti: 1 }
        }
      }
    },
    tech: {
      entita: {},
      servizi: [],
      pipeline: { statoCorrente: '', stepEseguiti: [], errori: [], logEsecuzione: [] }
    }
  } as unknown as Cdu;
}

describe('RiepilogoClasseGeneratorStrategy (item 4)', () => {
  test('inserts the student roster table at the marker, then removes the marker, then runs the generic pass', () => {
    const tables = new FakeDocumentTableFacade();
    const templates = new FakeTemplateEngine();
    const strategy = new RiepilogoClasseGeneratorStrategy(templates, tables);

    strategy.render('doc1', fakeCdu());

    expect(tables.insertedAtMarker).toEqual([
      {
        fileId: 'doc1',
        marker: '{{TABELLA_ALUNNI}}',
        data: [
          ['Nome', 'Religione', 'Email', 'Piani'],
          ['Verdi Anna', 'Sì', 'a1@x.it', '—'],
          ['Neri Luca', 'Alternativa', 'a2@x.it', 'PDP_DSA']
        ],
        options: { headerRow: true }
      }
    ]);
    expect(tables.removed).toEqual([{ fileId: 'doc1', marker: '{{TABELLA_ALUNNI}}' }]);
    expect(tables.callOrder).toEqual(['insert:{{TABELLA_ALUNNI}}', 'remove:{{TABELLA_ALUNNI}}']);
  });

  test('passes a flattened (docente, materia) bullet source and the no-ASL-tutoring list to the generic pass', () => {
    const tables = new FakeDocumentTableFacade();
    const templates = new FakeTemplateEngine();
    const strategy = new RiepilogoClasseGeneratorStrategy(templates, tables);

    strategy.render('doc1', fakeCdu());

    const context = templates.contextFor('doc1') as {
      riepilogoMaterieDocenti: Array<{ nomeMateria: string; nomeDocente: string }>;
      riepilogoDocentiSenzaTutoraggio: Array<{ nomeDocente: string }>;
      focus: unknown;
    };
    expect(context.riepilogoMaterieDocenti).toEqual([
      { nomeMateria: 'Matematica', nomeDocente: 'Mario Rossi' },
      { nomeMateria: 'Italiano', nomeDocente: 'Anna Bianchi' },
      { nomeMateria: 'Storia', nomeDocente: 'Anna Bianchi' }
    ]);
    expect(context.riepilogoDocentiSenzaTutoraggio).toEqual([{ nomeDocente: 'Anna Bianchi' }]);
    expect(context.focus).toBeDefined(); // the rest of the CDU still passes through
  });
});
