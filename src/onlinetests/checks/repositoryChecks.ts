import type { ServiceContainer } from '../../config/ServiceContainer';
import type { TestRunner } from '../OnlineTestReport';
import type { SampleDatabase } from '../SampleDatabaseBuilder';
import { ClasseRepository } from '../../infrastructure/repositories/ClasseRepository';
import { AlunnoRepository } from '../../infrastructure/repositories/AlunnoRepository';
import { CattedraResolver } from '../../application/services/CattedraResolver';
import { MateriaId } from '../../domain/value-objects/MateriaId';
import { ValidationError } from '../../domain/errors/DomainError';
import {
  CLASSE_BASE,
  CLASSE_PARTNER,
  DOCENTE_1,
  DOCENTE_2,
  DOCENTE_3,
  MATERIA_1,
  ALUNNO_PARTNER_EMAIL
} from '../SampleDatabaseBuilder';

/**
 * Registers repository round-trip and role-resolution priority-chain checks
 * (design spec §2 step 2.1/2.2) against the sample database built by
 * {@link SampleDatabaseBuilder}. Reads through the same `container.get('db')`
 * seam `Bootstrap.ts` wires (ClasseRepository/AlunnoRepository/CattedraResolver
 * aren't registered container services themselves — only their consumers are —
 * so they're built here directly over the shared database, exactly like
 * `ContextEngineFactory.create`/`Bootstrap.ts` do for their own dependents).
 *
 * The 3-tier role-resolution priority chain (SUPPLENZE -> VARIAZIONI_CATTEDRA
 * -> CLASSI, ref 01 §4, CLAUDE.md) is exercised via `CattedraResolver`, not
 * `RisolutoreRuoliService`: `RisolutoreRuoliService`'s `DOCENTE_MATERIA` role
 * only reads the CLASSI nominal holder and layers SUPPLENZE routing on top —
 * it never consults VARIAZIONI_CATTEDRA (see `RisolutoreRuoliService.
 * docenteMateria`). `CattedraResolver.resolveTitolare` is the service that
 * actually implements all three tiers (see its class doc), so it is the
 * correct target for these three checks.
 */
export function registerRepositoryChecks(
  runner: TestRunner,
  container: ServiceContainer,
  sample: SampleDatabase
): void {
  const db = container.get<RepositoryDatabase>('db');
  const classi = new ClasseRepository(db);
  const alunni = new AlunnoRepository(db);
  const cattedre = new CattedraResolver(db);
  const materia = MateriaId.of(MATERIA_1);

  runner.add(
    'ClasseRepository round-trip: seeded classe nome/materie',
    sample.sampleSpreadsheetUrl,
    () => {
      const classe = classi.findById(CLASSE_BASE);
      if (classe === null) {
        throw new ValidationError(
          `Classe seed ${CLASSE_BASE} non trovata via ClasseRepository.findById`
        );
      }
      if (classe.nome !== CLASSE_BASE) {
        throw new ValidationError(`Atteso classe.nome === ${CLASSE_BASE}, ricevuto ${classe.nome}`);
      }
      const docentiMateria = classi.getDocentiPerMateria(classe, materia).map((d) => d.id);
      if (!docentiMateria.includes(DOCENTE_1)) {
        throw new ValidationError(
          `Attesa cattedra ${MATERIA_1} con titolare ${DOCENTE_1}, ricevuto [${docentiMateria.join(', ')}]`
        );
      }
    }
  );

  runner.add(
    'AlunnoRepository round-trip: articolata-partner-enrolled student',
    sample.sampleSpreadsheetUrl,
    () => {
      const alunno = alunni.findById(ALUNNO_PARTNER_EMAIL);
      if (alunno === null) {
        throw new ValidationError(
          `Alunno seed ${ALUNNO_PARTNER_EMAIL} non trovato via AlunnoRepository.findById`
        );
      }
      if (alunno.classe !== CLASSE_PARTNER) {
        throw new ValidationError(
          `Atteso alunno.classe === ${CLASSE_PARTNER} (articolata partner), ricevuto ${alunno.classe}`
        );
      }
    }
  );

  runner.add(
    'CattedraResolver priority chain — SUPPLENZE wins within its date window',
    sample.sampleSpreadsheetUrl,
    () => {
      const classe = classi.findById(CLASSE_BASE);
      if (classe === null) throw new ValidationError(`Classe seed ${CLASSE_BASE} non trovata`);
      // Inside SUPPLENZE.DAL..AL (2026-07-01..2026-07-10) and BEFORE
      // VARIAZIONI_CATTEDRA.DATA_DECORRENZA (2026-07-05): CattedraResolver applies
      // SUPPLENZE routing to whichever holder priority 2/3 already produced
      // (`applicaSupplenza(titolare, ...)` looks up SUPPLENZE by that titolare's
      // email — see CattedraResolver.applicaSupplenza) — since SUPPLENZE.TITOLARE
      // is DOCENTE_1 (the CLASSI nominal holder, not the not-yet-decorsa
      // VARIAZIONI_CATTEDRA holder), this date must stay before DATA_DECORRENZA so
      // priority 2/3 still yields DOCENTE_1 for priority 1 to find and redirect.
      const docente = cattedre.resolveTitolare(classe, materia, new Date('2026-07-03T00:00:00Z'));
      if (docente?.id !== DOCENTE_2) {
        throw new ValidationError(
          `Atteso il supplente SUPPLENZE ${DOCENTE_2}, ricevuto ${docente?.id ?? 'null'}`
        );
      }
    }
  );

  runner.add(
    'CattedraResolver priority chain — VARIAZIONI_CATTEDRA wins outside the SUPPLENZE window',
    sample.sampleSpreadsheetUrl,
    () => {
      const classe = classi.findById(CLASSE_BASE);
      if (classe === null) throw new ValidationError(`Classe seed ${CLASSE_BASE} non trovata`);
      // After SUPPLENZE.AL (2026-07-10) — SUPPLENZE no longer applies — and on/after
      // VARIAZIONI_CATTEDRA.DATA_DECORRENZA (2026-07-05), so priority 2 wins.
      const docente = cattedre.resolveTitolare(classe, materia, new Date('2026-07-15T00:00:00Z'));
      if (docente?.id !== DOCENTE_3) {
        throw new ValidationError(
          `Atteso il nuovo titolare VARIAZIONI_CATTEDRA ${DOCENTE_3}, ricevuto ${docente?.id ?? 'null'}`
        );
      }
    }
  );

  runner.add(
    'CattedraResolver priority chain — CLASSI nominal fallback before both windows',
    sample.sampleSpreadsheetUrl,
    () => {
      const classe = classi.findById(CLASSE_BASE);
      if (classe === null) throw new ValidationError(`Classe seed ${CLASSE_BASE} non trovata`);
      // Before SUPPLENZE.DAL (2026-07-01) and before VARIAZIONI_CATTEDRA.DATA_DECORRENZA
      // (2026-07-05) — neither source applies, so the CLASSI nominal holder (priority 3) wins.
      const docente = cattedre.resolveTitolare(classe, materia, new Date('2026-06-01T00:00:00Z'));
      if (docente?.id !== DOCENTE_1) {
        throw new ValidationError(
          `Atteso il titolare nominale CLASSI ${DOCENTE_1}, ricevuto ${docente?.id ?? 'null'}`
        );
      }
    }
  );
}
