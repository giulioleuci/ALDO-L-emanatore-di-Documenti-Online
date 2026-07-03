import { ClasseId } from './ClasseId';
import { ValidationError } from '../errors/DomainError';

interface ArticolazioneJson {
  parent?: string | null;
  partner?: string | null;
  partners?: string | null;
}

/**
 * Parsed CLASSI.ARTICOLAZIONE (ref 05 §2). Three shapes:
 * - parent class:   parent=null, partner=null, partners="1F-LSO,1F-LSS"
 * - partner class:  parent="1F", partner="1F-LSS", partners=null
 * - standard class: all null → fromJson returns null
 */
export class ArticolazioneConfig {
  private constructor(
    public readonly parent: ClasseId | null,
    public readonly partner: ClasseId | null,
    public readonly partners: ClasseId[]
  ) {}

  /** Parses the raw JSON cell; null/empty or an all-null object yields null (standard class). */
  static fromJson(raw: unknown): ArticolazioneConfig | null {
    if (typeof raw !== 'string' || raw.trim() === '') return null;
    const obj = JSON.parse(raw) as ArticolazioneJson;
    const parent = typeof obj.parent === 'string' && obj.parent.trim() !== '' ? ClasseId.of(obj.parent.trim()) : null;
    const partner = typeof obj.partner === 'string' && obj.partner.trim() !== '' ? ClasseId.of(obj.partner.trim()) : null;
    const partners = typeof obj.partners === 'string'
      ? obj.partners.split(',').map((s) => s.trim()).filter((s) => s.length > 0).map((s) => ClasseId.of(s))
      : [];
    if (parent === null && partner === null && partners.length === 0) return null;
    if (partners.length > 0 && partners.length !== 2) {
      throw new ValidationError(`ARTICOLAZIONE parent: 'partners' deve contenere esattamente due ClasseId, trovati ${partners.length}`);
    }
    return new ArticolazioneConfig(parent, partner, partners);
  }

  /** Parent class: carries the two partners CSV. */
  isParent(): boolean { return this.partners.length > 0; }

  /** Partner class: points to a parent. */
  isPartner(): boolean { return this.parent !== null; }
}
