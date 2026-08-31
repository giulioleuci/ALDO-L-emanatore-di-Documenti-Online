import type { Cdu } from '../application/context-engine/Cdu';

type E2eStudentRepresentative = {
  nomeCompleto: string;
  email: string;
  active?: boolean;
};

/**
 * E2E-only template fixture enrichment. The canonical CDU intentionally exposes
 * representative identity fields only; Scenario 10 additionally needs a stable
 * boolean for its supported `filter:'active',true` list expression.
 */
class E2eActiveRepresentativesInterceptor implements LibContextInterceptor {
  intercept(name: string, data: unknown, context: unknown): unknown {
    if (name !== 'rappresentanti') return data;
    const representatives = (context as Cdu).focus.classe?.rappresentanti?.studenti.elenco;
    if (representatives === undefined) return data;

    for (const representative of representatives as unknown as E2eStudentRepresentative[]) {
      representative.active = true;
    }
    return data;
  }
}

export const e2eActiveRepresentativesInterceptor = new E2eActiveRepresentativesInterceptor();
