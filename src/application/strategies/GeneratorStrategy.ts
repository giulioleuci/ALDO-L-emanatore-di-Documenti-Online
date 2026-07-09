import type { Cdu } from '../context-engine/Cdu';
import type { ConfigurazioneDocumento } from '../../domain/entities/ConfigurazioneDocumento';

export interface GeneratorStrategy {
  /** `config` is the active CONF_DOC row (10 §9) — strategies that need CONF_DOC.PARAMETRI read it here. */
  render(fileId: string, cdu: Cdu, config: ConfigurazioneDocumento): void;
}
