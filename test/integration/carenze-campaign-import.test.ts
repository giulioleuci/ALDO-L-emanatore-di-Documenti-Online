import { ImportService } from '../../src/application/services/ImportService';
import { ConfigurazioneImport } from '../../src/domain/entities/ConfigurazioneImport';
import type { IConfigurazioneImportRepository } from '../../src/domain/repositories/IConfigurazioneImportRepository';

test.each([false, true])(
  'real campaign import preserves notifications on replay (chunked=%s)',
  (chunked) => {
    const rows: Record<string, unknown>[] = [];
    let source: Record<string, unknown>[] = [
      { STUDENTE: 'a', ID_RILEVAZIONE: 'NOV', PROGRESSIVO: 1, DATA: '2026-11-16', MAT: '4' },
      { STUDENTE: 'b', ID_RILEVAZIONE: 'NOV', PROGRESSIVO: 1, DATA: '2026-11-19', MAT: '5' }
    ];
    source.push(...Array.from({ length: 60 }, () => ({ ...source[0]! })));
    class CampaignSource extends SourceStrategy {
      protected _extractData(): Record<string, unknown>[] {
        return source;
      }
    }
    const engine = new ImportEngine(new LoggerService(), {}, {}, {
      tables: {
        CARENZE: {
          getAllRows: () => rows,
          insertRows: (batch: Record<string, unknown>[]) => rows.push(...batch),
          updateRowById: jest.fn(),
          deleteRowById: jest.fn()
        }
      },
      save: () => undefined
    } as unknown as DatabaseService);
    engine.registerCustomSource('CampaignSource', CampaignSource);
    // Keep the application recipe vocabulary, route its SheetById source to the controlled library strategy.
    engine.registerCustomSource('SheetById', CampaignSource);
    const conf = ConfigurazioneImport.fromData({
      ID: 'campaign',
      TARGET: 'CARENZE',
      ATTIVO: true,
      CONFIG: JSON.stringify({
        searchStrategy: 'FILE_SINGOLO',
        fileId: 'source',
        key: ['STUDENTE', 'ID_RILEVAZIONE'],
        conflictResolution: 'IGNORE',
        map: { ID_RILEVAZIONE: 'ID_RILEVAZIONE' }
      })
    });
    const service = new ImportService(engine, {
      findById: () => conf
    } as unknown as IConfigurazioneImportRepository);
    const run = () => {
      if (!chunked) return service.executeImport('campaign');
      const generator = service.executeImportChunked('campaign');
      let step = generator.next();
      while (!step.done) step = generator.next();
      return step.value;
    };
    expect(run().inseriti).toBe(2);
    rows[0]!['NOTIFICATO'] = '2026-11-20';
    source = source.map((row) => ({ ...row, ID_RILEVAZIONE: ' NOV ' }));
    source.push({ ...source[0]! });
    expect(run().inseriti).toBe(0);
    source = [{ STUDENTE: 'a', ID_RILEVAZIONE: 'FEB', PROGRESSIVO: 2, MAT: '3' }];
    expect(run().inseriti).toBe(1);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({ PROGRESSIVO: 1, NOTIFICATO: '2026-11-20' });
  }
);
