import { DipartimentoProvider } from '../../../../../src/application/context-engine/providers/DipartimentoProvider';
import type { Cdu } from '../../../../../src/application/context-engine/Cdu';
import type { BuildParams } from '../../../../../src/application/context-engine/Recipe';
import type { IDipartimentoRepository } from '../../../../../src/domain/repositories/IDipartimentoRepository';
import type { IDocenteRepository } from '../../../../../src/domain/repositories/IDocenteRepository';
import type { ILogDocumentoRepository } from '../../../../../src/domain/repositories/ILogDocumentoRepository';
import { Dipartimento } from '../../../../../src/domain/entities/Dipartimento';
import { Docente } from '../../../../../src/domain/entities/Docente';
import { LogDocumento } from '../../../../../src/domain/entities/LogDocumento';
import { PipelineError } from '../../../../../src/domain/errors/DomainError';

function emptyCdu(): Cdu {
  return { meta: { parametriInput: {} } as never, focus: {}, tech: {} as never };
}

function fakeDipartimento(id: string, nome: string, capoEmail: string, materieIds: string[]): Dipartimento {
  return Dipartimento.fromData({ ID: id, NOME: nome, CAPO: capoEmail, MATERIE: materieIds.join(',') });
}

function fakeDocente(email: string, dipart = ''): Docente {
  return Docente.fromData({
    EMAIL: email,
    COGNOME: email.split('@')[0]!.toUpperCase(),
    NOME: 'X',
    GENERE: 'M',
    DIPART: dipart
  });
}

function fakeLogDocumento(id: string, materie: string): LogDocumento {
  return LogDocumento.fromData({
    ID: id,
    ID_GEN: 'CD1',
    TIPO: 'VERBALE',
    SOTTOTIPO: 'ORDINARIO',
    NOME: `Verbale ${id}`,
    STATO: 'GENERATO',
    NOTIFICATO: '2026-06-02T00:00:00.000Z',
    LINK: `https://drive/${id}`,
    MATERIE: materie,
    DATA_CREAZ: '2026-06-01T00:00:00.000Z'
  });
}

describe('DipartimentoProvider', () => {
  it('populates focus.dipartimento with anagrafica, capo, materie and docenti', () => {
    const dipartimento = fakeDipartimento('LETTERE', 'Lettere', 'rossi@scuola.it', ['ITA', 'STO']);
    const dipartimenti = {
      findAll: () => [dipartimento],
      findByMateria: () => dipartimento
    } as unknown as IDipartimentoRepository;
    const docentiAfferenti = [fakeDocente('rossi@scuola.it'), fakeDocente('bianchi@scuola.it')];
    const findByDipartimento = jest.fn().mockReturnValue(docentiAfferenti);
    const docenti = {
      findByDipartimento,
      findById: (email: string) => fakeDocente(email)
    } as unknown as IDocenteRepository;
    const logDocs = {
      findAll: () => [fakeLogDocumento('LD1', 'ITA,STO'), fakeLogDocumento('LD2', 'MAT')]
    } as unknown as ILogDocumentoRepository;
    const provider = new DipartimentoProvider(dipartimenti, docenti, logDocs);
    const cdu = emptyCdu();

    provider.provide(cdu, { target: 'LETTERE' } as BuildParams);

    expect(cdu.focus.dipartimento!.anagrafica).toEqual({ id: 'LETTERE', nome: 'Lettere' });
    expect(cdu.focus.dipartimento!.capo).toEqual(expect.objectContaining({ email: 'rossi@scuola.it' }));
    expect(cdu.focus.dipartimento!.materie).toEqual([{ sigla: 'ITA' }, { sigla: 'STO' }]);
    expect(cdu.focus.dipartimento!.docenti).toHaveLength(2);
    expect(cdu.focus.dipartimento!.didattica.documenti.items).toHaveLength(1);
    expect(cdu.focus.dipartimento!.didattica.documenti.items[0]!.id).toBe('LD1');
    expect(cdu.focus.dipartimento!.didattica.documenti.items[0]!.sottotipo).toBe('ORDINARIO');
    expect(cdu.focus.dipartimento!.didattica.documenti.items[0]!.notificato).toBe(true);
  });

  it('sets capo to null when the department has no CAPO', () => {
    const dipartimento = fakeDipartimento('SCIENZE', 'Scienze', '', ['SCI']);
    const dipartimenti = { findAll: () => [dipartimento], findByMateria: () => null } as unknown as IDipartimentoRepository;
    const docenti = {
      findByDipartimento: () => [],
      findById: () => null
    } as unknown as IDocenteRepository;
    const logDocs = { findAll: () => [] } as unknown as ILogDocumentoRepository;
    const provider = new DipartimentoProvider(dipartimenti, docenti, logDocs);
    const cdu = emptyCdu();

    provider.provide(cdu, { target: 'SCIENZE' } as BuildParams);

    expect(cdu.focus.dipartimento!.capo).toBeNull();
  });

  it('throws PipelineError when the department is not found', () => {
    const dipartimenti = { findAll: () => [], findByMateria: () => null } as unknown as IDipartimentoRepository;
    const docenti = { findByDipartimento: () => [], findById: () => null } as unknown as IDocenteRepository;
    const logDocs = { findAll: () => [] } as unknown as ILogDocumentoRepository;
    const provider = new DipartimentoProvider(dipartimenti, docenti, logDocs);
    const cdu = emptyCdu();

    expect(() => provider.provide(cdu, { target: 'IGNOTO' } as BuildParams)).toThrow(PipelineError);
  });
});
