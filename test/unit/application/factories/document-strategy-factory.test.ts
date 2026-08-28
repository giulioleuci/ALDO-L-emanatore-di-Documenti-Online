import { DocumentStrategyFactory } from '../../../../src/application/factories/DocumentStrategyFactory';
import { DocumentoGenericoGeneratorStrategy } from '../../../../src/application/strategies/DocumentoGenericoGeneratorStrategy';
import { FoglioGenericoGeneratorStrategy } from '../../../../src/application/strategies/FoglioGenericoGeneratorStrategy';
import { DocPersonalizzatoGeneratorStrategy } from '../../../../src/application/strategies/DocPersonalizzatoGeneratorStrategy';
import { DocumentoConTabelleImportateGeneratorStrategy } from '../../../../src/application/strategies/DocumentoConTabelleImportateGeneratorStrategy';
import { SheetMaterieGeneratorStrategy } from '../../../../src/application/strategies/SheetMaterieGeneratorStrategy';
import { SheetMaterieConPermessiGeneratorStrategy } from '../../../../src/application/strategies/SheetMaterieConPermessiGeneratorStrategy';
import { COL_CONF_DOC } from '../../../../src/config/schema';
import { confDocFixture as config } from '../../../fixtures/confDoc';

describe('DocumentStrategyFactory', () => {
  const docGenerico = {} as DocumentoGenericoGeneratorStrategy;
  const foglioGenerico = {} as FoglioGenericoGeneratorStrategy;
  const docPersonalizzato = {} as DocPersonalizzatoGeneratorStrategy;
  const docTabelle = {} as DocumentoConTabelleImportateGeneratorStrategy;
  const sheetMaterie = {} as SheetMaterieGeneratorStrategy;
  const sheetPermessi = {} as SheetMaterieConPermessiGeneratorStrategy;

  it('GDOC + no tabelleImportate -> DocumentoGenerico', () => {
    const factory = new DocumentStrategyFactory(
      docGenerico,
      foglioGenerico,
      docPersonalizzato,
      docTabelle,
      sheetMaterie,
      sheetPermessi
    );
    expect(factory.resolve(config({}))).toBe(docGenerico);
  });

  it('GDOC + tabelleImportate=true -> DocumentoConTabelleImportate', () => {
    const factory = new DocumentStrategyFactory(
      docGenerico,
      foglioGenerico,
      docPersonalizzato,
      docTabelle,
      sheetMaterie,
      sheetPermessi
    );
    expect(
      factory.resolve(config({ [COL_CONF_DOC.PARAMETRI]: JSON.stringify({ tabelleImportate: true }) }))
    ).toBe(docTabelle);
  });

  it('PIANO_PERSONALIZZATO axis on GDOC always -> DocPersonalizzato (judgment call)', () => {
    const factory = new DocumentStrategyFactory(
      docGenerico,
      foglioGenerico,
      docPersonalizzato,
      docTabelle,
      sheetMaterie,
      sheetPermessi
    );
    expect(factory.resolve(config({ [COL_CONF_DOC.GENERATORE]: 'PIANO_PERSONALIZZATO' }))).toBe(
      docPersonalizzato
    );
  });

  it('GSHEET + no flags -> FoglioGenerico', () => {
    const factory = new DocumentStrategyFactory(
      docGenerico,
      foglioGenerico,
      docPersonalizzato,
      docTabelle,
      sheetMaterie,
      sheetPermessi
    );
    expect(factory.resolve(config({ [COL_CONF_DOC.FORMATO]: 'GSHEET' }))).toBe(foglioGenerico);
  });

  it('GSHEET + aggiungiMaterie=true -> SheetMaterie (no ACL)', () => {
    const factory = new DocumentStrategyFactory(
      docGenerico,
      foglioGenerico,
      docPersonalizzato,
      docTabelle,
      sheetMaterie,
      sheetPermessi
    );
    expect(
      factory.resolve(
        config({
          [COL_CONF_DOC.FORMATO]: 'GSHEET',
          [COL_CONF_DOC.PARAMETRI]: JSON.stringify({ aggiungiMaterie: true })
        })
      )
    ).toBe(sheetMaterie);
  });

  it('GSHEET + aggiungiMaterieConPermessi=true -> SheetMaterieConPermessi', () => {
    const factory = new DocumentStrategyFactory(
      docGenerico,
      foglioGenerico,
      docPersonalizzato,
      docTabelle,
      sheetMaterie,
      sheetPermessi
    );
    expect(
      factory.resolve(
        config({
          [COL_CONF_DOC.FORMATO]: 'GSHEET',
          [COL_CONF_DOC.PARAMETRI]: JSON.stringify({ aggiungiMaterieConPermessi: true })
        })
      )
    ).toBe(sheetPermessi);
  });

  it('throws when the required optional strategy was never wired (off-GAS)', () => {
    const factory = new DocumentStrategyFactory(docGenerico, foglioGenerico, docPersonalizzato);
    expect(() =>
      factory.resolve(config({ [COL_CONF_DOC.PARAMETRI]: JSON.stringify({ tabelleImportate: true }) }))
    ).toThrow('DOCUMENTO_CON_TABELLE_IMPORTATE');
    expect(() => factory.resolve(config({ [COL_CONF_DOC.FORMATO]: 'GSHEET' }))).not.toThrow();
    expect(() =>
      factory.resolve(
        config({
          [COL_CONF_DOC.FORMATO]: 'GSHEET',
          [COL_CONF_DOC.PARAMETRI]: JSON.stringify({ aggiungiMaterie: true })
        })
      )
    ).toThrow('SHEET_CON_MATERIE');
  });
});
