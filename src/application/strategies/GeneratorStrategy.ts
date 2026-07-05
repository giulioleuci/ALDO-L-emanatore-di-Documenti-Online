import type { Cdu } from '../context-engine/Cdu';
export interface GeneratorStrategy {
  render(fileId: string, cdu: Cdu): void;
}
