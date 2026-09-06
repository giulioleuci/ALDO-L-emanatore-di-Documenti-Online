import type { StoricoDatabaseProvider } from './StoricoDatabaseProvider';
import { ClasseRepository } from '../../infrastructure/repositories/ClasseRepository';
import { SupplenzaRepository } from '../../infrastructure/repositories/SupplenzaRepository';
import { VariazioneCattedraRepository } from '../../infrastructure/repositories/VariazioneCattedraRepository';
import type { IClasseRepository } from '../../domain/repositories/IClasseRepository';
import { ClasseId } from '../../domain/value-objects/ClasseId';
import { AnnoScolastico } from '../../domain/value-objects/AnnoScolastico';
import type { Classe } from '../../domain/entities/Classe';
import type { VariazioneCattedra } from '../../domain/entities/VariazioneCattedra';
import type { Supplenza } from '../../domain/entities/Supplenza';
import { AldoTeachingAssignmentResolver } from '../../infrastructure/role-resolution/AldoTeachingAssignmentResolver';
import { rowAppliesToTeachingSlot } from '../../infrastructure/role-resolution/RowScopeExpansion';

export interface DocenteMateriaStorico {
  docenteEmail: string;
  materia: string;
  isItp: boolean;
}

export interface CattedraStorica {
  materia: string;
  isItp: boolean;
  titolareOriginario: string;
  variazioni: { nuovoTitolare: string; dal: Date }[];
  supplenze: { supplente: string; dal: Date; al: Date | null }[];
}

export interface AnnoClasseStorico {
  anno: string;
  nomeStorico: string | null;
  docenti: DocenteMateriaStorico[];
  cattedre: CattedraStorica[];
}

/** Shared event export for current and archived CLASSI slots; does not resolve the annual holder. */
export function buildCattedreTimeline(
  classe: Classe,
  classi: IClasseRepository,
  variazioni: VariazioneCattedra[],
  supplenze: Supplenza[]
): CattedraStorica[] {
  return classi.getTeachingSlots(classe).flatMap((slot) => {
    const applica = (evento: VariazioneCattedra | Supplenza): boolean =>
      rowAppliesToTeachingSlot(classi, classe.classeId.value, slot, evento.toData());
    const variazioniApplicabili = variazioni
      .filter(applica)
      .sort((a, b) => a.getDecorrenza().getTime() - b.getDecorrenza().getTime());
    const supplenzeApplicabili = supplenze
      .filter((evento) => evento.titolare !== evento.supplente && applica(evento))
      .sort((a, b) => a.getPeriodo().dal.getTime() - b.getPeriodo().dal.getTime());
    const delegationSource = new InMemoryDelegationSource({
      delegations: supplenzeApplicabili.map(
        (evento, index) =>
          new Delegation({
            id: String(index),
            principalId: evento.titolare,
            delegateId: evento.supplente,
            validFrom: evento.getPeriodo().dal,
            validTo: evento.getPeriodo().al,
            scope: Scope.global()
          })
      )
    });
    return slot.actorEmails.map((titolareOriginario) => {
      const titolari = new Set([titolareOriginario]);
      const variazioniTimeline = variazioniApplicabili
        .filter((evento) => {
          if (!titolari.has(evento.titolare)) return false;
          titolari.add(evento.nuovoTitolare);
          return true;
        })
        .map((evento) => ({ nuovoTitolare: evento.nuovoTitolare, dal: evento.getDecorrenza() }));
      // Ask the existing traversal at each start date, including chains whose rows share DAL.
      const delegationIds = new Set(
        supplenzeApplicabili.flatMap((evento) =>
          [...titolari].flatMap((titolare) =>
            delegationSource
              .getDelegationChain(titolare, 'DOCENTE', Scope.global(), evento.getPeriodo().dal)
              .map((delegation) => delegation.id)
          )
        )
      );
      const supplenzeTimeline = supplenzeApplicabili
        .filter((_evento, index) => delegationIds.has(String(index)))
        .map((evento) => ({
          supplente: evento.supplente,
          dal: evento.getPeriodo().dal,
          al: evento.getPeriodo().al
        }));
      return {
        materia:
          slot.specifica === null ? slot.materia.value : `${slot.materia.value}.${slot.specifica}`,
        isItp: slot.kind === 'ITP',
        titolareOriginario,
        variazioni: variazioniTimeline,
        supplenze: supplenzeTimeline
      };
    });
  });
}

/**
 * StoricoClassiService (13 §5): reconstructs a class's Consiglio di Classe in
 * prior school years. Class names change across years (renumbering, address
 * splits/merges), so `CLASSI.STORICO` on the CURRENT class row — an ordered
 * CSV of past names, index 0 = immediately-prior year — is consulted to know
 * which name to search for in each historical database.
 */
export class StoricoClassiService {
  constructor(private readonly provider: StoricoDatabaseProvider) {}

  /** `storico[i]` is the class's name in the i-th most recent prior year (from `ClasseRepository.getStorico`). */
  perClasse(storico: ClasseId[], profondita = 1): AnnoClasseStorico[] {
    const out: AnnoClasseStorico[] = [];
    const anni = this.provider.anniStorici(profondita);
    for (let i = 0; i < anni.length; i++) {
      const { anno, db } = anni[i]!;
      const nomeStorico = storico[i] ?? null;
      if (nomeStorico === null) {
        out.push({ anno, nomeStorico: null, docenti: [], cattedre: [] });
        continue;
      }
      const classi: IClasseRepository = new ClasseRepository(db);
      const variazioni = new VariazioneCattedraRepository(db);
      const supplenze = new SupplenzaRepository(db);
      const classe = classi.findById(nomeStorico);
      const docenti: DocenteMateriaStorico[] = [];
      let cattedre: CattedraStorica[] = [];
      if (classe !== null) {
        const fineAnno = new Date(`${AnnoScolastico.of(anno).getAnnoFine()}-08-31T00:00:00.000Z`);
        for (const assignment of new AldoTeachingAssignmentResolver(db).resolveConsiglio(
          classe,
          fineAnno,
          { includeReligioneAlt: true }
        )) {
          const { slot } = assignment;
          docenti.push({
            docenteEmail: assignment.titolare.id!,
            materia:
              slot.specifica === null
                ? slot.materia.value
                : `${slot.materia.value}.${slot.specifica}`,
            isItp: slot.kind === 'ITP'
          });
        }
        cattedre = buildCattedreTimeline(classe, classi, variazioni.findAll(), supplenze.findAll());
      }
      out.push({ anno, nomeStorico: nomeStorico.value, docenti, cattedre });
    }
    return out;
  }
}
