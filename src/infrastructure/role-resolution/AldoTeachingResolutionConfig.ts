import type { Classe } from '../../domain/entities/Classe';
import { MateriaId } from '../../domain/value-objects/MateriaId';
import { ClasseRepository } from '../repositories/ClasseRepository';
import {
  COL_CLASSI,
  COL_DOCENTI,
  COL_MATERIE,
  COL_SUPPLENZE,
  COL_VARIAZIONI_CATTEDRA,
  TABLE
} from '../../config/schema';

const ADAPTER_ID = '__ALDO_ASSIGNMENT_ID';

interface ResolutionConfiguration {
  resolve(asOfDate: Date, routingPolicy: RoutingPolicyValue | null): EffectiveAssignmentResult[];
}

interface TargetResolution {
  resolver: EffectiveAssignmentResolver;
  context: Record<string, unknown>;
}

class AldoActorSource extends ActorSource {
  private readonly actors: Map<string, Actor>;

  constructor(rows: ReadonlyArray<Record<string, unknown>>) {
    super();
    this.actors = new Map<string, Actor>();
    for (const row of rows) {
      const email = row[COL_DOCENTI.EMAIL];
      if (typeof email !== 'string' || email.trim() === '') continue;
      const rawCognome = row[COL_DOCENTI.COGNOME];
      const rawNome = row[COL_DOCENTI.NOME];
      const cognome = typeof rawCognome === 'string' ? rawCognome : '';
      const nome = typeof rawNome === 'string' ? rawNome : '';
      this.actors.set(
        email,
        new Actor(email, ActorType.PERSON, email, `${cognome} ${nome}`.trim(), { ...row })
      );
    }
  }

  override getActor(actorId: string): Actor | null {
    return this.actors.get(actorId) ?? null;
  }
}

class EffectiveResultSource extends EffectiveAssignmentSource {
  constructor(private readonly results: readonly EffectiveAssignmentResult[]) {
    super();
  }

  override getAssignments(context: Record<string, unknown>, asOfDate: Date): AssignmentCandidate[] {
    void context;
    void asOfDate;
    return this.results.map(
      (result, index) =>
        new AssignmentCandidate({
          id: `ALDO_EFFECTIVE:${index}:${result.slot.key}`,
          actorId: result.effectiveActor?.id ?? '',
          slot: result.slot,
          source: 'ALDO_EFFECTIVE',
          metadata: { result }
        })
    );
  }
}

class ArticulatedResolutionConfiguration implements ResolutionConfiguration {
  constructor(private readonly targets: readonly TargetResolution[]) {}

  resolve(asOfDate: Date, routingPolicy: RoutingPolicyValue | null): EffectiveAssignmentResult[] {
    const resolvedSources: EffectiveAssignmentSource[] = [];
    for (const target of this.targets) {
      resolvedSources.push(
        new EffectiveResultSource(
          target.resolver.resolve({
            context: target.context,
            asOfDate,
            routingPolicy
          })
        )
      );
    }
    const resolved = new CompositeAssignmentSource({
      sources: resolvedSources,
      identity: [
        'metadata.result.baseActor.id',
        'metadata.result.permanentActor.id',
        'actorId',
        'slot.dimensions.classe',
        'slot.dimensions.materia',
        'slot.dimensions.kind',
        'slot.dimensions.specifica'
      ],
      mergeMetadata: (left) => left
    }).getAssignments({}, asOfDate);
    return resolved.map((candidate) => candidate.metadata.result as EffectiveAssignmentResult);
  }
}

export class AldoTeachingResolutionConfig {
  private readonly classi: ClasseRepository;
  private readonly actorSource: ActorSource;
  private readonly overrideRows: Array<Record<string, unknown>>;
  private readonly delegationRows: Array<Record<string, unknown>>;

  constructor(private readonly database: RepositoryDatabase) {
    this.classi = new ClasseRepository(database);
    this.actorSource = new AldoActorSource(database.tables[TABLE.DOCENTI]!.getAllRows());
    this.overrideRows = this.withAdapterIds(
      database.tables[TABLE.VARIAZIONI_CATTEDRA]!.getAllRows(),
      'VAR'
    );
    this.delegationRows = this.withAdapterIds(
      database.tables[TABLE.SUPPLENZE]!.getAllRows(),
      'SUP'
    );
  }

  create(classe: Classe, materia: MateriaId): ResolutionConfiguration {
    const resolutionClasses = this.resolutionClasses(classe);
    const mappedOverrides = new MappedOverrideSource({
      rows: this.overrideRows,
      mapping: {
        id: { from: ADAPTER_ID },
        previousActorId: { from: COL_VARIAZIONI_CATTEDRA.VECCHIO_TITOLARE },
        nextActorId: { from: COL_VARIAZIONI_CATTEDRA.NUOVO_TITOLARE },
        effectiveFrom: { from: COL_VARIAZIONI_CATTEDRA.DATA_DECORRENZA },
        scope: {
          classe: { from: COL_VARIAZIONI_CATTEDRA.CLASSE_ID, parse: 'csv' },
          materia: { from: COL_VARIAZIONI_CATTEDRA.MATERIA_ID, parse: 'csv' }
        }
      }
    });
    const mappedDelegations = new MappedDelegationSource({
      rows: this.delegationRows,
      mapping: {
        id: { from: ADAPTER_ID },
        principalId: { from: COL_SUPPLENZE.TITOLARE },
        delegateId: { from: COL_SUPPLENZE.SUPPLENTE },
        validFrom: { from: COL_SUPPLENZE.DAL },
        validTo: { from: COL_SUPPLENZE.AL },
        scope: {
          classe: { from: COL_SUPPLENZE.CLASSI, parse: 'csv' },
          materia: { from: COL_SUPPLENZE.MATERIE, parse: 'csv' }
        }
      }
    });
    const targets: TargetResolution[] = [];
    for (const target of resolutionClasses) {
      const descriptors = this.classi
        .getTeachingSlots(target)
        .filter((descriptor) => descriptor.materia.equals(materia));
      const row: Record<string, unknown> = {
        [COL_CLASSI.ID]: target.classeId.value
      };
      const columns: Array<{
        name: string;
        slotDimensions: Record<string, ValueMapping>;
        contextDimensions: Record<string, ValueMapping>;
      }> = [];
      let slotIndex = 0;
      for (const descriptor of descriptors) {
        const adapterColumn = `__ALDO_SLOT_${slotIndex}`;
        slotIndex += 1;
        row[adapterColumn] = descriptor.actorEmails.join(',');
        columns.push({
          name: adapterColumn,
          slotDimensions: {
            classe: { from: COL_CLASSI.ID },
            materia: descriptor.materia.value,
            kind: descriptor.kind,
            specifica: descriptor.specifica
          },
          contextDimensions: {
            classe: { from: COL_CLASSI.ID },
            materia: descriptor.materia.value
          }
        });
      }
      const assignmentSource = new CompositeAssignmentSource({
        sources: [
          new WideRowAssignmentSource({
            rows: [row],
            rowIdentityPath: COL_CLASSI.ID,
            actorSource: this.actorSource,
            columns
          })
        ],
        identity: [
          'actorId',
          'slot.dimensions.classe',
          'slot.dimensions.materia',
          'slot.dimensions.kind',
          'slot.dimensions.specifica'
        ]
      });
      targets.push({
        resolver: new EffectiveAssignmentResolver({
          actorSource: this.actorSource,
          assignmentSource,
          overrideSource: mappedOverrides,
          delegationSource: mappedDelegations,
          policy: new ResolutionPolicy({ maxDelegationDepth: null })
        }),
        context: {
          classe: target.classeId.value,
          materia: materia.value
        }
      });
    }

    return new ArticulatedResolutionConfiguration(targets);
  }

  getMaterie(): Array<{ materia: MateriaId; isReligioneAlt: boolean }> {
    const materie: Array<{ materia: MateriaId; isReligioneAlt: boolean }> = [];
    for (const row of this.database.tables[TABLE.MATERIE]!.getAllRows()) {
      const id = row[COL_MATERIE.ID];
      if (typeof id === 'string' && id !== '') {
        materie.push({
          materia: MateriaId.of(id),
          isReligioneAlt: row[COL_MATERIE.IS_RELIGIONE_ALT] === true
        });
      }
    }
    return materie;
  }

  private resolutionClasses(classe: Classe): Classe[] {
    if (!this.classi.isArticolata(classe)) return [classe];
    const partners = this.classi.orderedPartners(classe);
    return partners.length >= 2 ? partners : [classe];
  }

  private withAdapterIds(
    rows: ReadonlyArray<Record<string, unknown>>,
    prefix: string
  ): Array<Record<string, unknown>> {
    return rows.map((row, index) => ({ ...row, [ADAPTER_ID]: `${prefix}:${index}` }));
  }
}
