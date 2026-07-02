import type { Cdu } from '../context/Cdu';
export interface GeneratorStrategy {
  render(fileId: string, cdu: Cdu): void;
}
