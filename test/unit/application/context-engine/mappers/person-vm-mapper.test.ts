import {
  buildCollettivoPersone,
  buildPersonaVm,
  descriviPersone,
  descriviPersoneEsteso
} from '../../../../../src/application/context-engine/mappers/personVmMapper';

describe('buildPersonaVm', () => {
  it('builds the canonical flat internal-person VM with capitalized atomic grammar', () => {
    expect(buildPersonaVm({ nome: 'Mario', cognome: 'Rossi', email: 'mario@x.it', genere: 'M' })).toEqual({
      nome: 'Mario', cognome: 'Rossi', nomeCompleto: 'Rossi Mario', email: 'mario@x.it', genere: 'M',
      appellativo: 'Prof.', articolo: 'Il', coordinatore: 'Coordinatore',
      appellativoCompleto: 'Prof. Rossi Mario', appellativoCognome: 'Prof. Rossi',
      appellativoCompletoEsteso: 'Il prof. Rossi Mario', appellativoCognomeEsteso: 'Il prof. Rossi',
      isEsterno: false
    });
  });

  it('keeps a title-less external person printable', () => {
    expect(buildPersonaVm({ nome: 'Studio Bianchi', cognome: null, email: null, genere: null, isEsterno: true })).toEqual({
      nome: 'Studio Bianchi', cognome: null, nomeCompleto: 'Studio Bianchi', email: null, genere: null,
      appellativo: null, articolo: null, coordinatore: null,
      appellativoCompleto: 'Studio Bianchi', appellativoCognome: 'Studio Bianchi',
      appellativoCompletoEsteso: 'Studio Bianchi', appellativoCognomeEsteso: 'Studio Bianchi',
      isEsterno: true
    });
  });
});

test('collective grammar and descriptions follow sentence capitalization', () => {
  const mario = buildPersonaVm({ nome: 'Mario', cognome: 'Rossi', email: 'm@x.it', genere: 'M' });
  const anna = buildPersonaVm({ nome: 'Anna', cognome: 'Bianchi', email: 'a@x.it', genere: 'F' });
  expect(buildCollettivoPersone([mario, anna])).toEqual({
    appellativo: 'Prof.', articolo: 'I', coordinamento: 'Coordinatori', coordina: 'Coordinano', presiede: 'Presiedono', numero: 2
  });
  expect(descriviPersone([mario, anna])).toBe('Prof. Rossi Mario e prof.ssa Bianchi Anna');
  expect(descriviPersoneEsteso([mario, anna])).toBe('Il prof. Rossi Mario e la prof.ssa Bianchi Anna');
  expect(buildCollettivoPersone([])).toEqual({ appellativo: '', articolo: '', coordinamento: '', coordina: '', presiede: '', numero: 0 });
});
