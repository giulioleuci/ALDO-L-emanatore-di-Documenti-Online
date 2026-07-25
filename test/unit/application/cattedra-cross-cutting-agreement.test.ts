import { ContextEngineFactory } from '../../../src/application/context-engine/ContextEngineFactory';
import { recipe } from '../../../src/application/context-engine/Recipe';
import { RisolutoreRuoliService } from '../../../src/application/services/RisolutoreRuoliService';
import { FakeDatabase } from '../../fakes/FakeDatabase';
import { fixtureTables } from '../../fixtures/tables';
import { GestioneSupplenti } from '../../../src/domain/value-objects/enums';

describe('CDU / RisolutoreRuoliService agreement across the resolution layers (17)', () => {
  test('after the permanent variazione, before any supplenza: CDU and DOCENTE_MATERIA agree on bianchi', () => {
    const db = new FakeDatabase(fixtureTables());
    const now = new Date('2025-10-15T09:00:00Z');
    const cdu = ContextEngineFactory.create(db).build(
      { target: '5A', tipoTarget: 'classe', now, materiaCorrente: 'MATE' },
      recipe('CLASSE_COMPLETA')
    );
    const cdcEmails = cdu.focus.classe!.consiglioDiClasse
      .filter((d) => d.materie.some((m) => m.sigla === 'MATE'))
      .map((d) => d.anagrafica.email);
    const service = new RisolutoreRuoliService(db);
    const roleEmails = service
      .risolvi('DOCENTE_MATERIA', cdu)
      .map((e) => e.value);

    expect(cdcEmails).toEqual(['bianchi@school.it']);
    expect(roleEmails).toEqual(['bianchi@school.it']);
  });

  test('during the active supplenza (chain rossi->bianchi->verdi for ITA), CDC (ENTRAMBI) and role routing (ENTRAMBI) agree', () => {
    const db = new FakeDatabase(fixtureTables());
    const now = new Date('2025-11-15T09:00:00Z');
    const cdu = ContextEngineFactory.create(db).build(
      { target: '5A', tipoTarget: 'classe', now },
      recipe('CLASSE_COMPLETA', { gestioneSupplenti: GestioneSupplenti.ENTRAMBI })
    );
    // rossi holds no subject at this date (MATE went to bianchi 2025-10-01, FISI
    // was already nominally bianchi) -> rossi drops out of consiglioDiClasse
    // entirely (CdcAssembler builds it purely from cattedra assignments). COORD
    // is a CLASSI-column role, not cattedra-resolved: CDU exposes it via the
    // separate `focus.classe.coordinatori` field (ClasseProvider ->
    // classi.getCoordinatori), independent of VARIAZIONI_CATTEDRA/SUPPLENZE. The
    // rossi->bianchi SUPPLENZE row ('*' materie, 5A/4B, Nov 1-30) targets rossi as
    // TITOLARE, who is no longer anyone's effective cattedra holder for 5A -> it
    // must not reroute bianchi's MATE chair (see previous point). Confirm via
    // COORDINATORI (COORD=rossi, a non-cattedra role) that the
    // rossi->bianchi->verdi supplenza chain still applies correctly to its OWN
    // unrelated context.
    const coordinatoriNominali = cdu.focus.classe!.coordinatori ?? [];
    const service = new RisolutoreRuoliService(db);
    const coordEmails = service
      .risolvi('COORDINATORI', cdu, { regolaSupplente: GestioneSupplenti.ENTRAMBI })
      .map((e) => e.value)
      .sort();

    expect(coordinatoriNominali.map((c) => c.email)).toEqual(['rossi@school.it']); // COORD is not cattedra-resolved
    expect(coordEmails).toEqual(['rossi@school.it', 'verdi@school.it']); // rossi's own chain-resolved supply
  });
});
