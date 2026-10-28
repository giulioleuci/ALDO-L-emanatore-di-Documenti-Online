import { DipartimentoProvider } from '../../../../../src/application/context-engine/providers/DipartimentoProvider';
import type { Cdu } from '../../../../../src/application/context-engine/Cdu';
import type { BuildParams } from '../../../../../src/application/context-engine/Recipe';
import type { IDipartimentoRepository } from '../../../../../src/domain/repositories/IDipartimentoRepository';
import type { IDocenteRepository } from '../../../../../src/domain/repositories/IDocenteRepository';
import type { IMateriaRepository } from '../../../../../src/domain/repositories/IMateriaRepository';
import type { ILogDocumentoRepository } from '../../../../../src/domain/repositories/ILogDocumentoRepository';
import { Dipartimento } from '../../../../../src/domain/entities/Dipartimento';
import { Docente } from '../../../../../src/domain/entities/Docente';
import { Materia } from '../../../../../src/domain/entities/Materia';
import { LogDocumento } from '../../../../../src/domain/entities/LogDocumento';
import { PipelineError } from '../../../../../src/domain/errors/DomainError';

function emptyCdu(): Cdu {
  return { meta: {} as never, focus: {}, tech: {} as never };
}

function fakeDipartimento(
  id: string,
  nome: string,
  capoEmail: string,
  materieIds: string[]
): Dipartimento {
  return Dipartimento.fromData({
    ID: id,
    NOME: nome,
    CAPO: capoEmail,
    MATERIE: materieIds.join(',')
  });
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

function fakeMaterie(): IMateriaRepository {
  return {
    findByIdCached: (id: { value: string }) => Materia.fromData({ ID: id.value, NOME: id.value })
  } as unknown as IMateriaRepository;
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
  it('populates focus.dipartimento with flat id/nome, capo, materie and docenti', () => {
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
    const provider = new DipartimentoProvider(dipartimenti, docenti, fakeMaterie(), logDocs);
    const cdu = emptyCdu();

    provider.provide(cdu, { target: 'LETTERE' } as BuildParams, {});

    const d = cdu.focus.dipartimento!;
    expect(d.id).toBe('LETTERE');
    expect(d.nome).toBe('Lettere');
    expect(d.capo).toEqual(expect.objectContaining({ email: 'rossi@scuola.it' }));
    expect(d.hasCapo).toBe(true);
    expect(d.materie.map((m) => m.sigla).sort()).toEqual(['ITA', 'STO']);
    expect(d.numeroMaterie).toBe(2);
    expect(d.docenti).toHaveLength(2);
    expect(d.hasDocenti).toBe(true);
    expect(d.documenti.hasElenco).toBe(true);
    expect(d.documenti.elenco).toHaveLength(1);
    expect(d.documenti.elenco[0]!.id).toBe('LD1');
    expect(d.documenti.elenco[0]!.sottotipo).toBe('ORDINARIO');
    expect(d.documenti.elenco[0]!.isNotificato).toBe(true);
    expect(d.documenti.storico.get()).toEqual([]);
  });

  it('sets capo to null when the department has no CAPO', () => {
    const dipartimento = fakeDipartimento('SCIENZE', 'Scienze', '', ['SCI']);
    const dipartimenti = {
      findAll: () => [dipartimento],
      findByMateria: () => null
    } as unknown as IDipartimentoRepository;
    const docenti = {
      findByDipartimento: () => [],
      findById: () => null
    } as unknown as IDocenteRepository;
    const logDocs = { findAll: () => [] } as unknown as ILogDocumentoRepository;
    const provider = new DipartimentoProvider(dipartimenti, docenti, fakeMaterie(), logDocs);
    const cdu = emptyCdu();

    provider.provide(cdu, { target: 'SCIENZE' } as BuildParams, {});

    expect(cdu.focus.dipartimento!.capo).toBeNull();
    expect(cdu.focus.dipartimento!.hasCapo).toBe(false);
  });

  it('throws PipelineError when the department is not found', () => {
    const dipartimenti = {
      findAll: () => [],
      findByMateria: () => null
    } as unknown as IDipartimentoRepository;
    const docenti = {
      findByDipartimento: () => [],
      findById: () => null
    } as unknown as IDocenteRepository;
    const logDocs = { findAll: () => [] } as unknown as ILogDocumentoRepository;
    const provider = new DipartimentoProvider(dipartimenti, docenti, fakeMaterie(), logDocs);
    const cdu = emptyCdu();

    expect(() => provider.provide(cdu, { target: 'IGNOTO' } as BuildParams, {})).toThrow(
      PipelineError
    );
  });
});
