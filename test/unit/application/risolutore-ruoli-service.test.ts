import { RisolutoreRuoliService } from '../../../src/application/services/RisolutoreRuoliService';
import {
  composeContextBuilder,
  composeRisolutoreRuoli
} from '../../../src/config/ApplicationComposition';
import { recipe } from '../../../src/application/context-engine/Recipe';
import type { BuildParams } from '../../../src/application/context-engine/Recipe';
import type { Cdu } from '../../../src/application/context-engine/Cdu';
import { GestioneSupplenti } from '../../../src/domain/value-objects/enums';
import { FakeDatabase } from '../../../test/fakes/FakeDatabase';
import { fixtureTables } from '../../../test/fixtures/tables';
import { ClasseRepository } from '../../../src/infrastructure/repositories/ClasseRepository';
import { DocenteRepository } from '../../../src/infrastructure/repositories/DocenteRepository';
import { Docente } from '../../../src/domain/entities/Docente';
import type { Row } from '../../../src/infrastructure/db/Database';
import { AldoTeachingAssignmentResolver } from '../../../src/infrastructure/role-resolution/AldoTeachingAssignmentResolver';
import { buildPersonaVm } from '../../../src/application/context-engine/mappers/personVmMapper';
import type { DipartimentoFocusVM } from '../../../src/application/context-engine/Cdu';

const NOW = new Date('2026-07-01T09:00:00Z'); // outside every supplenza window

function build(
  params: Partial<BuildParams>,
  recipeName = 'CLASSE_COMPLETA'
): { cdu: Cdu; service: RisolutoreRuoliService } {
  const db = new FakeDatabase(fixtureTables());
  const buildParams: BuildParams = { target: '5A', tipoTarget: 'classe', now: NOW, ...params };
  const cdu = composeContextBuilder(db).build(buildParams, recipe(recipeName));
  return { cdu, service: composeRisolutoreRuoli(db) };
}

function emails(
  service: RisolutoreRuoliService,
  ruolo: string,
  cdu: Cdu,
  opts?: { regolaSupplente?: GestioneSupplenti }
): string[] {
  return service
    .risolvi(ruolo, cdu, opts)
    .map((e) => e.value)
    .sort();
}

describe('RisolutoreRuoliService — class roles (14 §1.1)', () => {
  test('COORDINATORI reads CLASSI.COORD', () => {
    const { cdu, service } = build({});
    expect(emails(service, 'COORDINATORI', cdu)).toEqual(['rossi@school.it']);
  });

  test('CDC returns the whole consiglio di classe', () => {
    const { cdu, service } = build({});
    // 5A: MATE effective holder is bianchi (VARIAZIONI_CATTEDRA, decorsa since 2025-10-01);
    // FISI nominal holder is also bianchi -> one distinct effective teacher.
    expect(emails(service, 'CDC', cdu)).toEqual(['bianchi@school.it']);
  });

  test('DOCENTI_NO_RELIGIONE removes the IRC teacher', () => {
    const { cdu, service } = build({});
    // Both MATE (effective, post-variazione) and FISI resolve to bianchi at NOW.
    expect(emails(service, 'DOCENTI_NO_RELIGIONE', cdu)).toEqual(['bianchi@school.it']);
  });

  test('DOCENTI_IRC_ALT resolves the effective IRC/ALT holder via CattedraResolver, deduped', () => {
    const { cdu, service } = build({});
    // 5A: IRC's effective holder is bianchi (no variazione on IRC in this fixture,
    // nominal CLASSI.IRC holds); no ALT column set for 5A — merge degrades to just IRC.
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

  test('DOCENTE_MATERIA resolves the effective holder for meta.parametriInput.materiaCorrente', () => {
    const { cdu, service } = build({ materiaCorrente: 'MATE' });
    expect(emails(service, 'DOCENTE_MATERIA', cdu)).toEqual(['bianchi@school.it']);
  });

  test('CAPO_DIPARTIMENTO resolves the department of materiaCorrente', () => {
    const { cdu, service } = build({ materiaCorrente: 'MATE' });
    expect(emails(service, 'CAPO_DIPARTIMENTO', cdu)).toEqual(['rossi@school.it']);
  });
});

function dipartimentoFocus(overrides: Partial<DipartimentoFocusVM>): DipartimentoFocusVM {
  return {
    id: 'DIP',
    nome: 'Dipartimento',
    capo: null,
    materie: [],
    docenti: [],
    documenti: { elenco: [], hasElenco: false, numero: 0 },
    ...overrides
  };
}

function person(email: string) {
  return buildPersonaVm({ nome: 'Nome', cognome: 'Cognome', email, genere: 'M' });
}

describe('RisolutoreRuoliService — DOCENTE_CORRENTE / DOCENTI_DIPARTIMENTO / CAPO_DIPART (Task 4)', () => {
  test('DOCENTE_CORRENTE resolves cdu.focus.docente.email', () => {
    const { cdu, service } = build({});
    cdu.focus.docente = person('prof@scuola.it');
    expect(emails(service, 'DOCENTE_CORRENTE', cdu)).toEqual(['prof@scuola.it']);
  });

  test('DOCENTE_CORRENTE is empty when focus.docente is absent', () => {
    const { cdu, service } = build({});
    expect(emails(service, 'DOCENTE_CORRENTE', cdu)).toEqual([]);
  });

  test('DOCENTE_CORRENTE resolves on a class-less DOCENTE_AGGREGATO CDU without throwing (cdu.tech.entita.classe unset)', () => {
    // Regression: contextFrom() used to eagerly call getClasseEntity(cdu), which
    // throws EntityNotFoundError for class-less recipes -- ApplyPermissionsStep
    // swallowed that (stopOnError: false), silently skipping ACL. classe must
    // now be resolved lazily so a role that never reads ctx.classe still works.
    const db = new FakeDatabase(fixtureTables());
    const cdu = composeContextBuilder(db).build(
      {
        target: 'bianchi@school.it',
        tipoTarget: 'docente',
        now: NOW,
        classiCompetenza: ['5A', '1F'],
        docenteCorrente: 'bianchi@school.it'
      },
      recipe('DOCENTE_AGGREGATO')
    );
    expect(cdu.tech.entita.classe).toBeNull();
    const service = composeRisolutoreRuoli(db);
    expect(emails(service, 'DOCENTE_CORRENTE', cdu)).toEqual(['bianchi@school.it']);
  });

  test('CAPO_DIPART and DOCENTI_DIPARTIMENTO resolve on a class-less DIPARTIMENTO_COMPLETO CDU without throwing', () => {
    const db = new FakeDatabase(fixtureTables());
    const cdu = composeContextBuilder(db).build(
      { target: 'SCIENTIFICO_DIP', tipoTarget: 'dipartimento', now: NOW },
      recipe('DIPARTIMENTO_COMPLETO')
    );
    expect(cdu.tech.entita.classe).toBeNull();
    const service = composeRisolutoreRuoli(db);
    expect(emails(service, 'CAPO_DIPART', cdu)).toEqual(['rossi@school.it']);
    expect(emails(service, 'DOCENTI_DIPARTIMENTO', cdu)).toEqual([
      'bianchi@school.it',
      'rossi@school.it'
    ]);
  });

  test('DOCENTI_DIPARTIMENTO resolves cdu.focus.dipartimento.docenti', () => {
    const { cdu, service } = build({});
    cdu.focus.dipartimento = dipartimentoFocus({
      docenti: [person('a@x.it'), person('b@x.it')]
    });
    expect(emails(service, 'DOCENTI_DIPARTIMENTO', cdu)).toEqual(['a@x.it', 'b@x.it']);
  });

  test('CAPO_DIPART reads focus.dipartimento.capo.email directly when populated', () => {
    // materiaCorrente MATE would fall back to rossi (per CAPO_DIPARTIMENTO above) —
    // proves the focus-populated capo (bianchi) takes priority over that fallback.
    const { cdu, service } = build({ materiaCorrente: 'MATE' });
    cdu.focus.dipartimento = dipartimentoFocus({ capo: person('bianchi@school.it') });
    expect(emails(service, 'CAPO_DIPART', cdu)).toEqual(['bianchi@school.it']);
  });

  test('DIPART.CAPO is an exact alias of CAPO_DIPART', () => {
    const { cdu, service } = build({ materiaCorrente: 'MATE' });
    cdu.focus.dipartimento = dipartimentoFocus({ capo: person('bianchi@school.it') });
    expect(emails(service, 'DIPART.CAPO', cdu)).toEqual(emails(service, 'CAPO_DIPART', cdu));
  });

  test('CAPO_DIPART falls back to findByMateria(materiaCorrente) when focus.dipartimento is absent', () => {
    const { cdu, service } = build({ materiaCorrente: 'MATE' });
    expect(emails(service, 'CAPO_DIPART', cdu)).toEqual(['rossi@school.it']);
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
    const { cdu, service } = build(
      { target: 'a1@school.it', tipoTarget: 'alunno' },
      'ALUNNO_COMPLETO'
    );
    expect(emails(service, 'ALUNNO', cdu)).toEqual(['a1@school.it']);
    expect(emails(service, 'FAMIGLIA', cdu)).toEqual(['genitore1@x.it']);
  });
});

describe('RisolutoreRuoliService — supplenza routing (14 §1.2)', () => {
  const INSIDE_WINDOW = new Date('2025-11-15T09:00:00Z'); // rossi→bianchi→verdi chain active

  function buildAt(now: Date) {
    const db = new FakeDatabase(fixtureTables());
    const cdu = composeContextBuilder(db).build(
      { target: '5A', tipoTarget: 'classe', now },
      recipe('CLASSE_COMPLETA')
    );
    return { cdu, service: composeRisolutoreRuoli(db) };
  }

  test('SOLO_TITOLARI (default) ignores active supplenze', () => {
    const { cdu, service } = buildAt(INSIDE_WINDOW);
    expect(emails(service, 'COORDINATORI', cdu)).toEqual(['rossi@school.it']);
  });

  test('SOLO_SUPPLENTI leaves non-teaching coordinator roles as declared', () => {
    const { cdu, service } = buildAt(INSIDE_WINDOW);
    expect(
      emails(service, 'COORDINATORI', cdu, { regolaSupplente: GestioneSupplenti.SOLO_SUPPLENTI })
    ).toEqual(['rossi@school.it']);
  });

  test('ENTRAMBI leaves non-teaching coordinator roles as declared', () => {
    const { cdu, service } = buildAt(INSIDE_WINDOW);
    expect(
      emails(service, 'COORDINATORI', cdu, { regolaSupplente: GestioneSupplenti.ENTRAMBI })
    ).toEqual(['rossi@school.it']);
  });

  // REPORT_GLF.md B4: with no active supplenza, RoutingResolver's
  // no-delegation-chain short-circuit must yield the titolare alone under
  // every regola — including SOLO_SUPPLENTI, which otherwise falls back to
  // the titolare rather than dropping the recipient (DELEGATE_OR_PRINCIPAL,
  // not DELEGATE_ONLY).
  test('SOLO_SUPPLENTI falls back to the titolare when no supplenza is active', () => {
    const { cdu, service } = build({});
    expect(
      emails(service, 'COORDINATORI', cdu, { regolaSupplente: GestioneSupplenti.SOLO_SUPPLENTI })
    ).toEqual(['rossi@school.it']);
  });

  test('ENTRAMBI yields only the titolare when no supplenza is active (no duplicate)', () => {
    const { cdu, service } = build({});
    expect(
      emails(service, 'COORDINATORI', cdu, { regolaSupplente: GestioneSupplenti.ENTRAMBI })
    ).toEqual(['rossi@school.it']);
  });

  test('teaching roles pass the declarative routing policy through the shared port', () => {
    const db = new FakeDatabase(fixtureTables());
    const teachingAssignments = new AldoTeachingAssignmentResolver(db);
    const resolveSpy = jest.spyOn(teachingAssignments, 'resolveConsiglio');
    const cdu = composeContextBuilder(db, undefined, teachingAssignments).build(
      { target: '5A', tipoTarget: 'classe', now: INSIDE_WINDOW },
      recipe('CLASSE_COMPLETA')
    );
    const service = composeRisolutoreRuoli(db, teachingAssignments);

    emails(service, 'CDC', cdu, { regolaSupplente: GestioneSupplenti.ENTRAMBI });

    expect(resolveSpy).toHaveBeenCalledWith(
      expect.objectContaining({ id: '5A' }),
      INSIDE_WINDOW,
      expect.objectContaining({
        includeReligioneAlt: true,
        routingPolicy: RoutingPolicy.BOTH_EQUAL
      })
    );
  });

  test('student/family roles are never subject to supplenza routing', () => {
    const { cdu, service } = buildAt(INSIDE_WINDOW);
    expect(
      emails(service, 'GENITORI_CLASSE', cdu, { regolaSupplente: GestioneSupplenti.SOLO_SUPPLENTI })
    ).toEqual(['genitore1@x.it']);
  });
});

describe('RisolutoreRuoliService — every private resolver empty-result branch', () => {
  test('cdcFiltrato (CDC_FILTER_ALUNNO) returns [] when ctx.cdu.focus.alunno is undefined (classe-scoped target)', () => {
    // build() defaults to a classe target/CLASSE_COMPLETA recipe -> focus.alunno is never populated.
    const { cdu, service } = build({});
    expect(emails(service, 'CDC_FILTER_ALUNNO', cdu)).toEqual([]);
  });

  test('CDC_FILTER_ALUNNO resolves the filtered council for a real alunno target', () => {
    // Anchored before the 5A/MATE VARIAZIONI_CATTEDRA's 2025-10-01 decorrenza so
    // rossi still holds MATE nominally alongside bianchi (FISI) — the point of
    // this test is CDC_FILTER_ALUNNO's IRC-merge behaviour, not cattedra resolution.
    const { cdu, service } = build(
      { target: 'a1@school.it', tipoTarget: 'alunno', now: new Date('2025-06-01T09:00:00Z') },
      'ALUNNO_COMPLETO'
    );
    // a1: RELIGIONE SI -> IRC teacher (bianchi) included alongside subject teacher (rossi).
    expect(emails(service, 'CDC_FILTER_ALUNNO', cdu)).toEqual([
      'bianchi@school.it',
      'rossi@school.it'
    ]);
  });

  test("cdcFiltrato skips council members whose email has no matching record in the service's own DocenteRepository", () => {
    // The CDU is built (and its consiglioDiClasseFiltrato VM populated) over a
    // full DOCENTI table, but the service is constructed over a second database
    // that is missing bianchi — cdcFiltrato re-looks-up each VM email through
    // its own DocenteRepository, so bianchi must be silently dropped there.
    // Anchored before the 5A/MATE VARIAZIONI_CATTEDRA's 2025-10-01 decorrenza
    // (rossi still holds MATE nominally) so the filtered council keeps a
    // second, still-resolvable member (rossi) to prove the drop is selective.
    const fullTables = fixtureTables();
    const dbFull = new FakeDatabase(fullTables);
    const cdu = composeContextBuilder(dbFull).build(
      { target: 'a1@school.it', tipoTarget: 'alunno', now: new Date('2025-06-01T09:00:00Z') },
      recipe('ALUNNO_COMPLETO')
    );

    const tablesMissingBianchi = fixtureTables();
    tablesMissingBianchi.DOCENTI = (tablesMissingBianchi.DOCENTI as Row[]).filter(
      (r) => r['EMAIL'] !== 'bianchi@school.it'
    );
    const dbMissingBianchi = new FakeDatabase(tablesMissingBianchi);
    const service = composeRisolutoreRuoli(dbMissingBianchi);

    expect(emails(service, 'CDC_FILTER_ALUNNO', cdu)).toEqual([
      'bianchi@school.it',
      'rossi@school.it'
    ]);
  });

  test('docenteMateria (DOCENTE_MATERIA) returns [] when ctx.materiaCorrente is null (no materiaCorrente supplied)', () => {
    const { cdu, service } = build({}); // materiaCorrente omitted -> null
    expect(emails(service, 'DOCENTE_MATERIA', cdu)).toEqual([]);
  });

  test('capoDipartimento (CAPO_DIPARTIMENTO) returns [] when no dipartimento matches materiaCorrente', () => {
    // 'ZZZZ' is a validly-shaped MateriaId but appears in no DIPART.MATERIE CSV.
    const { cdu, service } = build({ materiaCorrente: 'ZZZZ' });
    expect(emails(service, 'CAPO_DIPARTIMENTO', cdu)).toEqual([]);
  });

  test('capoDipartimento returns [] when the matching dipartimento has no capo email', () => {
    // LETTERE (MATERIE: 'ITA') has CAPO: '' in the fixture.
    const { cdu, service } = build({ materiaCorrente: 'ITA' });
    expect(emails(service, 'CAPO_DIPARTIMENTO', cdu)).toEqual([]);
  });

  test('capoDipartimento returns [] when the capo email does not match any Docente', () => {
    const tables = fixtureTables();
    tables.DIPART = [
      {
        ID: 'SCIENTIFICO_DIP',
        NOME: 'Dipartimento scientifico',
        CAPO: 'ghost@school.it',
        MATERIE: 'MATE,FISI'
      },
      { ID: 'LETTERE', NOME: 'Dipartimento di lettere', CAPO: '', MATERIE: 'ITA' }
    ];
    const db = new FakeDatabase(tables);
    const cdu = composeContextBuilder(db).build(
      { target: '5A', tipoTarget: 'classe', now: NOW, materiaCorrente: 'MATE' },
      recipe('CLASSE_COMPLETA')
    );
    const service = composeRisolutoreRuoli(db);
    expect(emails(service, 'CAPO_DIPARTIMENTO', cdu)).toEqual([]);
  });

  test('exam-commission resolver (DOCENTE_PRIMA_PROVA) skips materie with null esameConfig and materie whose prova does not match the indirizzo', () => {
    // 3B is indirizzo ITI: MATE's primaProva (SCIENTIFICO) doesn't match, and
    // FISI has ESAME_CFG null — both skipped, yielding no commission teachers.
    const { cdu, service } = build({ target: '3B', tipoTarget: 'classe' });
    expect(emails(service, 'DOCENTE_PRIMA_PROVA', cdu)).toEqual([]);
  });

  test('exam-commission resolver (DOCENTE_PRIMA_PROVA) resolves the matching prova teacher when the indirizzo matches', () => {
    // 5A is indirizzo SCIENTIFICO: MATE's primaProva matches -> bianchi (effective MATE teacher post-variazione).
    const { cdu, service } = build({});
    expect(emails(service, 'DOCENTE_PRIMA_PROVA', cdu)).toEqual(['bianchi@school.it']);
  });

  test('alunnoEmail (ALUNNO) returns [] when the focus alunno is undefined (classe-scoped target)', () => {
    const { cdu, service } = build({});
    expect(emails(service, 'ALUNNO', cdu)).toEqual([]);
  });

  test('famiglia (FAMIGLIA) returns [] when the focus alunno is undefined (classe-scoped target)', () => {
    const { cdu, service } = build({});
    expect(emails(service, 'FAMIGLIA', cdu)).toEqual([]);
  });

  test('famiglia (FAMIGLIA) returns [] when AlunnoRepository has no matching record for the focus alunno', () => {
    // Same split-database trick as the cdcFiltrato coverage above: the CDU
    // carries a1's focus over the full ALUNNI table, but the service resolves
    // through a database where a1's ALUNNI row has been removed.
    const dbFull = new FakeDatabase(fixtureTables());
    const cdu = composeContextBuilder(dbFull).build(
      { target: 'a1@school.it', tipoTarget: 'alunno', now: NOW },
      recipe('ALUNNO_COMPLETO')
    );

    const tablesMissingA1 = fixtureTables();
    tablesMissingA1.ALUNNI = (tablesMissingA1.ALUNNI as Row[]).filter(
      (r) => r['EMAIL'] !== 'a1@school.it'
    );
    const service = composeRisolutoreRuoli(new FakeDatabase(tablesMissingA1));

    expect(emails(service, 'FAMIGLIA', cdu)).toEqual([]);
  });

  test('the supplenza-routing loop skips a docente with a blank id, and orders BOTH_EQUAL results with titolare first', () => {
    const INSIDE_WINDOW = new Date('2025-11-15T09:00:00Z');
    const db = new FakeDatabase(fixtureTables());
    const cdu = composeContextBuilder(db).build(
      { target: '5A', tipoTarget: 'classe', now: INSIDE_WINDOW },
      recipe('CLASSE_COMPLETA')
    );
    const service = composeRisolutoreRuoli(db);
    const rossi = new DocenteRepository(db).findById('rossi@school.it')!;
    // No EMAIL key at all -> Docente.id is null -> titolareEmail resolves to '' in applicaSupplenze.
    const ghost = new Docente({ COGNOME: 'GHOST', NOME: 'X', GENERE: 'M' });

    const spy = jest
      .spyOn(ClasseRepository.prototype, 'getCoordinatori')
      .mockReturnValue([ghost, rossi]);
    try {
      // ENTRAMBI + INSIDE_WINDOW: rossi has an active chain-resolved substitute (verdi).
      const result = service.risolvi('COORDINATORI', cdu, {
        regolaSupplente: GestioneSupplenti.ENTRAMBI
      });
      // Ghost (blank id) contributes nothing; rossi's BOTH_EQUAL pair keeps titolare first.
      expect(result.map((e) => e.value)).toEqual(['rossi@school.it']);
    } finally {
      spy.mockRestore();
    }
  });
});

describe('RisolutoreRuoliService — VARIAZIONI_CATTEDRA is now honored (regression)', () => {
  test('DOCENTE_MATERIA follows the permanent chair change, not the CLASSI nominal holder', () => {
    const afterDecorrenza = build({ materiaCorrente: 'MATE' }, 'CLASSE_COMPLETA');
    // Rebuild at a date before the 2025-10-01 decorrenza: nominal holder (rossi) still applies.
    const db = new FakeDatabase(fixtureTables());
    const cduBefore = composeContextBuilder(db).build(
      { target: '5A', tipoTarget: 'classe', now: new Date('2025-09-01'), materiaCorrente: 'MATE' },
      recipe('CLASSE_COMPLETA')
    );
    const service = composeRisolutoreRuoli(db);
    expect(emails(service, 'DOCENTE_MATERIA', cduBefore)).toEqual(['rossi@school.it']);
    expect(emails(service, 'DOCENTE_MATERIA', afterDecorrenza.cdu)).toEqual(['bianchi@school.it']);
  });

  test('DOCENTI_IRC_ALT now honors supplenza routing like any other role (fix — was forced SOLO_TITOLARI before)', () => {
    // SUPPLENZE has TITOLARE bianchi -> SUPPLENTE verdi, 5A/ITA, 2025-11-10..20.
    // docentiIrcAlt (like docentiPermanenti/cdcCompleto) never sets ctx.materiaCorrente,
    // so applicaSupplenze passes materia=undefined to findSupplenzaSpecifica, which
    // bypasses the MATERIE filter on undefined -- the bianchi/ITA row matches on
    // CLASSI alone. This is the SAME coarse, materia-agnostic routing CDC/
    // DOCENTI_NO_RELIGIONE already have (documented, accepted limitation of the
    // role-level routing layer, unrelated to this fix) -- IRC/ALT now share it too,
    // instead of being artificially exempted. Anchored at 2025-11-15, inside the window.
    const INSIDE_WINDOW = new Date('2025-11-15T09:00:00Z');
    const db = new FakeDatabase(fixtureTables());
    const cdu = composeContextBuilder(db).build(
      { target: '5A', tipoTarget: 'classe', now: INSIDE_WINDOW },
      recipe('CLASSE_COMPLETA')
    );
    const service = composeRisolutoreRuoli(db);
    expect(
      emails(service, 'DOCENTI_IRC_ALT', cdu, { regolaSupplente: GestioneSupplenti.SOLO_SUPPLENTI })
    ).toEqual(['bianchi@school.it']); // ITA-scoped delegation does not apply to IRC/ALT
  });

  test('DOCENTE_MATERIA and DOCENTE_PRIMA_PROVA now partner-route an articulated PARENT class (fix — used to silently return [])', () => {
    const db = new FakeDatabase(fixtureTables());
    const cdu = composeContextBuilder(db).build(
      { target: '1F', tipoTarget: 'classe', now: NOW, materiaCorrente: 'FISI' },
      recipe('CLASSE_COMPLETA')
    );
    const service = composeRisolutoreRuoli(db);
    // FISI is split per-partner (1F-LSO=bianchi, 1F-LSS=verdi); '1F' itself (the
    // parent) has no FISI column. Before this fix, resolvePermanenti('1F', FISI, ...)
    // resolved directly against the parent and returned [].
    expect(emails(service, 'DOCENTE_MATERIA', cdu)).toEqual(['bianchi@school.it', 'verdi@school.it']);

    // MATE is shared (COMUNE, rossi on both partners) -- primaProva matches SCIENTIFICO
    // (1F's own indirizzo), and the merge must not duplicate rossi.
    const cduMate = composeContextBuilder(db).build(
      { target: '1F', tipoTarget: 'classe', now: NOW, materiaCorrente: 'MATE' },
      recipe('CLASSE_COMPLETA')
    );
    expect(emails(service, 'DOCENTE_PRIMA_PROVA', cduMate)).toEqual(['rossi@school.it']);
  });

  test('applicaSupplenze now checks the classe a titolare was ACTUALLY resolved against, not always ctx.classe — articulated parent, split subject (fix)', () => {
    const tables = fixtureTables();
    // A 4th teacher, distinct from every existing titolare/supplente in this
    // fixture, so the substitute's appearance in the output is unambiguous.
    tables.DOCENTI.push({
      EMAIL: 'neri@school.it',
      COGNOME: 'NERI',
      NOME: 'ANNA',
      GENERE: 'F',
      DIPART: 'SCIENTIFICO_DIP',
      ITP: false
    });
    // Scoped to the PARTNER '1F-LSO' (where bianchi actually, nominally holds
    // FISI) -- not the parent '1F'. Before this fix, applicaSupplenze always
    // checked ctx.classe.classeId ('1F' for a '1F'-targeted CDU), which this
    // row never matches (CLASSI='1F-LSO' only), so this substitute was silently
    // dropped for every role backed by CattedraResolver on an articulated
    // parent -- even though Task 6 already made the TITOLARE resolve correctly.
    tables.SUPPLENZE.push({
      TITOLARE: 'bianchi@school.it',
      SUPPLENTE: 'neri@school.it',
      DAL: '2026-01-01',
      AL: '2026-01-31',
      CLASSI: '1F-LSO',
      MATERIE: 'FISI'
    });
    const db = new FakeDatabase(tables);
    const INSIDE_WINDOW = new Date('2026-01-15T09:00:00Z');
    const service = composeRisolutoreRuoli(db);

    // DOCENTE_MATERIA, ENTRAMBI: bianchi (1F-LSO) now correctly has neri as an
    // active substitute; verdi (1F-LSS/FISI) is untouched (no supplenza scoped
    // to it in this window).
    const cduMateria = composeContextBuilder(db).build(
      { target: '1F', tipoTarget: 'classe', now: INSIDE_WINDOW, materiaCorrente: 'FISI' },
      recipe('CLASSE_COMPLETA')
    );
    expect(
      emails(service, 'DOCENTE_MATERIA', cduMateria, { regolaSupplente: GestioneSupplenti.ENTRAMBI })
    ).toEqual(['bianchi@school.it', 'neri@school.it', 'verdi@school.it']);

    // CDC, ENTRAMBI: the same fix reaches the group role too (rossi/MATE
    // untouched, bianchi/FISI gets neri, verdi/FISI untouched).
    const cduCdc = composeContextBuilder(db).build(
      { target: '1F', tipoTarget: 'classe', now: INSIDE_WINDOW },
      recipe('CLASSE_COMPLETA')
    );
    expect(
      emails(service, 'CDC', cduCdc, { regolaSupplente: GestioneSupplenti.ENTRAMBI })
    ).toEqual(['bianchi@school.it', 'neri@school.it', 'rossi@school.it', 'verdi@school.it']);
  });
});

describe('RisolutoreRuoliService — articulated parent expansion (ARTICOLAZIONE.md item 2)', () => {
  test('GENITORI_CLASSE resolves tutors of students in both partner classes from the parent', () => {
    const tables = fixtureTables();
    tables.ALUNNI!.push(
      {
        EMAIL: 'lso@school.it',
        COGNOMENOME: 'ALFA UNO',
        CLASSE: '1F-LSO',
        RELIGIONE: 'IRC',
        ATTIVO: true,
        RIPETENTE: false,
        RAPPR_STUD: false,
        TUTOR_1: 'tutor-lso@family.test',
        TUTOR_2: '',
        CURRICULUM: null
      },
      {
        EMAIL: 'lss@school.it',
        COGNOMENOME: 'BETA DUE',
        CLASSE: '1F-LSS',
        RELIGIONE: 'IRC',
        ATTIVO: true,
        RIPETENTE: false,
        RAPPR_STUD: false,
        TUTOR_1: 'tutor-lss@family.test',
        TUTOR_2: '',
        CURRICULUM: null
      }
    );
    const db = new FakeDatabase(tables);
    const cdu = composeContextBuilder(db).build(
      { target: '1F', tipoTarget: 'classe', now: NOW },
      recipe('CLASSE_COMPLETA')
    );

    expect(emails(composeRisolutoreRuoli(db), 'GENITORI_CLASSE', cdu)).toEqual([
      'tutor-lso@family.test',
      'tutor-lss@family.test'
    ]);
  });

  test('TUTOR_ASL merges RUOLI across both partner classes when resolved from the parent', () => {
    const tables = fixtureTables();
    const lso = tables.CLASSI!.find((r) => r.ID === '1F-LSO')!;
    lso.RUOLI = JSON.stringify({ TUTOR_ASL: 'bianchi@school.it' });
    const lss = tables.CLASSI!.find((r) => r.ID === '1F-LSS')!;
    lss.RUOLI = JSON.stringify({ TUTOR_ASL: 'verdi@school.it' });
    const db = new FakeDatabase(tables);
    const buildParams: BuildParams = { target: '1F', tipoTarget: 'classe', now: NOW };
    const cdu = composeContextBuilder(db).build(buildParams, recipe('CLASSE_COMPLETA'));
    const service = composeRisolutoreRuoli(db);

    expect(emails(service, 'TUTOR_ASL', cdu)).toEqual(['bianchi@school.it', 'verdi@school.it']);
  });

  test('TUTOR_ASL on a standard class still reads only its own RUOLI (regression)', () => {
    const { cdu, service } = build({});
    expect(emails(service, 'TUTOR_ASL', cdu)).toEqual(['bianchi@school.it', 'rossi@school.it']);
  });
});
