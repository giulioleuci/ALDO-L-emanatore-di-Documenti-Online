import type { Cdu } from '../context-engine/Cdu';
import type { IExpressionEngine } from '../../infrastructure/facades/ExpressionEngineFacade';
import { GestioneSupplenti } from '../../domain/value-objects/enums';
import { ConfigurationError } from '../../domain/errors/DomainError';
import type { IRoleResolver } from './documentSteps';

/** One CONF_DOC.PERMESSI ACL entry (10 §10). `condizione` (optional, evaluated
 * by GasExpressionEngineLib like CONDIZIONE/MODELLI) lets a single CONF_DOC
 * record grant a role only for some CDU states, e.g. excluding a role from a
 * PIANO_PERSONALIZZATO subtype without splitting the record. */
export interface AclEntry {
  ruolo: string;
  permesso: string;
  condizione?: string;
}

export interface PermessiConfig {
  file?: AclEntry[];
  folder?: AclEntry[];
  regolaSupplente?: { file?: string; folder?: string };
}

export interface AclRisolta {
  email: string;
  permesso: string;
}

export function parseRegola(raw: string | undefined): GestioneSupplenti {
  if (raw === undefined || raw === '') return GestioneSupplenti.SOLO_TITOLARI;
  switch (raw) {
    case 'SOLO_TITOLARI':
      return GestioneSupplenti.SOLO_TITOLARI;
    case 'SOLO_SUPPLENTI':
      return GestioneSupplenti.SOLO_SUPPLENTI;
    case 'ENTRAMBI':
      return GestioneSupplenti.ENTRAMBI;
    default:
      throw new ConfigurationError(`CONF_DOC.PERMESSI.regolaSupplente non valida: ${raw}`);
  }
}

/**
 * Resolves one CONF_DOC.PERMESSI section (`file` or `folder`) to concrete
 * {email, permesso} pairs over the CDU: skips entries whose `condizione`
 * evaluates false and routes supplenze per `regola`. Shared by the generation
 * step (ApplyPermissionsStep) and the RIALLINEA_PERMESSI_DA_CONF action so both
 * apply exactly the same ACL semantics.
 */
export function risolviAcl(
  acl: AclEntry[],
  cdu: Cdu,
  regola: GestioneSupplenti,
  roles: IRoleResolver,
  engine: IExpressionEngine
): AclRisolta[] {
  const out: AclRisolta[] = [];
  for (const { ruolo, permesso, condizione } of acl) {
    if (
      condizione !== undefined &&
      condizione !== 'true' &&
      !engine.evaluateBoolean(condizione, cdu as unknown as Record<string, unknown>)
    ) {
      continue;
    }
    for (const email of roles.risolvi(ruolo, cdu, { regolaSupplente: regola })) {
      out.push({ email: email.value, permesso });
    }
  }
  return out;
}
