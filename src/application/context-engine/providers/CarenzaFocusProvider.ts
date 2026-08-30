import type { ContextProvider } from '../ContextProvider';
import type { Cdu } from '../Cdu';
import type { BuildParams } from '../Recipe';
import type { IAlunnoRepository } from '../../../domain/repositories/IAlunnoRepository';
import { getAlunnoEntity } from '../techEntities';
import { formatOggi } from '../dates';

export class CarenzaFocusProvider implements ContextProvider {
  constructor(private readonly alunni: IAlunnoRepository) {}

  provide(cdu: Cdu, params: BuildParams): void {
    const carenze = this.alunni.getCarenze(getAlunnoEntity(cdu));
    const target = params.carenzaProgressivo === undefined
      ? carenze[0]
      : carenze.find((carenza) => carenza.progressivo === params.carenzaProgressivo);
    const alunno = cdu.focus.alunno;
    if (target === undefined || alunno === undefined) return;
    const data = formatOggi(new Date(`${target.data}T00:00:00Z`));
    const note = target.getNote();
    cdu.focus.carenza = {
      studente: { nomeCompleto: alunno.nomeCompleto, email: alunno.email },
      classe: { nome: target.classe },
      progressivo: target.progressivo,
      data: target.data,
      dataBreve: data.breve,
      dataEstesa: data.estesa,
      hasAssenze: target.hasAssenzeElevate(),
      note,
      hasNote: note.trim() !== ''
    };
  }
}
