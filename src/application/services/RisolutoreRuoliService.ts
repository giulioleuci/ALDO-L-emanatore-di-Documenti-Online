import type { Cdu } from '../context-engine/Cdu';
import type { IClasseRepository } from '../../domain/repositories/IClasseRepository';
import type { IDipartimentoRepository } from '../../domain/repositories/IDipartimentoRepository';
import type { IMateriaRepository } from '../../domain/repositories/IMateriaRepository';
import type { IRuoloSpecialeRepository } from '../../domain/repositories/IRuoloSpecialeRepository';
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
import type {
  ITeachingAssignmentResolver,
  TeachingAssignment
} from '../ports/ITeachingAssignmentResolver';
import { routingPolicyByGestioneSupplenti } from '../context-engine/TeachingCouncilProjection';

export interface RisolviOptions {
  regolaSupplente?: GestioneSupplenti;
  /** Restricts an articulated subject role to the assignment owned by one partner class. */
  classeId?: string;
}

interface RoleContext {
  cdu: Cdu;
  classe: Classe;
  data: Date;
  materiaCorrente: MateriaId | null;
  routingPolicy: RoutingPolicyValue;
  classeId: string | null;
}

type RoleStrategy = (ctx: RoleContext) => Email[];

export interface RisolutoreRuoliDependencies {
  classi: IClasseRepository;
  docenti: IDocenteRepository;
  alunni: IAlunnoRepository;
  dipartimenti: IDipartimentoRepository;
  materie: IMateriaRepository;
  ruoli: IRuoloSpecialeRepository;
  teachingAssignments: ITeachingAssignmentResolver;
}

const routedActorOperations: ProjectionOperation[] = [
  { type: 'flatMap', path: 'routing.primary' },
  { type: 'distinctBy', keys: ['id'] }
];

const mergedRoutingOperations: ProjectionOperation[] = [
  { type: 'flatMap', path: 'assignments' },
  ...routedActorOperations
];

interface RoutedActor {
  id: string;
  cognome: string;
}

function routingRows(assignments: TeachingAssignment[]): Array<{
  classeId: string;
  routing: { primary: RoutedActor[] };
}> {
  return assignments.map((assignment) => ({
    classeId: assignment.classeId.value,
    routing: {
      primary: assignment.routing.primary.flatMap((docente) =>
        docente.id === null ? [] : [{ id: docente.id, cognome: docente.cognome }]
      )
    }
  }));
}

/**
 * Resolves SGSA role names. Teaching roles consume the Task 5 port and the
 * already-computed GLF routing result; ALDO owns only role registration,
 * school-domain filtering, and conversion to Email value objects.
 */
export class RisolutoreRuoliService {
  private readonly classi: IClasseRepository;
  private readonly docenti: IDocenteRepository;
  private readonly alunni: IAlunnoRepository;
  private readonly dipartimenti: IDipartimentoRepository;
  private readonly materie: IMateriaRepository;
  private readonly ruoli: IRuoloSpecialeRepository;
  private readonly teachingAssignments: ITeachingAssignmentResolver;
  private readonly projector = new CollectionProjector({
    expressionEngine: new ExpressionEngineService({ logger: new LoggerService() }),
    logger: new LoggerService()
  });
  private readonly registro: Map<string, RoleStrategy>;

  constructor({
    classi,
    docenti,
    alunni,
    dipartimenti,
    materie,
    ruoli,
    teachingAssignments
  }: RisolutoreRuoliDependencies) {
    this.classi = classi;
    this.docenti = docenti;
    this.alunni = alunni;
    this.dipartimenti = dipartimenti;
    this.materie = materie;
    this.ruoli = ruoli;
    this.teachingAssignments = teachingAssignments;
    this.registro = this.buildRegistro();
  }

  risolvi(ruolo: string, cdu: Cdu, options: RisolviOptions = {}): Email[] {
    const ctx = this.contextFrom(cdu, options);
    const strategy = this.registro.get(ruolo);
    const result = strategy !== undefined ? strategy(ctx) : this.referente(ruolo);
    if (result === null) throw new ValidationError(`Ruolo non registrato: ${ruolo}`);
    return this.distinctEmails(result);
  }

  private contextFrom(cdu: Cdu, options: RisolviOptions): RoleContext {
    const materiaRaw = cdu.meta.parametriInput.materiaCorrente;
    const gestione = options.regolaSupplente ?? GestioneSupplenti.SOLO_TITOLARI;
    return {
      cdu,
      classe: getClasseEntity(cdu),
      data: new Date(cdu.meta.date.oggi.iso),
      materiaCorrente:
        materiaRaw !== null && materiaRaw.trim() !== '' ? MateriaId.of(materiaRaw) : null,
      routingPolicy: routingPolicyByGestioneSupplenti[gestione],
      classeId: options.classeId?.trim() || null
    };
  }

  private buildRegistro(): Map<string, RoleStrategy> {
    return new Map<string, RoleStrategy>([
      ['COORDINATORI', (c) => this.emailsOf(this.classi.getCoordinatori(c.classe))],
      ['CDC', (c) => this.cdc(c)],
      ['CDC_FILTER_ALUNNO', (c) => this.cdcFiltrato(c)],
      ['DOCENTI_NO_RELIGIONE', (c) => this.docentiNoReligione(c)],
      ['DOCENTI_IRC_ALT', (c) => this.docentiIrcAlt(c)],
      ['SEGRETARIO_CDC', (c) => this.emailsOf(this.classi.getDocentiRuolo(c.classe, 'SEGRETARIO'))],
      ['TUTOR_ASL', (c) => this.emailsOf(this.classi.getDocentiRuolo(c.classe, 'TUTOR_ASL'))],
      ['TUTOR_ORIENT', (c) => this.emailsOf(this.classi.getDocentiRuolo(c.classe, 'TUTOR_ORIENT'))],
      ['DOCENTE_MATERIA', (c) => this.docenteMateria(c)],
      ['CAPO_DIPARTIMENTO', (c) => this.emailsOf(this.capoDipartimento(c))],
      ['DOCENTE_PRIMA_PROVA', (c) => this.docentiProva(c, 'prima')],
      ['DOCENTE_SECONDA_PROVA', (c) => this.docentiProva(c, 'seconda')],
      ['ALUNNO', (c) => this.alunnoEmail(c)],
      ['FAMIGLIA', (c) => this.famiglia(c)],
      ['GENITORI_CLASSE', (c) => this.genitoriClasse(c)],
      ['RAPPRESENTANTI_STUDENTI', (c) => this.rappresentantiStudenti(c)]
    ]);
  }

  private cdc(ctx: RoleContext): Email[] {
    return this.routedEmails(
      this.teachingAssignments.resolveConsiglio(ctx.classe, ctx.data, {
        includeReligioneAlt: true,
        routingPolicy: ctx.routingPolicy
      })
    );
  }

  private docentiNoReligione(ctx: RoleContext): Email[] {
    return this.routedEmails(
      this.teachingAssignments.resolveConsiglio(ctx.classe, ctx.data, {
        includeReligioneAlt: false,
        routingPolicy: ctx.routingPolicy
      })
    );
  }

  /**
   * REL/ALT is a display group: IRC and ALT are resolved independently, then
   * their already-routed actors are merged by GLF flatMap + distinctBy.
   */
  private docentiIrcAlt(ctx: RoleContext): Email[] {
    const groups = [MateriaId.of('IRC'), MateriaId.of('ALT')].map((materia) => ({
      assignments: routingRows(
        this.teachingAssignments.resolveMateria(ctx.classe, materia, ctx.data, ctx.routingPolicy)
      )
    }));
    const actors = this.projector.project(groups, mergedRoutingOperations).value as RoutedActor[];
    return actors.map((actor) => Email.of(actor.id));
  }

  private cdcFiltrato(ctx: RoleContext): Email[] {
    return (ctx.cdu.focus.alunno?.consiglioDiClasseFiltrato ?? []).map((vm) =>
      Email.of(vm.anagrafica.email)
    );
  }

  private docenteMateria(ctx: RoleContext): Email[] {
    if (ctx.materiaCorrente === null) return [];
    return this.routedEmails(
      this.teachingAssignments.resolveMateria(
        ctx.classe,
        ctx.materiaCorrente,
        ctx.data,
        ctx.routingPolicy
      ),
      ctx.classeId
    );
  }

  private capoDipartimento(ctx: RoleContext): Docente[] {
    if (ctx.materiaCorrente === null) return [];
    const dipartimento = this.dipartimenti.findByMateria(ctx.materiaCorrente);
    const capo = dipartimento?.getCapoEmail() ?? null;
    if (capo === null) return [];
    const docente = this.docenti.findById(capo.value);
    return docente === null ? [] : [docente];
  }

  private docentiProva(ctx: RoleContext, prova: 'prima' | 'seconda'): Email[] {
    const indirizzo = IndirizzoId.of(ctx.classe.indirizzo);
    const assignments: TeachingAssignment[] = [];
    for (const materia of this.materie.findAllCached()) {
      const config = materia.esameConfig;
      if (config === null) continue;
      const matches =
        prova === 'prima'
          ? config.isPrimaProvaPerIndirizzo(indirizzo)
          : config.isSecondaProvaPerIndirizzo(indirizzo);
      if (!matches) continue;
      assignments.push(
        ...this.teachingAssignments.resolveMateria(
          ctx.classe,
          materia.materiaId,
          ctx.data,
          ctx.routingPolicy
        )
      );
    }
    return this.routedEmails(assignments);
  }

  private routedEmails(assignments: TeachingAssignment[], classeId: string | null = null): Email[] {
    const operations: ProjectionOperation[] =
      classeId === null
        ? routedActorOperations
        : [
            { type: 'filter', expression: 'classeId == selectedClasseId' },
            ...routedActorOperations
          ];
    const actors = this.projector.project(routingRows(assignments), operations, {
      selectedClasseId: classeId
    }).value as RoutedActor[];
    return actors.map((actor) => Email.of(actor.id));
  }

  private alunnoEmail(ctx: RoleContext): Email[] {
    const email = ctx.cdu.focus.alunno?.anagrafica.email;
    return email !== undefined && email.trim() !== '' ? [Email.of(email)] : [];
  }

  private famiglia(ctx: RoleContext): Email[] {
    const email = ctx.cdu.focus.alunno?.anagrafica.email;
    if (email === undefined) return [];
    return this.alunni.findById(email)?.getTutors() ?? [];
  }

  private genitoriClasse(ctx: RoleContext): Email[] {
    return this.classi.getStudenti(ctx.classe, true).flatMap((alunno) => alunno.getTutors());
  }

  private rappresentantiStudenti(ctx: RoleContext): Email[] {
    return this.classi
      .getStudenti(ctx.classe, true)
      .filter((alunno) => alunno.isRappresentante())
      .map((alunno) => Email.of(alunno.id ?? ''));
  }

  private referente(ruolo: string): Email[] | null {
    const record = this.ruoli.findById(ruolo);
    return record === null ? null : record.getEmails();
  }

  private emailsOf(docenti: Docente[]): Email[] {
    return docenti.flatMap((docente) => (docente.id === null ? [] : [Email.of(docente.id)]));
  }

  private distinctEmails(emails: Email[]): Email[] {
    const values = emails.map((email) => ({ value: email.value }));
    return (
      this.projector.project(values, [{ type: 'distinctBy', keys: ['value'] }]).value as Array<{
        value: string;
      }>
    ).map((email) => Email.of(email.value));
  }
}
