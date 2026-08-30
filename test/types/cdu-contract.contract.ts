import type { MateriaEsameVM, MateriaVM } from '../../src/application/context-engine/Cdu';

type Assert<T extends true> = T;
type ConDocentiCompleto = Required<
  Pick<
    MateriaVM,
    | 'docenti'
    | 'hasDocenti'
    | 'docentiDescrizione'
    | 'docentiDescrizioneEstesa'
    | 'hasCattedraItp'
  >
>;

export type MateriaEsameRequiresConDocentiProfile = Assert<
  MateriaEsameVM extends ConDocentiCompleto ? true : false
>;
