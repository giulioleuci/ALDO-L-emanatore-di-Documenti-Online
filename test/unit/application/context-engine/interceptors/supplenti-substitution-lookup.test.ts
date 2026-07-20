import { createSupplentiSubstitutionLookup } from '../../../../../src/application/context-engine/interceptors/SupplentiSubstitutionLookup';
import type { Cdu, DocenteCdcVM } from '../../../../../src/application/context-engine/Cdu';
import type { IDocenteRepository } from '../../../../../src/domain/repositories/IDocenteRepository';
import type { ISupplenzaRepository } from '../../../../../src/domain/repositories/ISupplenzaRepository';
import { Docente } from '../../../../../src/domain/entities/Docente';
import { Supplenza } from '../../../../../src/domain/entities/Supplenza';
import { Classe } from '../../../../../src/domain/entities/Classe';
import { ClasseId } from '../../../../../src/domain/value-objects/ClasseId';
import { AnnoCorso } from '../../../../../src/domain/value-objects/AnnoCorso';
import { Email } from '../../../../../src/domain/value-objects/Email';
import { Genere, GestioneSupplenti } from '../../../../../src/domain/value-objects/enums';
import { COL_SUPPLENZE } from '../../../../../src/config/schema';

const titolare = Docente.create(Email.of('rossi@school.it'), 'ROSSI', 'MARIO', Genere.M);
const supplente = Docente.create(Email.of('bianchi@school.it'), 'BIANCHI', 'LUCIA', Genere.F);
const classe = Classe.create(ClasseId.of('5A'), AnnoCorso.of(5), 'SCIENTIFICO');

function vm(): DocenteCdcVM {
  return {
    anagrafica: {
      nome: 'MARIO',
      cognome: 'ROSSI',
      email: 'rossi@school.it',
      genere: 'M',
      appellativo: 'Prof.'
    },
    materie: [{ sigla: 'MATE', nome: 'Matematica', colore: '#000', specificita: null }],
    ruoli: { isCoordinatore: false, isTutorAsl: false, isTutorOrientamento: false, descrizione: [] },
    stato: { isSupplente: false, sostituisce: null },
    tipoArticolazione: null,
    isITP: false,
    flags: { isNotLast: true }
  };
}

function baseCdu(): Cdu {
  return {
    tech: { entita: { classe } },
    meta: { date: { oggi: { iso: '2026-01-15' } } }
  } as unknown as Cdu;
}

function docenteRepo(overrides: Partial<IDocenteRepository> = {}): IDocenteRepository {
  return {
    findById: (id: string) =>
      id === titolare.id ? titolare : id === supplente.id ? supplente : null,
    findAll: () => [titolare, supplente],
    ...overrides
  };
}

function supplenzaRepo(result: Supplenza | null): ISupplenzaRepository {
  return { findSupplenzaSpecifica: () => result };
}

const attivaSupplenza = new Supplenza({
  [COL_SUPPLENZE.TITOLARE]: 'rossi@school.it',
  [COL_SUPPLENZE.SUPPLENTE]: 'bianchi@school.it',
  [COL_SUPPLENZE.DAL]: '2026-01-01',
  [COL_SUPPLENZE.CLASSI]: '*',
  [COL_SUPPLENZE.MATERIE]: '*'
});

describe('createSupplentiSubstitutionLookup: gate conditions', () => {
  test('no gestioneSupplenti option: returns null (no swap)', () => {
    const lookup = createSupplentiSubstitutionLookup(docenteRepo(), supplenzaRepo(attivaSupplenza));
    expect(lookup(vm(), baseCdu(), {})).toBeNull();
  });

  test('SOLO_TITOLARI rule: returns null (no swap)', () => {
    const lookup = createSupplentiSubstitutionLookup(docenteRepo(), supplenzaRepo(attivaSupplenza));
    expect(
      lookup(vm(), baseCdu(), { gestioneSupplenti: GestioneSupplenti.SOLO_TITOLARI })
    ).toBeNull();
  });

  test('no classe in cdu.tech.entita: returns null', () => {
    const lookup = createSupplentiSubstitutionLookup(docenteRepo(), supplenzaRepo(attivaSupplenza));
    const cdu = { tech: { entita: {} }, meta: { date: { oggi: { iso: '2026-01-15' } } } } as unknown as Cdu;
    expect(
      lookup(vm(), cdu, { gestioneSupplenti: GestioneSupplenti.SOLO_SUPPLENTI })
    ).toBeNull();
  });

  test('titolare not found in DOCENTI: returns null', () => {
    const repo = docenteRepo({ findById: () => null });
    const lookup = createSupplentiSubstitutionLookup(repo, supplenzaRepo(attivaSupplenza));
    expect(
      lookup(vm(), baseCdu(), { gestioneSupplenti: GestioneSupplenti.SOLO_SUPPLENTI })
    ).toBeNull();
  });

  test('no active supplenza for any of the vm subjects: returns null', () => {
    const lookup = createSupplentiSubstitutionLookup(docenteRepo(), supplenzaRepo(null));
    expect(
      lookup(vm(), baseCdu(), { gestioneSupplenti: GestioneSupplenti.SOLO_SUPPLENTI })
    ).toBeNull();
  });

  test('resolved supplente email not itself found in DOCENTI: returns null', () => {
    const repo = docenteRepo({
      findById: (id: string) => (id === titolare.id ? titolare : null)
    });
    const lookup = createSupplentiSubstitutionLookup(repo, supplenzaRepo(attivaSupplenza));
    expect(
      lookup(vm(), baseCdu(), { gestioneSupplenti: GestioneSupplenti.SOLO_SUPPLENTI })
    ).toBeNull();
  });
});

describe('createSupplentiSubstitutionLookup: SOLO_SUPPLENTI', () => {
  test('overwrites both stato and anagrafica with the resolved supplente', () => {
    const lookup = createSupplentiSubstitutionLookup(docenteRepo(), supplenzaRepo(attivaSupplenza));
    const outcome = lookup(vm(), baseCdu(), { gestioneSupplenti: GestioneSupplenti.SOLO_SUPPLENTI });
    expect(outcome).toEqual({
      action: 'annotate',
      meta: {
        stato: {
          isSupplente: true,
          sostituisce: { nome: 'ROSSI MARIO', email: 'rossi@school.it' }
        },
        anagrafica: {
          nome: 'LUCIA',
          cognome: 'BIANCHI',
          email: 'bianchi@school.it',
          genere: 'F',
          appellativo: 'Prof.ssa'
        }
      }
    });
  });
});

describe('createSupplentiSubstitutionLookup: ENTRAMBI', () => {
  test('keeps titolare anagrafica untouched, only records who substitutes', () => {
    const lookup = createSupplentiSubstitutionLookup(docenteRepo(), supplenzaRepo(attivaSupplenza));
    const outcome = lookup(vm(), baseCdu(), { gestioneSupplenti: GestioneSupplenti.ENTRAMBI });
    expect(outcome).toEqual({
      action: 'annotate',
      meta: {
        stato: {
          isSupplente: false,
          sostituisce: { nome: 'BIANCHI LUCIA', email: 'bianchi@school.it' }
        }
      }
    });
    expect((outcome as { meta: { anagrafica?: unknown } }).meta.anagrafica).toBeUndefined();
  });
});
