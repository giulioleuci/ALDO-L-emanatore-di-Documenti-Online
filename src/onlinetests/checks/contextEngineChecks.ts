import type { ServiceContainer } from '../../config/ServiceContainer';
import type { TestRunner } from '../OnlineTestReport';
import type { SampleDatabase } from '../SampleDatabaseBuilder';
import type { ContextBuilder } from '../../application/context-engine/ContextBuilder';
import { recipe } from '../../application/context-engine/Recipe';
import { ValidationError } from '../../domain/errors/DomainError';
import { CLASSE_BASE, ALUNNO_PARTNER_EMAIL } from '../SampleDatabaseBuilder';

/**
 * Registers context-engine CDU-assembly checks (design spec §2 step 2.3):
 * builds a real CDU via the `ContextBuilder` `buildAldoContainer` already
 * wired under `'contextBuilder'` (same instance `DocumentGenerationService`/
 * `EmailNotificationService` use — see `Bootstrap.ts`), for both a `classe`
 * focus and an `alunno` focus, and asserts a couple of `02_CDU_STRUTTURA.md`
 * access paths (§4.1/§4.2) resolve to the seeded values:
 * `focus.classe.anagrafica.nome` and `focus.alunno.anagrafica.email`.
 */
export function registerContextEngineChecks(runner: TestRunner, container: ServiceContainer, sample: SampleDatabase): void {
  const contextBuilder = container.get<ContextBuilder>('contextBuilder');

  runner.add('ContextEngine CDU: focus.classe.anagrafica.nome resolves to the seeded classe', sample.sampleSpreadsheetUrl, () => {
    const cdu = contextBuilder.build(
      { target: CLASSE_BASE, tipoTarget: 'classe', now: new Date() },
      recipe('CLASSE_COMPLETA')
    );
    const nome = cdu.focus.classe?.anagrafica.nome;
    if (nome !== CLASSE_BASE) {
      throw new ValidationError(`Atteso focus.classe.anagrafica.nome === ${CLASSE_BASE}, ricevuto ${String(nome)}`);
    }
  });

  runner.add('ContextEngine CDU: focus.alunno.anagrafica.email resolves to the seeded alunno', sample.sampleSpreadsheetUrl, () => {
    const cdu = contextBuilder.build(
      { target: ALUNNO_PARTNER_EMAIL, tipoTarget: 'alunno', now: new Date() },
      recipe('ALUNNO_COMPLETO')
    );
    const email = cdu.focus.alunno?.anagrafica.email;
    if (email !== ALUNNO_PARTNER_EMAIL) {
      throw new ValidationError(`Atteso focus.alunno.anagrafica.email === ${ALUNNO_PARTNER_EMAIL}, ricevuto ${String(email)}`);
    }
  });
}
