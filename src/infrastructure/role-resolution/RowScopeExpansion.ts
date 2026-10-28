import type {
  IClasseRepository,
  TeachingSlotDescriptor
} from '../../domain/repositories/IClasseRepository';

/** Sentinel meaning "unrestricted"/"unqualified" for a scope dimension (ref RoleResolutionLib AssignmentSlot.matches/matchesContextDimensions). */
export const ANY = '*';

interface MateriaSlotGroup {
  /** 'ITP' | 'SPECIFICA' | ANY (bare, any slot). */
  kind: string;
  /** Literal specifica id, or ANY when not SPECIFICA-qualified. */
  specifica: string;
  /** Base materia ids sharing this (kind, specifica) qualifier within one row. */
  materie: string[];
}

interface ScopeFragment {
  classi: string;
  materie: string;
  kind: string;
  specifica: string;
}

/** One concrete (classe, materia, kind, specifica) teaching-slot tuple a row's scope resolves to. */
export interface ConcretePair {
  classeId: string;
  materia: string;
  kind: string;
  specifica: string;
}

function callSplitCsvList(raw: string): string[] {
  return globalThis.splitCsvList(raw);
}
function callGroupMateriaEntriesBySlot(materieRaw: string): MateriaSlotGroup[] {
  return globalThis.groupMateriaEntriesBySlot(materieRaw);
}
export {
  callSplitCsvList as splitCsvList,
  callGroupMateriaEntriesBySlot as groupMateriaEntriesBySlot
};

/**
 * (classe, materia) pairs the anchor teacher nominally holds — via
 * `ClasseRepository.getTeachingSlots`, never the resolver's own effective
 * output (avoids circularity). Optionally narrowed to a materia list and/or
 * slot kind/specifica; deduplicated across kind when no kind filter is given
 * (bare restriction — the resulting fragment stays slot-unqualified, matching
 * any kind of that materia in that classe).
 */
export function nominalPairsForAnchor(
  classi: IClasseRepository,
  anchorEmail: string,
  classiRaw: string,
  materiaFilter: string[] | null,
  kindFilter: { kind: string; specifica: string } | null
): Array<{ classeId: string; materia: string }> {
  const trimmed = classiRaw.trim();
  const anchorClasses = classi.findByDocenteAssegnato(anchorEmail);
  const explicitCsv = trimmed !== '' && trimmed !== ANY ? callSplitCsvList(classiRaw) : null;
  const candidateClasses =
    explicitCsv === null
      ? anchorClasses
      : anchorClasses.filter((classe) => explicitCsv.includes(classe.id ?? ''));
  const seen = new Set<string>();
  const pairs: Array<{ classeId: string; materia: string }> = [];
  for (const classe of candidateClasses) {
    const classeId = classe.id ?? '';
    for (const slot of classi.getTeachingSlots(classe)) {
      if (!slot.actorEmails.includes(anchorEmail)) continue;
      if (materiaFilter !== null && !materiaFilter.includes(slot.materia.value)) continue;
      if (kindFilter !== null && kindFilter.kind !== ANY) {
        if (slot.kind !== kindFilter.kind) continue;
        if (kindFilter.kind === 'SPECIFICA' && slot.specifica !== kindFilter.specifica) continue;
      }
      const key = `${classeId} ${slot.materia.value}`;
      if (seen.has(key)) continue;
      seen.add(key);
      pairs.push({ classeId, materia: slot.materia.value });
    }
  }
  return pairs;
}

/**
 * Expands one row's CLASSI/MATERIE into concrete scope fragments. CLASSI/MATERIE
 * both non-empty (CSV or `*`) pass through unchanged bar the slot split — the
 * library's own CSV/wildcard cartesian already handles that case correctly. An
 * empty axis (or MATERIE=`*` combined with an empty CLASSI, which degenerates
 * to the same result as empty/empty) is restricted to the anchor's actual
 * nominal cattedre.
 */
export function expandRowScope(
  classi: IClasseRepository,
  anchorEmail: string,
  classiRaw: string,
  materieRaw: string
): ScopeFragment[] {
  const classiEmpty = classiRaw.trim() === '';
  const materieTrimmed = materieRaw.trim();
  const degenerateToEmptyEmpty = materieTrimmed === ANY && classiEmpty;

  if (materieTrimmed === '' || degenerateToEmptyEmpty) {
    return nominalPairsForAnchor(classi, anchorEmail, classiRaw, null, null).map((pair) => ({
      classi: pair.classeId,
      materie: pair.materia,
      kind: ANY,
      specifica: ANY
    }));
  }

  const groups = callGroupMateriaEntriesBySlot(materieRaw);

  if (!classiEmpty) {
    return groups.map((group) => ({
      classi: classiRaw,
      materie: group.materie.join(','),
      kind: group.kind,
      specifica: group.specifica
    }));
  }

  return groups.flatMap((group) =>
    nominalPairsForAnchor(classi, anchorEmail, '', group.materie, group).map((pair) => ({
      classi: pair.classeId,
      materie: pair.materia,
      kind: group.kind,
      specifica: group.specifica
    }))
  );
}

/** Uses the resolver's omission and slot-qualifier rules when exporting dated events. */
export function rowAppliesToTeachingSlot(
  classi: IClasseRepository,
  classeId: string,
  slot: TeachingSlotDescriptor,
  row: Record<string, unknown>
): boolean {
  return expandRowScope(
    classi,
    typeof row.TITOLARE === 'string' ? row.TITOLARE : '',
    typeof row.CLASSI === 'string' ? row.CLASSI : '',
    typeof row.MATERIE === 'string' ? row.MATERIE : ''
  ).some(
    (scope) =>
      callSplitCsvList(scope.classi).some((id) => id === ANY || id === classeId) &&
      callSplitCsvList(scope.materie).some((id) => id === ANY || id === slot.materia.value) &&
      callSlotCompatible(scope, { kind: slot.kind, specifica: slot.specifica ?? ANY })
  );
}

/**
 * Fully expands one row's CLASSI/MATERIE (whatever their shape — empty, CSV, or
 * `*`) into concrete `(classe, materia, kind, specifica)` tuples, always
 * resolved against the anchor's actual nominal cattedre — the shape overlap
 * detection needs (ref design 2026-07-30-cattedra-chain-verification §5): a
 * restriction-by-omission row and an explicit-CSV row for the same anchor
 * expand to directly comparable pairs even though their raw CLASSI/MATERIE
 * text never intersects.
 */
export function expandRowToPairs(
  classi: IClasseRepository,
  anchorEmail: string,
  classiRaw: string,
  materieRaw: string
): ConcretePair[] {
  const materieTrimmed = materieRaw.trim();
  const groups: MateriaSlotGroup[] =
    materieTrimmed === '' || materieTrimmed === ANY
      ? [{ kind: ANY, specifica: ANY, materie: [] }]
      : callGroupMateriaEntriesBySlot(materieRaw);

  return groups.flatMap((group) =>
    nominalPairsForAnchor(
      classi,
      anchorEmail,
      classiRaw,
      group.materie.length > 0 ? group.materie : null,
      { kind: group.kind, specifica: group.specifica }
    ).map((pair) => ({
      classeId: pair.classeId,
      materia: pair.materia,
      kind: group.kind,
      specifica: group.specifica
    }))
  );
}

function callSlotCompatible(
  a: { kind: string; specifica: string },
  b: { kind: string; specifica: string }
): boolean {
  return globalThis.slotCompatible(a, b);
}
function callPairsOverlap(a: readonly ConcretePair[], b: readonly ConcretePair[]): boolean {
  return globalThis.pairsOverlap(a, b);
}
export { callSlotCompatible as slotCompatible, callPairsOverlap as pairsOverlap };
