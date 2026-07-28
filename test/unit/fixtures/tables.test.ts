import { fixtureTables } from '../../fixtures/tables';

test('fixture tables expose one personalized-plan configuration with subtype selected by focus.piano', () => {
  const piani = fixtureTables().CONF_DOC.filter((row) => row['TIPO'] === 'PIANO_PERS');

  expect(piani).toHaveLength(1);
  expect(piani[0]!['ID']).toBe('PIANI_PERSONALIZZATI');
  expect(piani[0]!['PARAMETRI']).toBeNull();
  expect(JSON.parse(String(piani[0]!['MODELLI']))).toEqual([
    { condizione: '{{focus.piano.tipo}} == "PDP_DSA"', templateId: 'tmpl_pdp_dsa' },
    { condizione: '{{focus.piano.tipo}} == "PDP_BES"', templateId: 'tmpl_pdp_bes' },
    {
      condizione: '{{focus.piano.tipo}} == "PDP_STRANIERI"',
      templateId: 'tmpl_pdp_stranieri'
    },
    { condizione: '{{focus.piano.tipo}} == "PEI"', templateId: 'tmpl_pei' },
    { condizione: '{{focus.piano.tipo}} == "PFP"', templateId: 'tmpl_pfp' }
  ]);
  expect(JSON.parse(String(piani[0]!['REGISTRA_DOC']))).toMatchObject({
    utenti: '{{focus.alunno.anagrafica.email}}'
  });
});
