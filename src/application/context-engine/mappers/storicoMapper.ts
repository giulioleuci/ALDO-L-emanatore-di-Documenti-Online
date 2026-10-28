import type { AnnoAlunnoStorico } from '../../storico/StoricoAlunniService';
import { tipoPianoLabel } from './labels';
import type { TipoPiano } from '../../../domain/value-objects/enums';
import type { StoricoAlunnoVM } from '../Cdu';
import { elencoVm } from './elencoVm';
import { buildMovimentoAlunnoVm, buildPresenzaAlunnoVm } from './movimentoVmMapper';

const ESITO_LABELS: Record<AnnoAlunnoStorico['esito'], string> = {
  PROMOSSO: 'Promosso',
  NON_PROMOSSO: 'Non promosso',
  TRASFERITO: 'Trasferito',
  RITIRATO: 'Ritirato',
  SCONOSCIUTO: 'Sconosciuto'
};

/**
 * Builds the serializable historical student projection from its raw per-year rows.
 */
export function buildStoricoAlunnoVm(anni: AnnoAlunnoStorico[]): StoricoAlunnoVM {
  const mapped = [...anni]
    .sort((a, b) => b.anno.localeCompare(a.anno))
    .map((anno) => {
      const carenze = [...anno.carenze].sort(
        (a, b) => a.materiaSigla.localeCompare(b.materiaSigla) || a.valore.localeCompare(b.valore)
      );
      const piani = [...anno.piani]
        .sort((a, b) => a.localeCompare(b))
        .map((tipo) => ({ tipo, tipoLabel: tipoPianoLabel(tipo as TipoPiano) }));
      const classe = anno.classe === null || anno.classe === '' ? null : { nome: anno.classe };
      const classiInterne = new Set(anno.classiInterne);
      const movimenti = [...anno.movimenti]
        .sort(
          (a, b) =>
            b.data.localeCompare(a.data) ||
            a.tipo.localeCompare(b.tipo) ||
            a.da.localeCompare(b.da) ||
            a.a.localeCompare(b.a)
        )
        .map((movimento) =>
          buildMovimentoAlunnoVm(movimento, (id) => (classiInterne.has(id) ? { nome: id } : null))
        );
      return {
        annoScolastico: anno.anno,
        classe,
        esito: anno.esito,
        esitoLabel: ESITO_LABELS[anno.esito],
        isPromosso: anno.esito === 'PROMOSSO',
        isNonPromosso: anno.esito === 'NON_PROMOSSO',
        carenze,
        hasCarenze: carenze.length > 0,
        carenzeDescrizione: carenze
          .map((carenza) => `${carenza.materiaSigla}: ${carenza.valore}`)
          .join(', '),
        piani,
        hasPiani: piani.length > 0,
        presenza: buildPresenzaAlunnoVm(
          movimenti,
          {
            isCalcolato: anno.annoPrecedenteCalcolato,
            isPresente: anno.presenteAnnoPrecedente
          },
          anno.classe ?? ''
        ),
        movimenti: elencoVm(movimenti)
      };
    });
  const bocciature = mapped.flatMap((anno) =>
    anno.esito === 'NON_PROMOSSO' && anno.classe !== null
      ? [{ annoScolastico: anno.annoScolastico, classe: anno.classe }]
      : []
  );
  return {
    anni: mapped,
    hasAnni: mapped.length > 0,
    numeroAnni: mapped.length,
    bocciature: {
      ...elencoVm(bocciature),
      elencoDescrizione: bocciature
        .map((anno) => `${anno.annoScolastico} (${anno.classe.nome})`)
        .join(', ')
    }
  };
}
