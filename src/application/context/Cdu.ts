import type { ConsiglioDiClasse } from '../../domain/entities/ConsiglioDiClasse';

export interface Cdu {
  meta: {
    date: { oggi: { breve: string; anno: string } };
    parametriInput: { target: string; tipoTarget: 'classe' | 'alunno' };
  };
  focus: {
    classe: { anagrafica: { nome: string; anno: number } };
  };
  tech: { consiglioDiClasse: ConsiglioDiClasse };
}
