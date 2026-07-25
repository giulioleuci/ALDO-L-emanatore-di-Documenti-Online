import type { Cdu } from '../context-engine/Cdu';
import { ClasseRepository } from '../../infrastructure/repositories/ClasseRepository';
import type { IClasseRepository } from '../../domain/repositories/IClasseRepository';
import { DocenteRepository } from '../../infrastructure/repositories/DocenteRepository';
import { AlunnoRepository } from '../../infrastructure/repositories/AlunnoRepository';
import { DipartimentoRepository } from '../../infrastructure/repositories/DipartimentoRepository';
import type { IDipartimentoRepository } from '../../domain/repositories/IDipartimentoRepository';
import { MateriaRepository } from '../../infrastructure/repositories/MateriaRepository';
import type { IMateriaRepository } from '../../domain/repositories/IMateriaRepository';
import { RuoloSpecialeRepository } from '../../infrastructure/repositories/RuoloSpecialeRepository';
import type { IRuoloSpecialeRepository } from '../../domain/repositories/IRuoloSpecialeRepository';
import { SupplenzaRepository } from '../../infrastructure/repositories/SupplenzaRepository';
import type { ISupplenzaRepository } from '../../domain/repositories/ISupplenzaRepository';
import type { IDocenteRepository } from '../../domain/repositories/IDocenteRepository';
import type { IAlunnoRepository } from '../../domain/repositories/IAlunnoRepository';
import type { Classe } from '../../domain/entities/Classe';
import type { Docente } from '../../domain/entities/Docente';
import { Email } from '../../domain/value-objects/Email';
import { MateriaId } from '../../domain/value-objects/MateriaId';
import { IndirizzoId } from '../../domain/value-objects/IndirizzoId';
import { GestioneSupplenti } from '../../domain/value-objects/enums';
import { getClasseEntity } from '../context-engine/techEntities';
import { ValidationError } from '../../domain/errors/DomainError';
import { CattedraResolver } from './CattedraResolver';

export interface RisolviOptions {
  /** Supplenza routing for docente roles (14 §1.2); default SOLO_TITOLARI (supplenti ignored). */
  regolaSupplente?: GestioneSupplenti;
}

/** A role's resolved holders, before supplenza routing. */
type RoleResult =
  | { kind: 'docenti'; docenti: Docente[] } // subject to supplenza routing (14 §1.2)
  | { kind: 'emails'; emails: Email[] }; // student/family roles, never routed

/** The slice of CDU state a role strategy reads. */
interface RoleContext {
  cdu: Cdu;
  classe: Classe;
  data: Date;
  materiaCorrente: MateriaId | null;
}

type RoleStrategy = (ctx: RoleContext) => RoleResult;

/**
 * RisolutoreRuoliService (14 §1): translates the abstract role names used in
 * `CONF_DOC.PERMESSI` and `CONF_MAIL.SUPPLENTI` into concrete email addresses,
 * over the live CDU. A registry of strategies covers the SGSA role catalogue
 * (14 §1.1); the dynamic `ReferenteStrategy` is a jolly fallback for any `RUOLI`
 * table id (14 §1.1 dynamic roles). Docente roles are then run through
 * supplenza routing (14 §1.2) per the caller's `regolaSupplente`, reusing
 * `SupplenzaRepository.findSupplenzaSpecifica` (the same chain-resolved
 * substitute the email pipeline uses).
 */
export class RisolutoreRuoliService {
  private readonly classi: IClasseRepository;
  private readonly docenti: IDocenteRepository;
  private readonly alunni: IAlunnoRepository;
  private readonly dipartimenti: IDipartimentoRepository;
  private readonly materie: IMateriaRepository;
  private readonly ruoli: IRuoloSpecialeRepository;
  private readonly supplenze: ISupplenzaRepository;
  private readonly cattedraResolver: CattedraResolver;
  private readonly registro: Map<string, RoleStrategy>;

  constructor(database: RepositoryDatabase) {
    this.classi = new ClasseRepository(database);
    this.docenti = new DocenteRepository(database);
    this.alunni = new AlunnoRepository(database);
    this.dipartimenti = new DipartimentoRepository(database);
    this.materie = new MateriaRepository(database);
    this.ruoli = new RuoloSpecialeRepository(database);
    this.supplenze = new SupplenzaRepository(database);
    this.cattedraResolver = new CattedraResolver(database);
    this.registro = this.buildRegistro();
  }

  /** Resolves a role to concrete emails; throws if neither a strategy nor a RUOLI id matches. */
  risolvi(ruolo: string, cdu: Cdu, options: RisolviOptions = {}): Email[] {
    const ctx = this.contextFrom(cdu);
    const strategy = this.registro.get(ruolo);
    const result = strategy !== undefined ? strategy(ctx) : this.referente(ruolo);
    if (result === null) {
      throw new ValidationError(`Ruolo non registrato: ${ruolo}`);
    }
    if (result.kind === 'emails') return dedupe(result.emails);
    const regola = options.regolaSupplente ?? GestioneSupplenti.SOLO_TITOLARI;
    return dedupe(this.applicaSupplenze(result.docenti, ctx, regola));
  }

  private contextFrom(cdu: Cdu): RoleContext {
    const materiaRaw = cdu.meta.parametriInput.materiaCorrente;
    return {
      cdu,
      classe: getClasseEntity(cdu),
      data: new Date(cdu.meta.date.oggi.iso),
      materiaCorrente:
        materiaRaw !== null && materiaRaw.trim() !== '' ? MateriaId.of(materiaRaw) : null
    };
  }

  private buildRegistro(): Map<string, RoleStrategy> {
    const docenti = (list: Docente[]): RoleResult => ({ kind: 'docenti', docenti: list });
    return new Map<string, RoleStrategy>([
      // --- Class roles ---
      ['COORDINATORI', (c) => docenti(this.classi.getCoordinatori(c.classe))],
      ['CDC', (c) => docenti(this.cdcCompleto(c.classe, c.data))],
      ['CDC_FILTER_ALUNNO', (c) => docenti(this.cdcFiltrato(c))],
      ['DOCENTI_NO_RELIGIONE', (c) => docenti(this.docentiPermanenti(c.classe, c.data))],
      // REL/ALT merged column protection (MAT_NON_STANDARD §2.C) — IRC + ALT deduped by email.
      ['DOCENTI_IRC_ALT', (c) => docenti(this.docentiIrcAlt(c.classe, c.data))],
      // --- Single-teacher roles from CLASSI.RUOLI JSON ---
      ['SEGRETARIO_CDC', (c) => docenti(this.classi.getDocentiRuolo(c.classe, 'SEGRETARIO'))],
      ['TUTOR_ASL', (c) => docenti(this.classi.getDocentiRuolo(c.classe, 'TUTOR_ASL'))],
      ['TUTOR_ORIENT', (c) => docenti(this.classi.getDocentiRuolo(c.classe, 'TUTOR_ORIENT'))],
      // --- Subject-scoped roles (need meta.parametriInput.materiaCorrente) ---
      ['DOCENTE_MATERIA', (c) => docenti(this.docenteMateria(c))],
      ['CAPO_DIPARTIMENTO', (c) => docenti(this.capoDipartimento(c))],
      ['DOCENTE_PRIMA_PROVA', (c) => docenti(this.docentiProva(c, 'prima'))],
      ['DOCENTE_SECONDA_PROVA', (c) => docenti(this.docentiProva(c, 'seconda'))],
      // --- Student / family roles (emails, no supplenza routing) ---
      ['ALUNNO', (c) => ({ kind: 'emails', emails: this.alunnoEmail(c) })],
      ['FAMIGLIA', (c) => ({ kind: 'emails', emails: this.famiglia(c) })],
      ['GENITORI_CLASSE', (c) => ({ kind: 'emails', emails: this.genitoriClasse(c) })],
      [
        'RAPPRESENTANTI_STUDENTI',
        (c) => ({ kind: 'emails', emails: this.rappresentantiStudenti(c) })
      ]
    ]);
  }

  /** Full council: effective permanent subject teachers + IRC + ALT (14 §1.1 CDC). */
  private cdcCompleto(classe: Classe, data: Date): Docente[] {
    return this.docentiEffettivi(classe, data, { includeReligioneAlt: true });
  }

  /** Effective permanent holders across every subject in the cattedra matrix, deduped. */
  private docentiPermanenti(classe: Classe, data: Date): Docente[] {
    return this.docentiEffettivi(classe, data, {});
  }

  private docentiEffettivi(
    classe: Classe,
    data: Date,
    options: { includeReligioneAlt?: boolean }
  ): Docente[] {
    const byEmail = new Map<string, Docente>();
    for (const a of this.cattedraResolver.resolveConsiglio(classe, data, options)) {
      if (a.titolare.id !== null) byEmail.set(a.titolare.id, a.titolare);
    }
    return [...byEmail.values()];
  }

  /** IRC + ALT effective holders, deduped by email — now resolved via CattedraResolver like any subject. */
  private docentiIrcAlt(classe: Classe, data: Date): Docente[] {
    const byEmail = new Map<string, Docente>();
    for (const a of this.cattedraResolver.resolveConsiglio(classe, data, {
      includeReligioneAlt: true
    })) {
      if ((a.materia.value === 'IRC' || a.materia.value === 'ALT') && a.titolare.id !== null) {
        byEmail.set(a.titolare.id, a.titolare);
      }
    }
    return [...byEmail.values()];
  }

  /** Filtered council for the alunno in focus — reuses the CDU VM built by CdcAssembler (14 §1.3). */
  private cdcFiltrato(ctx: RoleContext): Docente[] {
    const vms = ctx.cdu.focus.alunno?.consiglioDiClasseFiltrato ?? [];
    const out: Docente[] = [];
    for (const vm of vms) {
      const d = this.docenti.findById(vm.anagrafica.email);
      if (d !== null) out.push(d);
    }
    return out;
  }

  /**
   * KNOWN LIMITATION (not fixed, out of scope): resolves directly against
   * `ctx.classe` with no partner-routing for articulated classes. For a
   * split subject on an articulated PARENT class, the parent legitimately
   * has no value for that column, so this silently returns an empty
   * nominal-holder list instead of the actual teacher (who is only
   * resolvable via the partner class). `CdcAssembler.assignmentsArticolata`
   * handles this correctly for the CDU path by partner-routing via
   * `orderedPartners`; this method should eventually do the same.
   */
  private docenteMateria(ctx: RoleContext): Docente[] {
    if (ctx.materiaCorrente === null) return [];
    return this.cattedraResolver.resolvePermanenti(ctx.classe, ctx.materiaCorrente, ctx.data);
  }

  private capoDipartimento(ctx: RoleContext): Docente[] {
    if (ctx.materiaCorrente === null) return [];
    const dip = this.dipartimenti.findByMateria(ctx.materiaCorrente);
    if (dip === null) return [];
    const capo = dip.getCapoEmail();
    if (capo === null) return [];
    const d = this.docenti.findById(capo.value);
    return d === null ? [] : [d];
  }

  /** Teachers of the exam subject(s) for the class's indirizzo (14 §1.1 DOCENTE_*_PROVA). */
  private docentiProva(ctx: RoleContext, prova: 'prima' | 'seconda'): Docente[] {
    const indirizzo = IndirizzoId.of(ctx.classe.indirizzo);
    const out: Docente[] = [];
    for (const materia of this.materie.findAllCached()) {
      const cfg = materia.esameConfig;
      if (cfg === null) continue;
      const matches =
        prova === 'prima'
          ? cfg.isPrimaProvaPerIndirizzo(indirizzo)
          : cfg.isSecondaProvaPerIndirizzo(indirizzo);
      if (matches)
        out.push(...this.cattedraResolver.resolvePermanenti(ctx.classe, materia.materiaId, ctx.data));
    }
    return out;
  }

  private alunnoEmail(ctx: RoleContext): Email[] {
    const email = ctx.cdu.focus.alunno?.anagrafica.email;
    return email !== undefined && email.trim() !== '' ? [Email.of(email)] : [];
  }

  private famiglia(ctx: RoleContext): Email[] {
    const email = ctx.cdu.focus.alunno?.anagrafica.email;
    if (email === undefined) return [];
    const alunno = this.alunni.findById(email);
    return alunno === null ? [] : alunno.getTutors();
  }

  private genitoriClasse(ctx: RoleContext): Email[] {
    const attivi = this.classi.getStudenti(ctx.classe, true);
    return attivi.flatMap((a) => a.getTutors());
  }

  private rappresentantiStudenti(ctx: RoleContext): Email[] {
    return this.classi
      .getStudenti(ctx.classe, true)
      .filter((a) => a.isRappresentante())
      .map((a) => Email.of(a.id ?? ''));
  }

  /** Dynamic RUOLI jolly (14 §1.1): a role id present in the RUOLI table resolves its DOCENTE list. */
  private referente(ruolo: string): RoleResult | null {
    const record = this.ruoli.findById(ruolo);
    if (record === null) return null;
    return { kind: 'docenti', docenti: this.docentiFromEmails(record.getEmails()) };
  }

  private docentiFromEmails(emails: Email[]): Docente[] {
    const out: Docente[] = [];
    for (const e of emails) {
      const d = this.docenti.findById(e.value);
      if (d !== null) out.push(d);
    }
    return out;
  }

  /**
   * Maps SGSA's `GestioneSupplenti` (14 §1.2) onto `RoleResolutionLib`'s
   * `RoutingPolicy` (ref REPORT_GLF.md B4): SOLO_SUPPLENTI is
   * `DELEGATE_OR_PRINCIPAL` (substitute if one is active, else the titolare —
   * distinct from `DELEGATE_ONLY`, which would drop the recipient entirely
   * when there's no substitute), ENTRAMBI is `BOTH_EQUAL`, SOLO_TITOLARI is
   * `PRINCIPAL_ONLY`.
   */
  private static readonly ROUTING_POLICY: Record<GestioneSupplenti, RoutingPolicyValue> = {
    [GestioneSupplenti.SOLO_SUPPLENTI]: RoutingPolicy.DELEGATE_OR_PRINCIPAL,
    [GestioneSupplenti.ENTRAMBI]: RoutingPolicy.BOTH_EQUAL,
    [GestioneSupplenti.SOLO_TITOLARI]: RoutingPolicy.PRINCIPAL_ONLY
  };

  private readonly routing = new RoutingResolver();

  /**
   * Supplenza routing (14 §1.2) mirroring the email pipeline's
   * ResolveRecipientsStep. The domain lookup (active period, class/subject
   * applicability, chain-resolved supply-of-supply) stays SGSA-specific via
   * `SupplenzaRepository.findSupplenzaSpecifica` -> the library's transitive
   * delegation crawl; once resolved to a (titolare, supplente|null) pair, the
   * SOLO_SUPPLENTI/ENTRAMBI/SOLO_TITOLARI decision is delegated to
   * `RoleResolutionLib.RoutingResolver` instead of a hand-rolled switch (ref
   * REPORT_GLF.md B4).
   */
  private applicaSupplenze(
    docenti: Docente[],
    ctx: RoleContext,
    regola: GestioneSupplenti
  ): Email[] {
    const policy = RisolutoreRuoliService.ROUTING_POLICY[regola];
    const out: Email[] = [];
    for (const titolare of docenti) {
      const titolareEmail = titolare.id ?? '';
      if (titolareEmail === '') continue;
      const supplenza = this.supplenze.findSupplenzaSpecifica(
        titolare,
        ctx.data,
        ctx.classe.classeId,
        ctx.materiaCorrente ?? undefined
      );
      const supplenteEmail = supplenza?.supplente ?? null;

      const principal = new Actor(titolareEmail, ActorType.PERSON, titolareEmail, titolareEmail);
      const effective =
        supplenteEmail === null
          ? null
          : new Actor(supplenteEmail, ActorType.PERSON, supplenteEmail, supplenteEmail);

      const result = this.routing.resolve({
        principalActor: principal,
        effectiveActor: effective,
        // No active substitute -> RoutingResolver short-circuits to the
        // principal alone regardless of policy, matching every regola's
        // "no supplenza" behavior (fallback for SOLO_SUPPLENTI, single entry
        // for ENTRAMBI, unaffected for SOLO_TITOLARI).
        delegationChain: { isEmpty: () => effective === null },
        routingPolicy: policy
      });

      // BOTH_EQUAL orders [effective, principal]; SGSA keeps titolare first.
      const ordered =
        policy === RoutingPolicy.BOTH_EQUAL
          ? [...result.primary].sort((a) => (a.id === titolareEmail ? -1 : 1))
          : result.primary;
      for (const actor of ordered) out.push(Email.of(actor.identifier));
    }
    return out;
  }
}

function dedupe(emails: Email[]): Email[] {
  const seen = new Set<string>();
  const out: Email[] = [];
  for (const e of emails) {
    if (!seen.has(e.value)) {
      seen.add(e.value);
      out.push(e);
    }
  }
  return out;
}
