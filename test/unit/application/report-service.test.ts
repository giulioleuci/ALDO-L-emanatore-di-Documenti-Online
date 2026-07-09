import { ReportService } from '../../../src/application/services/ReportService';
import { ClasseId } from '../../../src/domain/value-objects/ClasseId';
import { FakeDatabase } from '../../../test/fakes/FakeDatabase';
import { fixtureTables } from '../../../test/fixtures/tables';

function service(): ReportService {
  return new ReportService(new FakeDatabase(fixtureTables()));
}

describe('ReportService.getStatisticheClasse (12 §4)', () => {
  test('counts students, cohort flags, carenze by severity, ASL hours and documents', () => {
    const s = service().getStatisticheClasse(ClasseId.of('5A'));
    expect(s.alunni).toEqual({ totali: 3, attivi: 1, conBes: 2, conDsa: 1, ripetenti: 1 });
    // carenze cells across 5A: a1(MATE 4.5=MEDIA, FISI nota=GRAVE), a1(MATE 5=LIEVE), a2(FISI 3=GRAVE)
    expect(s.carenze).toEqual({ grave: 2, media: 1, lieve: 1, totale: 4 });
    expect(s.oreAsl).toBe(130); // a1: 40+60, a2: 30
    expect(s.documentiPerTipo).toEqual({}); // LOG_DOCS empty in the fixture
  });

  test('throws for an unknown class', () => {
    expect(() => service().getStatisticheClasse(ClasseId.of('9Z'))).toThrow();
  });
});

describe('ReportService.getStatisticheIstituto (12 §4)', () => {
  test('aggregates active classes by year and indirizzo', () => {
    const s = service().getStatisticheIstituto();
    expect(s.totaleAlunni).toBe(1); // only a1 active
    expect(s.totaleDocenti).toBe(3);
    expect(s.totaleClassiAttive).toBe(4);
    expect(s.perAnno).toEqual({ 1: 3, 5: 1 });
    expect(s.perIndirizzo).toEqual({ SCIENTIFICO: 3, LSSA: 1 });
  });
});

describe('ReportService.getReportCarenze (12 §4)', () => {
  test('filters by class and reports per-student severity rows', () => {
    const report = service().getReportCarenze({ classe: '5A' });
    expect(report.totale).toBe(4);
    expect(report.perSeverita).toEqual({ grave: 2, media: 1, lieve: 1 });
    const a1 = report.righe.filter((r) => r.studente === 'a1@school.it');
    expect(a1).toEqual(
      expect.arrayContaining([
        { studente: 'a1@school.it', materia: 'MATE', valore: '4.5', severita: 'MEDIA' },
        { studente: 'a1@school.it', materia: 'FISI', valore: 'Studio scarso', severita: 'GRAVE' }
      ])
    );
  });

  test('filters further by materia and by notification state', () => {
    const soloFisi = service().getReportCarenze({ classe: '5A', materia: 'FISI' });
    expect(soloFisi.righe.every((r) => r.materia === 'FISI')).toBe(true);
    expect(soloFisi.totale).toBe(2); // a1 FISI nota + a2 FISI 3

    const nonNotificate = service().getReportCarenze({ classe: '5A', soloNonNotificate: true });
    // a1 prog1 (NOTIFICATO '') and a2 prog1 (NOTIFICATO '') qualify; a1 prog2 is notified
    expect(nonNotificate.righe.some((r) => r.materia === 'MATE' && r.valore === '5')).toBe(false);
  });
});

describe('ReportService.getReportASL (12 §4)', () => {
  test('reports hours per student and the class total', () => {
    const report = service().getReportASL(ClasseId.of('5A'));
    expect(report.totaleClasse).toBe(130);
    const byStudent = Object.fromEntries(report.perStudente.map((r) => [r.studente, r.ore]));
    expect(byStudent['a1@school.it']).toBe(100);
    expect(byStudent['a2@school.it']).toBe(30);
  });
});
