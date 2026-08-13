import {
  TABLE,
  COL_ALUNNI,
  COL_DOCENTI,
  COL_CLASSI,
  COL_MATERIE,
  COL_INDIRIZZI,
  COL_DIPART,
  COL_RUOLI,
  COL_PIANI,
  COL_CARENZE,
  COL_PROGETTI,
  COL_MOV_ALUNNI,
  COL_ASL,
  COL_SUPPLENZE,
  COL_VARIAZIONI_CATTEDRA,
  COL_CONF_DOC,
  COL_CONF_MAIL,
  COL_CONF_IMP,
  COL_LOG_DOCS,
  COL_LOG_FOLD,
  COL_LOG_MAIL
} from '../../config/schema';
import { MATERIE_PER_INDIRIZZO, MATERIE_PUNTATE } from './fixtures';

export const MATERIE_E2E = ['MAT', 'ITA', 'ING', 'STO'];
export const ASSIGNMENT_MATERIE_E2E = Array.from(
  new Set([...Object.values(MATERIE_PER_INDIRIZZO).flat(), 'INF'])
);
const ASSIGNMENT_COLUMNS_E2E = [
  ...ASSIGNMENT_MATERIE_E2E.filter((materia) => materia !== 'IRC' && materia !== 'ALT'),
  'INF.itp',
  ...MATERIE_PUNTATE
];

/** Canonical E2E table headers, including dynamic class and carenza columns. */
export const HEADERS: Record<string, string[]> = {
  [TABLE.ALUNNI]: Object.values(COL_ALUNNI),
  [TABLE.DOCENTI]: Object.values(COL_DOCENTI),
  [TABLE.CLASSI]: [...Object.values(COL_CLASSI), ...ASSIGNMENT_COLUMNS_E2E],
  [TABLE.MATERIE]: Object.values(COL_MATERIE),
  [TABLE.INDIRIZZI]: Object.values(COL_INDIRIZZI),
  [TABLE.DIPART]: Object.values(COL_DIPART),
  [TABLE.RUOLI]: Object.values(COL_RUOLI),
  [TABLE.PIANI]: Object.values(COL_PIANI),
  [TABLE.CARENZE]: [...Object.values(COL_CARENZE), ...MATERIE_E2E, 'GST'],
  [TABLE.PROGETTI]: Object.values(COL_PROGETTI),
  [TABLE.MOV_ALUNNI]: Object.values(COL_MOV_ALUNNI),
  [TABLE.ASL]: Object.values(COL_ASL),
  [TABLE.SUPPLENZE]: Object.values(COL_SUPPLENZE),
  [TABLE.VARIAZIONI_CATTEDRA]: Object.values(COL_VARIAZIONI_CATTEDRA),
  [TABLE.CONF_DOC]: Object.values(COL_CONF_DOC),
  [TABLE.CONF_MAIL]: Object.values(COL_CONF_MAIL),
  [TABLE.CONF_IMP]: Object.values(COL_CONF_IMP),
  [TABLE.LOG_DOCS]: Object.values(COL_LOG_DOCS),
  [TABLE.LOG_FOLD]: Object.values(COL_LOG_FOLD),
  [TABLE.LOG_MAIL]: Object.values(COL_LOG_MAIL)
};
