import { stringId } from './stringId';

const MATERIA_RE = /^[A-Z]{2,10}$/;

export class MateriaId extends stringId('MateriaId', MATERIA_RE) {}
