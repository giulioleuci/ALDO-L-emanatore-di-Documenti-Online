import { ProgettiProvider } from '../../../../../src/application/context-engine/providers/ProgettiProvider';
import { Progetto } from '../../../../../src/domain/entities/Progetto';
import { TipoProgetto } from '../../../../../src/domain/value-objects/enums';
import { COL_PROGETTI } from '../../../../../src/config/schema';
import { setClasseEntity } from '../../../../../src/application/context-engine/techEntities';
import { Classe } from '../../../../../src/domain/entities/Classe';
import { ClasseId } from '../../../../../src/domain/value-objects/ClasseId';
import { AnnoCorso } from '../../../../../src/domain/value-objects/AnnoCorso';
import type { Cdu } from '../../../../../src/application/context-engine/Cdu';

function emptyCdu(): Cdu {
  const cdu = {
    focus: { classe: {} },
    tech: { entita: {}, servizi: [], pipeline: { statoCorrente: '', stepEseguiti: [], errori: [], logEsecuzione: [] } }
  } as unknown as Cdu;
  setClasseEntity(cdu, Classe.create(ClasseId.of('5A'), AnnoCorso.of(5), 'SCIENTIFICO'));
  return cdu;
}

describe('ProgettiProvider', () => {
  it('builds progetti with resolved docente referente and tipoLabel', () => {
    const progetto = Progetto.fromData({
      [COL_PROGETTI.CLASSE]: '5A',
      [COL_PROGETTI.TIPO]: TipoProgetto.ASL,
      [COL_PROGETTI.NOME]: 'PCTO Biblioteca',
      [COL_PROGETTI.REFERENTE]: 'anna.ferrari@scuola.edu.it',
      [COL_PROGETTI.ORE]: 30,
      [COL_PROGETTI.ORE_ASL]: 30
    });
    const progetti = { findByClasse: () => [progetto] };
    const docenti = {
      findById: () => ({ nome: 'Anna', cognome: 'Ferrari', genere: 'F', id: 'anna.ferrari@scuola.edu.it' })
    };
    const provider = new ProgettiProvider(progetti as never, docenti as never);
    const cdu = emptyCdu();
    provider.provide(cdu);
    expect(cdu.focus.classe!.hasProgetti).toBe(true);
    expect(cdu.focus.classe!.progetti![0]).toMatchObject({
      tipo: TipoProgetto.ASL,
      tipoLabel: 'PCTO/ASL',
      nome: 'PCTO Biblioteca',
      ore: 30,
      oreAsl: 30,
      isAsl: true
    });
    expect(cdu.focus.classe!.progetti![0]!.referente.appellativoCompleto).toBe('Prof.ssa Anna Ferrari');
  });

  it('treats an unresolved referente as an external expert (raw name, no email/genere)', () => {
    const progetto = Progetto.fromData({
      [COL_PROGETTI.CLASSE]: '5A',
      [COL_PROGETTI.TIPO]: TipoProgetto.ALTRO,
      [COL_PROGETTI.NOME]: 'Corso',
      [COL_PROGETTI.REFERENTE]: 'Studio Esterno XYZ',
      [COL_PROGETTI.ORE]: 10,
      [COL_PROGETTI.ORE_ASL]: 0
    });
    const progetti = { findByClasse: () => [progetto] };
    const docenti = { findById: () => null };
    const provider = new ProgettiProvider(progetti as never, docenti as never);
    const cdu = emptyCdu();
    provider.provide(cdu);
    expect(cdu.focus.classe!.progetti![0]!.referente).toEqual(
      expect.objectContaining({ nomeCompleto: 'Studio Esterno XYZ', genere: null, email: null })
    );
  });
});
