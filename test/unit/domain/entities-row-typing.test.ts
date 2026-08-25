import { Docente } from '../../../src/domain/entities/Docente';
import { Classe } from '../../../src/domain/entities/Classe';
import { COL_DOCENTI, COL_CLASSI } from '../../../src/config/schema';

test('fromData accetta una riga grezza del foglio', () => {
  const row: Record<string, unknown> = {
    [COL_DOCENTI.EMAIL]: 'd@scuola.edu',
    [COL_DOCENTI.COGNOME]: 'Rossi',
    _NOTE_MIE: 'appunto personale'
  };
  expect(Docente.fromData(row).id).toBe('d@scuola.edu');
});

test('le tabelle a colonne dinamiche accettano colonne non dichiarate', () => {
  const row: Record<string, unknown> = {
    [COL_CLASSI.ID]: '3A',
    [COL_CLASSI.ANNO]: 3,
    [COL_CLASSI.INDIRIZZO]: 'LC',
    ITA: 'd@scuola.edu'
  };
  expect(Classe.fromData(row).id).toBe('3A');
});
