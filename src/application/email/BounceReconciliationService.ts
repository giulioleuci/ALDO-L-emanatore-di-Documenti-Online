import type { ILogEmailRepository } from '../../domain/repositories/ILogEmailRepository';
import type { IMasterSheetRepository } from '../../domain/repositories/IMasterSheetRepository';
import type { IGmailFacade } from '../../infrastructure/facades/GmailServiceFacade';
import type { IActiveUserFacade } from '../../infrastructure/facades/ActiveUserFacade';
import { StatoEmail } from '../../domain/value-objects/enums';
import { escapeHtml } from './boxes';
import { parseNdr } from './NdrParser';

const DAY_MS = 86_400_000;

export interface BounceFilters {
  da?: Date;
  a?: Date;
  patterns?: string[];
  lookbackGiorni?: number;
}
export interface BounceDetail {
  pattern: string;
  destinatari: string;
  rejected: string;
  diagnostica: string;
}
export interface BounceSummary {
  ispezionati: number;
  riconciliati: number;
  anomalie: number;
  dettagli: BounceDetail[];
}

interface BounceDeps {
  gmail: IGmailFacade;
  logMail: ILogEmailRepository;
  master: IMasterSheetRepository;
  activeUser: IActiveUserFacade;
  logger: LoggerService;
  now: () => Date;
}

/** Correlates Gmail NDRs (mailer-daemon) with SUCCESS LOG_MAIL rows and flips them to BOUNCED. */
export class BounceReconciliationService {
  constructor(private readonly deps: BounceDeps) {}

  riconcilia(f: BounceFilters): BounceSummary {
    const { gmail, logMail, logger, now } = this.deps;
    const t = now();
    const giorni =
      f.da !== undefined
        ? Math.ceil((t.getTime() - f.da.getTime()) / DAY_MS) + 1
        : (f.lookbackGiorni ?? 2);
    const da = f.da ?? new Date(t.getTime() - (f.lookbackGiorni ?? 2) * DAY_MS);
    const ndrs = gmail.searchBounceMessages(giorni);
    const summary: BounceSummary = {
      ispezionati: ndrs.length,
      riconciliati: 0,
      anomalie: 0,
      dettagli: []
    };
    if (ndrs.length === 0) {
      logger.info(
        'VERIFICA_EMAIL_INVIATE: nessun NDR trovato (pattern con NOREPLY=TRUE non generano NDR)'
      );
      return summary;
    }
    const candidati = logMail
      .findByStato(StatoEmail.SUCCESS)
      .filter(
        (l) =>
          (f.patterns === undefined || f.patterns.includes(l.pattern)) &&
          new Date(l.data) >= da &&
          (f.a === undefined || new Date(l.data) <= f.a)
      );
    for (const ndr of ndrs) {
      const p = parseNdr(ndr.body);
      const hit =
        p === null
          ? undefined
          : candidati
              .filter(
                (l) =>
                  new Date(l.data) <= ndr.date &&
                  l.getDestinatari().some((d) => d.toLowerCase() === p.recipient)
              )
              .sort((x, y) => y.data.localeCompare(x.data))[0];
      if (p === null || hit === undefined) {
        summary.anomalie++;
        continue;
      }
      logMail.marcaRimbalzo(hit, `${p.reason} (${p.recipient})`, {
        bouncedAt: t.toISOString(),
        bounceMessageId: ndr.id
      });
      candidati.splice(candidati.indexOf(hit), 1); // one NDR → one row
      summary.riconciliati++;
      summary.dettagli.push({
        pattern: hit.pattern,
        destinatari: hit.destinatariRaw,
        rejected: p.recipient,
        diagnostica: p.reason
      });
    }
    logger.info(
      PiiRedactor.redact(
        `VERIFICA_EMAIL_INVIATE: ${summary.riconciliati}/${summary.ispezionati} NDR riconciliati, ${summary.anomalie} anomalie`
      )
    );
    if (summary.riconciliati > 0) this.notifica(summary);
    return summary;
  }

  private notifica(s: BounceSummary): void {
    const cfg = this.deps.master.findConfigAnnoCorrente();
    const to = [
      ...new Set(
        [this.deps.activeUser.getEmail(), cfg.hasSupervisore() ? cfg.supervisoreEmail : ''].filter(
          (e) => e !== ''
        )
      )
    ];
    if (to.length === 0) return;
    const righe = s.dettagli
      .map(
        (d) =>
          `<li>${escapeHtml(d.pattern)} → ${escapeHtml(d.rejected)}: ${escapeHtml(d.diagnostica)}</li>`
      )
      .join('');
    this.deps.gmail.sendEmail({
      to,
      subject: `[SGSA] ${s.riconciliati} email non recapitate (rimbalzi)`,
      htmlBody: `<p>NDR ispezionati: ${s.ispezionati}, rimbalzi correlati: ${s.riconciliati}, anomalie: ${s.anomalie}.</p><ul>${righe}</ul><p>Correggere gli indirizzi nel database.</p>`
    });
  }
}
