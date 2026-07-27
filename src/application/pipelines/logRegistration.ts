import { PipelineError } from '../../domain/errors/DomainError';
import type { ITemplateEngine } from '../../infrastructure/facades/TemplateEngineFacade';

const KEYS = ['classi', 'utenti', 'materie'] as const;

export interface LogRegistrationMetadata {
  classi: string;
  utenti: string;
  materie: string;
}

export function resolveLogRegistration(
  raw: unknown,
  templates: ITemplateEngine,
  cdu: Record<string, unknown>,
  column: 'REGISTRA_DOC' | 'REGISTRA_FOLD'
): LogRegistrationMetadata {
  const empty: LogRegistrationMetadata = { classi: '', utenti: '', materie: '' };
  if (raw === null || raw === undefined || (typeof raw === 'string' && raw.trim() === '')) {
    return empty;
  }
  if (typeof raw !== 'string') {
    throw new PipelineError(`${column} malformato: deve contenere un oggetto JSON`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new PipelineError(`${column} malformato`);
  }
  if (parsed === null || Array.isArray(parsed) || typeof parsed !== 'object') {
    throw new PipelineError(`${column} malformato: deve essere un oggetto JSON`);
  }

  const config = parsed as Record<string, unknown>;
  for (const key of Object.keys(config)) {
    if (!KEYS.includes(key as (typeof KEYS)[number])) {
      throw new PipelineError(`${column} chiave non ammessa: ${key}`);
    }
  }

  const metadata = { ...empty };
  for (const key of KEYS) {
    const value = config[key];
    if (value === undefined) continue;
    if (typeof value !== 'string') {
      throw new PipelineError(`${column}.${key} deve essere una stringa`);
    }
    metadata[key] = normalizeCsv(templates.processString(value, cdu));
  }
  return metadata;
}

function normalizeCsv(value: string): string {
  return [...new Set(value.split(',').map((part) => part.trim()).filter(Boolean))].join(',');
}
