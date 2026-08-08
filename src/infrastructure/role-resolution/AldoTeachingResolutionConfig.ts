import type { Classe } from '../../domain/entities/Classe';
import { MateriaId } from '../../domain/value-objects/MateriaId';
import { ClasseRepository } from '../repositories/ClasseRepository';
import { ANY, expandRowScope } from './RowScopeExpansion';
import {
  COL_CLASSI,
  COL_DOCENTI,
  COL_MATERIE,
  COL_SUPPLENZE,
  COL_VARIAZIONI_CATTEDRA,
  TABLE
} from '../../config/schema';

const ADAPTER_ID = '__ALDO_ASSIGNMENT_ID';
const ADAPTER_COLUMN = '__ALDO_SLOT';
const SLOT_KIND_COLUMN = '__ALDO_SLOT_KIND';
const SLOT_SPECIFICA_COLUMN = '__ALDO_SLOT_SPECIFICA';

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

// Row-scope expansion primitives (restriction-by-omission, .itp/.SPECIFICA
// per-entry slot targeting) live in RowScopeExpansion.ts, shared with
// SupplenzaRepository's overlap invariant.

function stringColumn(row: Record<string, unknown>, column: string): string {
  const value = row[column];
  return typeof value === 'string' ? value : '';
}

/** Expands every row's scope, materializing one synthetic row per resulting fragment (design §2-3). */
function expandRows(
  classi: ClasseRepository,
  rows: ReadonlyArray<Record<string, unknown>>,
  anchorColumn: string,
  classiColumn: string,
  materieColumn: string
): Array<Record<string, unknown>> {
  return rows.flatMap((row) => {
    const anchor = stringColumn(row, anchorColumn);
    const fragments = expandRowScope(
      classi,
      anchor,
      stringColumn(row, classiColumn),
      stringColumn(row, materieColumn)
    );
    return fragments.map((fragment) => ({
      ...row,
      [classiColumn]: fragment.classi,
      [materieColumn]: fragment.materie,
      [SLOT_KIND_COLUMN]: fragment.kind,
      [SLOT_SPECIFICA_COLUMN]: fragment.specifica
    }));
  });
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
      expandRows(
        this.classi,
        database.tables[TABLE.VARIAZIONI_CATTEDRA]!.getAllRows(),
        COL_VARIAZIONI_CATTEDRA.TITOLARE,
        COL_VARIAZIONI_CATTEDRA.CLASSI,
        COL_VARIAZIONI_CATTEDRA.MATERIE
      ),
      'VAR'
    );
    this.delegationRows = this.withAdapterIds(
      expandRows(
        this.classi,
        database.tables[TABLE.SUPPLENZE]!.getAllRows(),
        COL_SUPPLENZE.TITOLARE,
        COL_SUPPLENZE.CLASSI,
        COL_SUPPLENZE.MATERIE
      ),
      'SUP'
    );
  }

  create(classe: Classe, materia: MateriaId): ResolutionConfiguration {
    const resolutionClasses = this.resolutionClasses(classe);
    const mappedOverrides = new MappedOverrideSource({
      rows: this.overrideRows,
      mapping: {
        id: { from: ADAPTER_ID },
        previousActorId: { from: COL_VARIAZIONI_CATTEDRA.TITOLARE },
        nextActorId: { from: COL_VARIAZIONI_CATTEDRA.NUOVO_TITOLARE },
        effectiveFrom: { from: COL_VARIAZIONI_CATTEDRA.DAL },
        scope: {
          classe: { from: COL_VARIAZIONI_CATTEDRA.CLASSI, parse: 'csv' },
          materia: { from: COL_VARIAZIONI_CATTEDRA.MATERIE, parse: 'csv' },
          kind: { from: SLOT_KIND_COLUMN },
          specifica: { from: SLOT_SPECIFICA_COLUMN }
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
          materia: { from: COL_SUPPLENZE.MATERIE, parse: 'csv' },
          kind: { from: SLOT_KIND_COLUMN },
          specifica: { from: SLOT_SPECIFICA_COLUMN }
        }
      }
    });
    const targets: TargetResolution[] = [];
    for (const target of resolutionClasses) {
      const descriptors = this.classi
        .getTeachingSlots(target)
        .filter((descriptor) => descriptor.materia.equals(materia));
      for (const descriptor of descriptors) {
        const row: Record<string, unknown> = {
          [COL_CLASSI.ID]: target.classeId.value,
          [ADAPTER_COLUMN]: descriptor.actorEmails.join(',')
        };
        // One resolver+context per slot (not per materia): delegation matching
        // (unlike override matching) is only context-scoped, not per-candidate
        // slot-scoped, in RoleResolutionLib — this is what makes SUPPLENZE's
        // .itp/.SPECIFICA slot targeting (design §3) actually discriminate.
        const assignmentSource = new WideRowAssignmentSource({
          rows: [row],
          rowIdentityPath: COL_CLASSI.ID,
          actorSource: this.actorSource,
          columns: [
            {
              name: ADAPTER_COLUMN,
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
            }
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
            materia: materia.value,
            kind: descriptor.kind,
            specifica: descriptor.specifica ?? ANY
          }
        });
      }
    }

    return new ArticulatedResolutionConfiguration(targets);
  }

  getMaterie(): Array<{ materia: MateriaId; isReligioneAlt: boolean }> {
    const baseIds = new Map<string, boolean>();
    for (const row of this.database.tables[TABLE.MATERIE]!.getAllRows()) {
      const id = row[COL_MATERIE.ID];
      if (typeof id !== 'string' || id === '') continue;
      const dot = id.indexOf('.');
      const baseId = dot === -1 ? id : id.slice(0, dot);
      if (!baseIds.has(baseId)) baseIds.set(baseId, false);
      if (dot === -1 && row[COL_MATERIE.IS_RELIGIONE_ALT] === true) {
        baseIds.set(baseId, true);
      }
    }
    return Array.from(baseIds.entries()).map(([id, isReligioneAlt]) => ({
      materia: MateriaId.of(id),
      isReligioneAlt
    }));
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
