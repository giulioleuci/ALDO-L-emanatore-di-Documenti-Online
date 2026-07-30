import { DocumentGenerationService } from '../../src/application/services/DocumentGenerationService';
import { VerbaleGeneratorStrategy } from '../../src/application/strategies/VerbaleGeneratorStrategy';
import { SheetMaterieConPermessiGeneratorStrategy } from '../../src/application/strategies/SheetMaterieConPermessiGeneratorStrategy';
import { ConfigurazioneDocumentoRepository } from '../../src/infrastructure/repositories/ConfigurazioneDocumentoRepository';
import { MateriaRepository } from '../../src/infrastructure/repositories/MateriaRepository';
import {
  composeContextBuilder,
  composeRisolutoreRuoli,
  composeEmailNotificationService
} from '../../src/config/ApplicationComposition';
import { ExpressionEngineFacade } from '../../src/infrastructure/facades/ExpressionEngineFacade';
import { recipe } from '../../src/application/context-engine/Recipe';
import { FakeDatabase } from '../fakes/FakeDatabase';
import { FakeDriveFacade } from '../fakes/FakeDriveFacade';
import { FakeTemplateEngine } from '../fakes/FakeTemplateEngine';
import { FakeGmailFacade } from '../fakes/FakeGmailFacade';
import { fixtureTables } from '../fixtures/tables';
import { ClasseId } from '../../src/domain/value-objects/ClasseId';
import { GestioneSupplenti } from '../../src/domain/value-objects/enums';
import { AldoTeachingAssignmentResolver } from '../../src/infrastructure/role-resolution/AldoTeachingAssignmentResolver';
import { COL_CONF_MAIL } from '../../src/config/schema';
import type { Row } from '../../src/infrastructure/db/Database';
import type { CduClasse } from '../../src/application/context-engine/Cdu';

// --- Scenario A: 2-hop VARIAZIONI_CATTEDRA override chain (rossi -> hopA -> hopB)
// on 5A/MATE. Verifies the final holder, not an intermediate hop, is what
// reaches doc-gen and email routing (ref design
// 2026-07-30-cattedra-chain-verification-design.md, consumer surface).

function chainTables(): Record<string, Row[]> {
  const tables = fixtureTables();
  tables.DOCENTI = [
    ...tables.DOCENTI!,
    {
      EMAIL: 'hopA@school.test',
      COGNOME: 'HOPA',
      NOME: 'UNO',
      GENERE: 'M',
      DIPART: 'SCIENTIFICO_DIP',
      ITP: false
    },
    {
      EMAIL: 'hopB@school.test',
      COGNOME: 'HOPB',
      NOME: 'DUE',
      GENERE: 'F',
      DIPART: 'SCIENTIFICO_DIP',
      ITP: false
    }
  ];
  tables.VARIAZIONI_CATTEDRA = [
    {
      TITOLARE: 'rossi@school.it',
      NUOVO_TITOLARE: 'hopA@school.test',
      DAL: '2026-01-01',
      CLASSI: '5A',
      MATERIE: 'MATE'
    },
    {
      TITOLARE: 'hopA@school.test',
      NUOVO_TITOLARE: 'hopB@school.test',
      DAL: '2026-02-01',
      CLASSI: '5A',
      MATERIE: 'MATE'
    }
  ];
  return tables;
}

const CHAIN_NOW = new Date('2026-03-01T09:00:00Z'); // past both DAL hops

test('doc-gen: 2-hop VARIAZIONI_CATTEDRA chain resolves the generated CDU to the final holder, not an intermediate hop', () => {
  const db = new FakeDatabase(chainTables());
  const drive = new FakeDriveFacade();
  const templates = new FakeTemplateEngine();
  const service = new DocumentGenerationService({
    db,
    drive,
    contextBuilder: composeContextBuilder(db),
    strategyRegistry: new Map([['VERBALE_CDC', new VerbaleGeneratorStrategy(templates)]]),
    templates,
    expressionEngine: new ExpressionEngineFacade(),
    configs: new ConfigurazioneDocumentoRepository(db),
    roleResolver: composeRisolutoreRuoli(db),
    now: CHAIN_NOW
  });
  const result = service.generateForClasse(ClasseId.of('5A'), 'CD1');
  expect(result.status).toBe('GENERATO');

  const rendered = templates.contextFor(result.fileId!) as { focus: { classe: CduClasse } };
  const mate = rendered.focus.classe.consiglioDiClasse.find((d) =>
    d.materie.some((m) => m.sigla === 'MATE')
  );
  expect(mate?.anagrafica.email).toBe('hopB@school.test');
  const allEmails = rendered.focus.classe.consiglioDiClasse.map((d) => d.anagrafica.email);
  expect(allEmails).not.toContain('rossi@school.it');
  expect(allEmails).not.toContain('hopA@school.test');
});

test('email routing: PER_DOCENTE targets and delivers to the 2-hop chain final holder, never the nominal or intermediate teacher', () => {
  const tables = chainTables();
  tables.CONF_MAIL = [
    ...tables.CONF_MAIL!,
    {
      ID: 'PER_DOCENTE_CHAIN',
      OGGETTO: 'Comunicazione {{focus.classe.anagrafica.nome}}',
      PROCESSO: 'PER_DOCENTE',
      BOX_CFG: '[{"TIPO_BOX":"testo_dinamico","CONTENUTO":"<p>Comunicazione.</p>"}]',
      TESTO: '<p>Gentile collega</p>',
      SUPPLENTI: 'SOLO_TITOLARI',
      NOREPLY: true,
      COLORE_HEADER: '',
      CONDIZIONE: null,
      POST_PROCESSO: null,
      [COL_CONF_MAIL.ALLEGATI]: '[]'
    }
  ];
  const db = new FakeDatabase(tables);
  const gmail = new FakeGmailFacade();
  const service = composeEmailNotificationService(
    db,
    gmail,
    new FakeTemplateEngine(),
    CHAIN_NOW,
    new FakeDriveFacade(),
    new AldoTeachingAssignmentResolver(db)
  );
  const result = service.sendPattern('PER_DOCENTE_CHAIN');
  expect(result.errors).toEqual([]);

  // rossi legitimately keeps receiving mail for MATE in 1F/1F-LSO/1F-LSS -- the
  // chain's VARIAZIONI_CATTEDRA rows are scoped to CLASSI=5A only. The
  // assertion that matters is on hopB's OWN message: it must not also list
  // rossi or hopA (the nominal/intermediate holders of that same 5A/MATE post).
  const hopBMessage = gmail.sent.find((s) => s.to.includes('hopB@school.test'));
  expect(hopBMessage).toBeDefined();
  expect(hopBMessage!.to).not.toContain('rossi@school.it');
  expect(hopBMessage!.to).not.toContain('hopA@school.test');
  expect(gmail.sent.some((s) => s.to.includes('hopA@school.test'))).toBe(false);
});

// --- Scenario B: restriction-by-omission SUPPLENZE (empty CLASSI, valued
// MATERIE) narrows to the anchor's own concrete (classe, materia) pairs only,
// leaving the anchor's other subjects/classes untouched.

function restrictionTables(): Record<string, Row[]> {
  const tables = fixtureTables();
  tables.CLASSI = [
    ...tables.CLASSI!,
    {
      ID: '2C',
      ANNO: 2,
      INDIRIZZO: 'SCIENTIFICO',
      ARTICOLAZIONE: null,
      RUOLI: null,
      ATTIVA: true,
      COORD: 'rossi@school.it',
      MATE: 'bianchi@school.it'
    }
  ];
  tables.DOCENTI = [
    ...tables.DOCENTI!,
    {
      EMAIL: 'supplente-mate@school.test',
      COGNOME: 'SUPPL',
      NOME: 'MATE',
      GENERE: 'F',
      DIPART: 'SCIENTIFICO_DIP',
      ITP: false
    }
  ];
  tables.SUPPLENZE = [
    ...(tables.SUPPLENZE ?? []),
    {
      TITOLARE: 'bianchi@school.it',
      SUPPLENTE: 'supplente-mate@school.test',
      DAL: '2026-01-01',
      AL: '2026-12-31',
      CLASSI: '', // restriction-by-omission: bianchi's own nominal MATE cattedre only
      MATERIE: 'MATE'
    }
  ];
  return tables;
}

const RESTRICTION_NOW = new Date('2026-06-01T09:00:00Z');

test('CDU: restriction-by-omission SUPPLENZE (empty CLASSI, valued MATERIE) substitutes only the restricted (classe, materia) pairs', () => {
  const db = new FakeDatabase(restrictionTables());
  const contextBuilder = composeContextBuilder(db);

  const restricted = contextBuilder.build(
    { target: '2C', tipoTarget: 'classe', now: RESTRICTION_NOW },
    recipe('CLASSE_COMPLETA', { gestioneSupplenti: GestioneSupplenti.SOLO_SUPPLENTI })
  );
  const mate = restricted.focus.classe!.consiglioDiClasse.find((d) =>
    d.materie.some((m) => m.sigla === 'MATE')
  );
  expect(mate?.anagrafica.email).toBe('supplente-mate@school.test');

  // bianchi also nominally holds FISI in 5A; MATERIE=MATE-scoped restriction
  // must not touch it (untouched control).
  const untouched = contextBuilder.build(
    { target: '5A', tipoTarget: 'classe', now: RESTRICTION_NOW },
    recipe('CLASSE_COMPLETA', { gestioneSupplenti: GestioneSupplenti.SOLO_SUPPLENTI })
  );
  const fisi = untouched.focus.classe!.consiglioDiClasse.find((d) =>
    d.materie.some((m) => m.sigla === 'FISI')
  );
  expect(fisi?.anagrafica.email).toBe('bianchi@school.it');
});

// --- Scenario C: ACL/permission application for a .SPECIFICA-targeted
// VARIAZIONI_CATTEDRA row on an INTERPRETAZIONE.CHITARRA-style column (ref
// MAT_NON_STANDARD.md §2.C/§3, sub-project 3/4).

function specificaTables(): Record<string, Row[]> {
  const tables = fixtureTables();
  tables.MATERIE = [
    ...tables.MATERIE!,
    { ID: 'INTERPRET', NOME: 'Interpretazione', SINTESI: 'Interpretazione', ESAME_CFG: null },
    {
      ID: 'INTERPRET.CHITARRA',
      NOME: 'Interpretazione (Chitarra)',
      SINTESI: 'Chitarra',
      ESAME_CFG: null
    }
  ];
  tables.CLASSI = [
    ...tables.CLASSI!,
    {
      ID: '3D',
      ANNO: 3,
      INDIRIZZO: 'SCIENTIFICO',
      ARTICOLAZIONE: null,
      RUOLI: null,
      ATTIVA: true,
      COORD: 'rossi@school.it',
      'INTERPRET.CHITARRA': 'bianchi@school.it'
    }
  ];
  tables.DOCENTI = [
    ...tables.DOCENTI!,
    {
      EMAIL: 'guitar-new@school.test',
      COGNOME: 'GUITAR',
      NOME: 'NEW',
      GENERE: 'M',
      DIPART: 'SCIENTIFICO_DIP',
      ITP: false
    }
  ];
  tables.VARIAZIONI_CATTEDRA = [
    {
      TITOLARE: 'bianchi@school.it',
      NUOVO_TITOLARE: 'guitar-new@school.test',
      DAL: '2026-01-01',
      CLASSI: '3D',
      MATERIE: 'INTERPRET.CHITARRA'
    }
  ];
  return tables;
}

const SPECIFICA_NOW = new Date('2026-02-01T09:00:00Z');

test('sheet ACL: a .SPECIFICA-targeted VARIAZIONI_CATTEDRA row reroutes the INTERPRET column editor', () => {
  const db = new FakeDatabase(specificaTables());
  const contextBuilder = composeContextBuilder(db);
  const roles = composeRisolutoreRuoli(db);
  const cdu = contextBuilder.build(
    { target: '3D', tipoTarget: 'classe', now: SPECIFICA_NOW },
    recipe('CLASSE_COMPLETA')
  );

  const sheets = {
    protectCalls: [] as SpreadsheetProtectRequest[],
    getSheetInfo(): SpreadsheetSheetInfo[] {
      return [
        { name: 'Sheet1', sheetId: 0, index: 0, hidden: false, gridProperties: { rowCount: 10, columnCount: 10 } }
      ];
    },
    protectRanges(
      _spreadsheetId: string,
      requests: SpreadsheetProtectRequest | SpreadsheetProtectRequest[]
    ): SpreadsheetProtectResult {
      const all = Array.isArray(requests) ? requests : [requests];
      this.protectCalls.push(...all);
      return { spreadsheetId: 'sheet', protectedCount: all.length, protectedRangeIds: all.map((_, i) => i) };
    }
  };
  new SheetMaterieConPermessiGeneratorStrategy(
    sheets as unknown as SpreadsheetService,
    new MateriaRepository(db),
    new FakeTemplateEngine(),
    roles
  ).render(
    'sheet',
    cdu,
    (() => {
      const configs = new ConfigurazioneDocumentoRepository(db);
      return configs.findAll().find((c) => c.id === 'CD1')!;
    })()
  );

  const editors = sheets.protectCalls.flatMap((request) => request.editors?.users ?? []);
  expect(editors).toContain('guitar-new@school.test');
  expect(editors).not.toContain('bianchi@school.it');
});
