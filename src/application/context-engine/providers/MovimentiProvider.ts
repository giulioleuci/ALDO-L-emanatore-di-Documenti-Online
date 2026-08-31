import type { ContextProvider } from '../ContextProvider';
import type { AlunnoVM, Cdu, MovimentoAlunnoVM, MovimentoClasseVM } from '../Cdu';
import type { IMovimentoAlunnoRepository } from '../../../domain/repositories/IMovimentoAlunnoRepository';
import type { IAlunnoRepository } from '../../../domain/repositories/IAlunnoRepository';
import type { IClasseRepository } from '../../../domain/repositories/IClasseRepository';
import { ClasseId } from '../../../domain/value-objects/ClasseId';
import { getClasseEntity } from '../techEntities';
import {
  buildMovimentoAlunnoVm,
  buildMovimentoClasseVm,
  buildPresenzaAlunnoVm
} from '../mappers/movimentoVmMapper';
import { elencoVm } from '../mappers/elencoVm';
import type { MovimentoAlunno } from '../../../domain/entities/MovimentoAlunno';

export class MovimentiProvider implements ContextProvider {
  constructor(
    private readonly movimenti: IMovimentoAlunnoRepository,
    private readonly alunni: IAlunnoRepository,
    private readonly classi: IClasseRepository
  ) {}

  provide(cdu: Cdu): void {
    const entro = cdu.meta.timestamp.slice(0, 10);
    const righe = this.movimenti
      .findEntro(entro)
      .sort(
        (a, b) =>
          b.data.localeCompare(a.data) ||
          a.studente.localeCompare(b.studente) ||
          a.tipo.localeCompare(b.tipo) ||
          a.da.localeCompare(b.da) ||
          a.a.localeCompare(b.a)
      );
    if (cdu.focus.alunno !== undefined)
      this.alunno(cdu.focus.alunno, this.perAlunno(righe, cdu.focus.alunno.email));
    if (cdu.focus.classe !== undefined) this.classeFocus(cdu, righe);
  }

  private classeFocus(cdu: Cdu, righe: MovimentoAlunno[]): void {
    const focus = cdu.focus.classe!;
    const classe = getClasseEntity(cdu);
    const scope = new Set<string>([classe.nome]);
    if (this.classi.getArticolazione(classe)?.isParent()) {
      for (const partner of this.classi.getClassiPartner(classe)) scope.add(partner.nome);
    }
    const elenco: MovimentoClasseVM[] = [];
    for (const riga of righe) {
      if (!scope.has(riga.da) && !scope.has(riga.a)) continue;
      const studente = this.alunni.findById(riga.studente);
      if (studente === null) continue;
      const movimento = buildMovimentoAlunnoVm(riga, (id) => this.classe(id));
      elenco.push(
        buildMovimentoClasseVm(
          movimento,
          { nomeCompleto: studente.cognomeNome, email: riga.studente },
          scope
        )
      );
    }
    elenco.sort(
      (a, b) =>
        b.data.localeCompare(a.data) ||
        a.studente.nomeCompleto.localeCompare(b.studente.nomeCompleto) ||
        a.tipo.localeCompare(b.tipo)
    );
    const entrate = elenco.filter((movimento) => movimento.isEntrata);
    const uscite = elenco.filter((movimento) => movimento.isUscita);
    const interni = elenco.filter((movimento) => movimento.isMovimentoInterno);
    focus.movimenti = {
      ...elencoVm(elenco),
      entrate,
      uscite,
      interni,
      hasEntrate: entrate.length > 0,
      hasUscite: uscite.length > 0,
      hasInterni: interni.length > 0,
      numeroEntrate: entrate.length,
      numeroUscite: uscite.length,
      numeroInterni: interni.length
    };
    for (const studente of focus.studenti?.elenco ?? [])
      this.alunno(studente, this.perAlunno(righe, studente.email));
  }

  private perAlunno(righe: MovimentoAlunno[], email: string): MovimentoAlunnoVM[] {
    return righe
      .filter((riga) => riga.studente === email)
      .map((riga) => buildMovimentoAlunnoVm(riga, (id) => this.classe(id)));
  }

  private alunno(alunno: AlunnoVM, movimenti: MovimentoAlunnoVM[]): void {
    alunno.movimenti = elencoVm(movimenti);
    alunno.presenza = buildPresenzaAlunnoVm(
      movimenti,
      alunno.presenza.annoPrecedente,
      alunno.classe.nome
    );
  }

  private classe(id: string): { nome: string } | null {
    const classe = this.classi.findById(ClasseId.of(id));
    return classe === null ? null : { nome: classe.nome };
  }
}
