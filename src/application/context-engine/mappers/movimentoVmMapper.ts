import type { MovimentoAlunno } from '../../../domain/entities/MovimentoAlunno';
import type {
  ClasseRiferimentoVM,
  MovimentoAlunnoVM,
  MovimentoClasseVM,
  PersonaRiferimentoVM,
  PresenzaAlunnoVM,
  ProvenienzaDestinazioneVM
} from '../Cdu';
import { formatOggi } from '../dates';
import { PipelineError } from '../../../domain/errors/DomainError';

const TIPO_LABEL = {
  IN: 'Ingresso',
  OUT: 'Trasferimento in uscita',
  RITIRATO: 'Ritiro',
  CAMBIO: 'Cambio di classe'
} as const;

function estremo(
  valore: string,
  risolviClasse: (id: string) => ClasseRiferimentoVM | null
): ProvenienzaDestinazioneVM | null {
  if (valore === '') return null;
  const classe = risolviClasse(valore);
  return {
    valore,
    descrizione: classe?.nome ?? valore,
    classe,
    scuolaEsterna: classe === null ? valore : null,
    isClasse: classe !== null,
    isScuolaEsterna: classe === null
  };
}

function descrizione(
  tipo: MovimentoAlunnoVM['tipo'],
  provenienza: ProvenienzaDestinazioneVM | null,
  destinazione: ProvenienzaDestinazioneVM | null
): string {
  if (tipo === 'IN')
    return provenienza === null ? 'Ingresso' : `Ingresso da ${provenienza.descrizione}`;
  if (tipo === 'OUT') {
    return destinazione === null
      ? 'Trasferimento in uscita'
      : `Trasferimento in uscita verso ${destinazione.descrizione}`;
  }
  if (tipo === 'RITIRATO') return 'Ritiro';
  const da = provenienza?.descrizione ?? '';
  const a = destinazione?.descrizione ?? '';
  return `Cambio di classe da ${da} a ${a}`.trim();
}

export function buildMovimentoAlunnoVm(
  movimento: MovimentoAlunno,
  risolviClasse: (id: string) => ClasseRiferimentoVM | null
): MovimentoAlunnoVM {
  const data = formatOggi(new Date(`${movimento.data}T00:00:00Z`));
  const provenienza = estremo(movimento.da, risolviClasse);
  const destinazione = movimento.isRitirato() ? null : estremo(movimento.a, risolviClasse);
  return {
    tipo: movimento.tipo,
    tipoLabel: TIPO_LABEL[movimento.tipo],
    data: movimento.data,
    dataBreve: data.breve,
    dataEstesa: data.estesa,
    provenienza,
    destinazione,
    isIngresso: movimento.isIngresso(),
    isUscita: movimento.isUscita(),
    isRitirato: movimento.isRitirato(),
    isCambioClasse: movimento.isCambioClasse(),
    descrizione: descrizione(movimento.tipo, provenienza, destinazione)
  };
}

export function buildMovimentoClasseVm(
  movimento: MovimentoAlunnoVM,
  studente: PersonaRiferimentoVM,
  scopeClassi: Set<string>
): MovimentoClasseVM {
  const daInterna =
    movimento.provenienza?.classe !== null &&
    movimento.provenienza?.classe !== undefined &&
    scopeClassi.has(movimento.provenienza.classe.nome);
  const aInterna =
    movimento.destinazione?.classe !== null &&
    movimento.destinazione?.classe !== undefined &&
    scopeClassi.has(movimento.destinazione.classe.nome);
  if (!daInterna && !aInterna) {
    throw new PipelineError('Il movimento non appartiene allo scope della classe');
  }
  const direzione = daInterna && aInterna ? 'INTERNA' : aInterna ? 'ENTRATA' : 'USCITA';
  return {
    ...movimento,
    studente,
    direzione,
    direzioneLabel:
      direzione === 'ENTRATA'
        ? 'In entrata'
        : direzione === 'USCITA'
          ? 'In uscita'
          : 'Movimento interno',
    isEntrata: direzione === 'ENTRATA',
    isUscita: direzione === 'USCITA',
    isMovimentoInterno: direzione === 'INTERNA'
  };
}

export function buildPresenzaAlunnoVm(
  movimentiFiltrati: MovimentoAlunnoVM[],
  annoPrecedente: { isCalcolato: boolean; isPresente: boolean },
  classeCorrente: string
): PresenzaAlunnoVM {
  const movimenti = [...movimentiFiltrati].sort((a, b) => b.data.localeCompare(a.data));
  const ultimoCambio = movimenti.find(
    (movimento) =>
      movimento.isCambioClasse && movimento.destinazione?.classe?.nome === classeCorrente
  );
  const classePrecedente = ultimoCambio?.provenienza?.classe ?? null;
  return {
    annoPrecedente,
    isPresenteTuttoAnno: !movimenti.some(
      (movimento) =>
        (movimento.isIngresso || movimento.isCambioClasse) &&
        movimento.destinazione?.classe?.nome === classeCorrente
    ),
    hasCambiatoClasse: movimenti.some((movimento) => movimento.isCambioClasse),
    classePrecedente,
    hasClassePrecedente: classePrecedente !== null
  };
}
