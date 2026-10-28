import type { GeneratorStrategy } from '../strategies/GeneratorStrategy';
import type { DocumentoGenericoGeneratorStrategy } from '../strategies/DocumentoGenericoGeneratorStrategy';
import type { FoglioGenericoGeneratorStrategy } from '../strategies/FoglioGenericoGeneratorStrategy';
import type { DocPersonalizzatoGeneratorStrategy } from '../strategies/DocPersonalizzatoGeneratorStrategy';
import type { DocumentoConTabelleImportateGeneratorStrategy } from '../strategies/DocumentoConTabelleImportateGeneratorStrategy';
import type { SheetMaterieGeneratorStrategy } from '../strategies/SheetMaterieGeneratorStrategy';
import type { SheetMaterieConPermessiGeneratorStrategy } from '../strategies/SheetMaterieConPermessiGeneratorStrategy';
import type { ConfigurazioneDocumento } from '../../domain/entities/ConfigurazioneDocumento';
import { FormatoOutput, GeneratoreAxis } from '../../domain/value-objects/enums';
import { PipelineError } from '../../domain/errors/DomainError';

/**
 * Replaces the old GENERATORE-keyed strategyRegistry Map (spec §5): the base
 * engine is chosen from FORMATO, PARAMETRI.tabelleImportate/aggiungiMaterie/
 * aggiungiMaterieConPermessi pick the wrapper (the last two are mutually
 * exclusive, enforced by ConfigurazioneDocumento's constructor validation —
 * Task 1 — so resolve() never has to arbitrate between them). PIANO_PERSONALIZZATO
 * is special-cased ahead of the generic GDOC branch to keep the
 * {{piano.campo}} alias merge working — see "Judgment Calls" in the plan doc.
 * docTabelle/sheetMaterie/sheetPermessi are optional because their real
 * dependencies (SpreadsheetService/DocumentService) are GAS-only and
 * Bootstrap.ts skips them off-GAS, mirroring the old registry's conditional
 * `.set(...)` calls.
 */
export class DocumentStrategyFactory {
  constructor(
    private readonly docGenerico: DocumentoGenericoGeneratorStrategy,
    private readonly foglioGenerico: FoglioGenericoGeneratorStrategy,
    private readonly docPersonalizzato: DocPersonalizzatoGeneratorStrategy,
    private readonly docTabelle?: DocumentoConTabelleImportateGeneratorStrategy,
    private readonly sheetMaterie?: SheetMaterieGeneratorStrategy,
    private readonly sheetPermessi?: SheetMaterieConPermessiGeneratorStrategy
  ) {}

  resolve(config: ConfigurazioneDocumento): GeneratorStrategy {
    const parametri = config.getParametri();
    if (config.formato === FormatoOutput.GSHEET) {
      if (parametri.aggiungiMaterieConPermessi) {
        if (this.sheetPermessi === undefined) {
          throw new PipelineError(
            'SHEET_CON_MATERIE_E_PERMESSI non disponibile in questo ambiente'
          );
        }
        return this.sheetPermessi;
      }
      if (parametri.aggiungiMaterie) {
        if (this.sheetMaterie === undefined) {
          throw new PipelineError('SHEET_CON_MATERIE non disponibile in questo ambiente');
        }
        return this.sheetMaterie;
      }
      return this.foglioGenerico;
    }
    if (config.generatore === GeneratoreAxis.PIANO_PERSONALIZZATO) return this.docPersonalizzato;
    if (parametri.tabelleImportate === true) {
      if (this.docTabelle === undefined) {
        throw new PipelineError(
          'DOCUMENTO_CON_TABELLE_IMPORTATE non disponibile in questo ambiente'
        );
      }
      return this.docTabelle;
    }
    return this.docGenerico;
  }
}
