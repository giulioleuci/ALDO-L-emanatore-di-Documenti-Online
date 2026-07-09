import { RisolutoreRuoliService } from '../../../src/application/services/RisolutoreRuoliService';
import { ContextEngineFactory } from '../../../src/application/context-engine/ContextEngineFactory';
import { recipe } from '../../../src/application/context-engine/Recipe';
import type { BuildParams } from '../../../src/application/context-engine/Recipe';
import type { Cdu } from '../../../src/application/context-engine/Cdu';
import { GestioneSupplenti } from '../../../src/domain/value-objects/enums';
import { FakeDatabase } from '../../../test/fakes/FakeDatabase';
import { fixtureTables } from '../../../test/fixtures/tables';

const NOW = new Date('2026-07-01T09:00:00Z'); // outside every supplenza window

function build(params: Partial<BuildParams>, recipeName = 'CLASSE_COMPLETA'): { cdu: Cdu; service: RisolutoreRuoliService } {
  const db = new FakeDatabase(fixtureTables());
  const buildParams: BuildParams = { target: '5A', tipoTarget: 'classe', now: NOW, ...params };
  const cdu = ContextEngineFactory.create(db).build(buildParams, recipe(recipeName));
  return { cdu, service: new RisolutoreRuoliService(db) };
}

function emails(service: RisolutoreRuoliService, ruolo: string, cdu: Cdu, opts?: { regolaSupplente?: GestioneSupplenti }): string[] {
  return service.risolvi(ruolo, cdu, opts).map((e) => e.value).sort();
}

describe('RisolutoreRuoliService — class roles (14 §1.1)', () => {
  test('COORDINATORI reads CLASSI.COORD', () => {
    const { cdu, service } = build({});
    expect(emails(service, 'COORDINATORI', cdu)).toEqual(['rossi@school.it']);
  });

  test('CDC returns the whole consiglio di classe', () => {
    const { cdu, service } = build({});
    expect(emails(service, 'CDC', cdu)).toEqual(['bianchi@school.it', 'rossi@school.it']);
  });

  test('DOCENTI_NO_RELIGIONE removes the IRC teacher', () => {
    const { cdu, service } = build({});
    // 5A: IRC = bianchi (also FISI holder). Removing IRC drops bianchi's IRC role,
    // but bianchi remains via FISI. Verify rossi present, and no duplication.
    expect(emails(service, 'DOCENTI_NO_RELIGIONE', cdu)).toEqual(['bianchi@school.it', 'rossi@school.it']);
  });

  test('DOCENTI_IRC_ALT merges CLASSI.IRC + CLASSI.ALT, deduped (MAT_NON_STANDARD §2.C)', () => {
    const { cdu, service } = build({});
    // 5A: IRC = bianchi, no ALT column set — merge degrades to just IRC.
    expect(emails(service, 'DOCENTI_IRC_ALT', cdu)).toEqual(['bianchi@school.it']);
  });
});

describe('RisolutoreRuoliService — single-teacher roles (14 §1.1)', () => {
  test('SEGRETARIO_CDC reads CLASSI.RUOLI JSON', () => {
    const { cdu, service } = build({});
    expect(emails(service, 'SEGRETARIO_CDC', cdu)).toEqual(['rossi@school.it']);
  });

  test('TUTOR_ASL reads CLASSI.RUOLI JSON (CSV multi-holder)', () => {
    const { cdu, service } = build({});
    expect(emails(service, 'TUTOR_ASL', cdu)).toEqual(['bianchi@school.it', 'rossi@school.it']);
  });

  test('DOCENTE_MATERIA resolves the class column for meta.parametriInput.materiaCorrente', () => {
    const { cdu, service } = build({ materiaCorrente: 'MATE' });
    expect(emails(service, 'DOCENTE_MATERIA', cdu)).toEqual(['rossi@school.it']);
  });

  test('CAPO_DIPARTIMENTO resolves the department of materiaCorrente', () => {
    const { cdu, service } = build({ materiaCorrente: 'MATE' });
    expect(emails(service, 'CAPO_DIPARTIMENTO', cdu)).toEqual(['rossi@school.it']);
  });
});

describe('RisolutoreRuoliService — dynamic RUOLI (ReferenteStrategy jolly, 14 §1.1)', () => {
  test('a role matching a RUOLI.ID resolves RUOLI.DOCENTE', () => {
    const { cdu, service } = build({});
    expect(emails(service, 'REF_BES', cdu)).toEqual(['bianchi@school.it', 'rossi@school.it']);
    expect(emails(service, 'AN_DIG', cdu)).toEqual(['bianchi@school.it']);
  });

  test('an unknown role (neither strategy nor RUOLI id) throws', () => {
    const { cdu, service } = build({});
    expect(() => service.risolvi('INESISTENTE', cdu)).toThrow(/INESISTENTE/);
  });
});

describe('RisolutoreRuoliService — student/family roles (14 §1.1)', () => {
  test('RAPPRESENTANTI_STUDENTI reads active RAPPR_STUD students of the class', () => {
    const { cdu, service } = build({});
    expect(emails(service, 'RAPPRESENTANTI_STUDENTI', cdu)).toEqual(['a1@school.it']);
  });

  test('GENITORI_CLASSE aggregates tutors of active students', () => {
    const { cdu, service } = build({});
    expect(emails(service, 'GENITORI_CLASSE', cdu)).toEqual(['genitore1@x.it']);
  });

  test('ALUNNO and FAMIGLIA resolve from focus.alunno', () => {
    const { cdu, service } = build({ target: 'a1@school.it', tipoTarget: 'alunno' }, 'ALUNNO_COMPLETO');
    expect(emails(service, 'ALUNNO', cdu)).toEqual(['a1@school.it']);
    expect(emails(service, 'FAMIGLIA', cdu)).toEqual(['genitore1@x.it']);
  });
});

describe('RisolutoreRuoliService — supplenza routing (14 §1.2)', () => {
  const INSIDE_WINDOW = new Date('2025-11-15T09:00:00Z'); // rossi→bianchi→verdi chain active

  function buildAt(now: Date) {
    const db = new FakeDatabase(fixtureTables());
    const cdu = ContextEngineFactory.create(db).build(
      { target: '5A', tipoTarget: 'classe', now },
      recipe('CLASSE_COMPLETA')
    );
    return { cdu, service: new RisolutoreRuoliService(db) };
  }

  test('SOLO_TITOLARI (default) ignores active supplenze', () => {
    const { cdu, service } = buildAt(INSIDE_WINDOW);
    expect(emails(service, 'COORDINATORI', cdu)).toEqual(['rossi@school.it']);
  });

  test('SOLO_SUPPLENTI routes a coordinator to the chain-resolved substitute', () => {
    const { cdu, service } = buildAt(INSIDE_WINDOW);
    expect(emails(service, 'COORDINATORI', cdu, { regolaSupplente: GestioneSupplenti.SOLO_SUPPLENTI }))
      .toEqual(['verdi@school.it']);
  });

  test('ENTRAMBI keeps both titolare and substitute', () => {
    const { cdu, service } = buildAt(INSIDE_WINDOW);
    expect(emails(service, 'COORDINATORI', cdu, { regolaSupplente: GestioneSupplenti.ENTRAMBI }))
      .toEqual(['rossi@school.it', 'verdi@school.it']);
  });

  test('student/family roles are never subject to supplenza routing', () => {
    const { cdu, service } = buildAt(INSIDE_WINDOW);
    expect(emails(service, 'GENITORI_CLASSE', cdu, { regolaSupplente: GestioneSupplenti.SOLO_SUPPLENTI }))
      .toEqual(['genitore1@x.it']);
  });
});
