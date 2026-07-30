import type { IClasseRepository } from '../../domain/repositories/IClasseRepository';

/** Sentinel meaning "unrestricted"/"unqualified" for a scope dimension (ref RoleResolutionLib AssignmentSlot.matches/matchesContextDimensions). */
export const ANY = '*';

export interface MateriaSlotGroup {
  /** 'ITP' | 'SPECIFICA' | ANY (bare, any slot). */
  kind: string;
  /** Literal specifica id, or ANY when not SPECIFICA-qualified. */
  specifica: string;
  /** Base materia ids sharing this (kind, specifica) qualifier within one row. */
  materie: string[];
}

export interface ScopeFragment {
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

export function splitCsvList(raw: string): string[] {
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Groups a MATERIE CSV's entries by slot qualifier, per-entry (a single CSV can
 * legitimately mix a bare materia with a slot-qualified one from a different
 * materia). `MATERIA` -> any slot; `MATERIA.itp` -> ITP; `MATERIA.<anything
 * else>` -> SPECIFICA.
 */
export function groupMateriaEntriesBySlot(materieRaw: string): MateriaSlotGroup[] {
  const groups = new Map<string, MateriaSlotGroup>();
  for (const entry of splitCsvList(materieRaw)) {
    const dot = entry.indexOf('.');
    const base = dot === -1 ? entry : entry.slice(0, dot);
    const suffix = dot === -1 ? null : entry.slice(dot + 1);
    const kind = suffix === null ? ANY : suffix.toUpperCase() === 'ITP' ? 'ITP' : 'SPECIFICA';
    const specifica = kind === 'SPECIFICA' && suffix !== null ? suffix : ANY;
    const key = `${kind} ${specifica}`;
    const existing = groups.get(key);
    if (existing) {
      existing.materie.push(base);
    } else {
      groups.set(key, { kind, specifica, materie: [base] });
    }
  }
  return [...groups.values()];
}

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
  const explicitCsv = trimmed !== '' && trimmed !== ANY ? splitCsvList(classiRaw) : null;
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

  const groups = groupMateriaEntriesBySlot(materieRaw);

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
      : groupMateriaEntriesBySlot(materieRaw);

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

/** Whether two slot qualifiers can refer to the same physical teaching post (ANY matches any kind/specifica). */
export function slotCompatible(
  a: { kind: string; specifica: string },
  b: { kind: string; specifica: string }
): boolean {
  if (a.kind === ANY || b.kind === ANY) return true;
  if (a.kind !== b.kind) return false;
  if (a.kind !== 'SPECIFICA') return true;
  return a.specifica === ANY || b.specifica === ANY || a.specifica === b.specifica;
}

/** True if any pair in `a` shares a (classe, materia) with a slot-compatible pair in `b`. */
export function pairsOverlap(a: readonly ConcretePair[], b: readonly ConcretePair[]): boolean {
  for (const pa of a) {
    for (const pb of b) {
      if (pa.classeId === pb.classeId && pa.materia === pb.materia && slotCompatible(pa, pb)) {
        return true;
      }
    }
  }
  return false;
}
