# Report allineamento AS 2526 per ALDO

Generato da `convert_to_ally.py` — vedi spec `docs/superpowers/specs/2026-08-24-database-ally-alignment-design.md`.

## Modifiche

### classi.terminale — 10 modifiche

| Foglio | Riga | Colonna | Vecchio | Nuovo |
| --- | --- | --- | --- | --- |
| CLASSI | 5ALC | TERMINALE | `` | `True` |
| CLASSI | 5ALS | TERMINALE | `` | `True` |
| CLASSI | 5BLC | TERMINALE | `` | `True` |
| CLASSI | 5BLS | TERMINALE | `` | `True` |
| CLASSI | 5C | TERMINALE | `` | `True` |
| CLASSI | 5D | TERMINALE | `` | `True` |
| CLASSI | 5E | TERMINALE | `` | `True` |
| CLASSI | 5F | TERMINALE | `` | `True` |
| CLASSI | 5G | TERMINALE | `` | `True` |
| CLASSI | 5H | TERMINALE | `` | `True` |

### confdoc.condizione-doc15maggio — 1 modifiche

| Foglio | Riga | Colonna | Vecchio | Nuovo |
| --- | --- | --- | --- | --- |
| CONF_DOC | DOC15MAGGIO | MODELLI | `[{"condizione": "{{classe.indirizzoSigla}} == 'LC'", "templateId": "1myoOk36XkP4K3ujRVugVDbdHk-JqSeSv30F8sxy5ZQk"}, {"templateId": "17GXcvRa1Xlxdf0CYxLbwU9dHZZcEWHtekBS5gGv07L0"}]` | `[{"condizione": "{{focus.classe.anagrafica.indirizzo.sigla}} == 'LC'", "templateId": "1myoOk36XkP4K3ujRVugVDbdHk-JqSeSv30F8sxy5ZQk"}, {"templateId": "17GXcvRa1Xlxdf0CYxLbwU9dHZZcEWHtekBS5gGv07L0"}]` |

### confdoc.generatore — 5 modifiche

| Foglio | Riga | Colonna | Vecchio | Nuovo |
| --- | --- | --- | --- | --- |
| CONF_DOC | CONDOTTA | GENERATORE | `` | `SHEET_CON_MATERIE_E_PERMESSI` |
| CONF_DOC | COMPETENZE | GENERATORE | `` | `SHEET_CON_MATERIE_E_PERMESSI` |
| CONF_DOC | CARENZE_SEGNALATORE_NOVEMBRE | GENERATORE | `` | `SHEET_CON_MATERIE_E_PERMESSI` |
| CONF_DOC | CARENZE_SEGNALATORE_FEBBRAIO | GENERATORE | `` | `SHEET_CON_MATERIE_E_PERMESSI` |
| CONF_DOC | DOC15MAGGIO | GENERATORE | `` | `DOCUMENTO_CON_TABELLE_IMPORTATE` |

### confdoc.permessi — 17 modifiche

| Foglio | Riga | Colonna | Vecchio | Nuovo |
| --- | --- | --- | --- | --- |
| CONF_DOC | PIANI_PERSONALIZZATI | PERMESSI | `{"file": [{"ruolo": "COORDINATORI", "permesso": "SCRITTURA"}, {"ruolo": "REF_BES", "permesso": "LETTURA"}, {"ruolo": "CDC_FILTER_ALUNNO", "permesso": "LETTURA"}], "cartella": [{"ruolo": "REF_BES", "permesso": "LETTURA"}], "regolaSupplente": {"file": "SOLO_SUPPLENTI", "cartella": "SOLO_SUPPLENTI"}}` | `{"file": [{"ruolo": "COORDINATORI", "permesso": "SCRITTURA"}, {"ruolo": "REF_BES", "permesso": "LETTURA"}, {"ruolo": "CDC_FILTER_ALUNNO", "permesso": "LETTURA"}], "regolaSupplente": {"file": "SOLO_SUPPLENTI", "folder": "SOLO_SUPPLENTI"}, "folder": [{"ruolo": "REF_BES", "permesso": "LETTURA"}]}` |
| CONF_DOC | PIANO_LAVORO | PERMESSI | `{"file": [{"ruolo": "COORDINATORI", "permesso": "scrittura"}, {"ruolo": "CDC", "permesso": "lettura"}]}` | `{"file": [{"ruolo": "COORDINATORI", "permesso": "SCRITTURA"}, {"ruolo": "CDC", "permesso": "LETTURA"}]}` |
| CONF_DOC | VERBALE_CDC_OTTOBRE | PERMESSI | `{"file": [{"ruolo": "COORDINATORI", "permesso": "scrittura"}]}` | `{"file": [{"ruolo": "COORDINATORI", "permesso": "SCRITTURA"}]}` |
| CONF_DOC | VERBALE_CDC_NOVEMBRE | PERMESSI | `{"file": [{"ruolo": "COORDINATORI", "permesso": "scrittura"}]}` | `{"file": [{"ruolo": "COORDINATORI", "permesso": "SCRITTURA"}]}` |
| CONF_DOC | VERBALE_CDC_FEBBRAIO | PERMESSI | `{"file": [{"ruolo": "COORDINATORI", "permesso": "scrittura"}]}` | `{"file": [{"ruolo": "COORDINATORI", "permesso": "SCRITTURA"}]}` |
| CONF_DOC | VERBALE_CDC_APRILE | PERMESSI | `{"file": [{"ruolo": "COORDINATORI", "permesso": "scrittura"}]}` | `{"file": [{"ruolo": "COORDINATORI", "permesso": "SCRITTURA"}]}` |
| CONF_DOC | VERBALE_CDC_MAGGIO | PERMESSI | `{"file": [{"ruolo": "COORDINATORI", "permesso": "scrittura"}]}` | `{"file": [{"ruolo": "COORDINATORI", "permesso": "SCRITTURA"}]}` |
| CONF_DOC | PCTO | PERMESSI | `{"file": [{"ruolo": "CDC", "permesso": "scrittura"}], "cartella": []}` | `{"file": [{"ruolo": "CDC", "permesso": "SCRITTURA"}], "folder": []}` |
| CONF_DOC | CONDOTTA | PERMESSI | `{"file": [{"ruolo": "COORDINATORI", "permesso": "scrittura"}]}` | `{"file": [{"ruolo": "COORDINATORI", "permesso": "SCRITTURA"}]}` |
| CONF_DOC | COMPETENZE | PERMESSI | `{"file": [{"ruolo": "COORDINATORI", "permesso": "scrittura"}]}` | `{"file": [{"ruolo": "COORDINATORI", "permesso": "SCRITTURA"}]}` |
| CONF_DOC | CARENZE_SEGNALATORE_NOVEMBRE | PERMESSI | `{"file": [{"ruolo": "COORDINATORI", "permesso": "scrittura"}]}` | `{"file": [{"ruolo": "COORDINATORI", "permesso": "SCRITTURA"}]}` |
| CONF_DOC | CARENZE_SEGNALATORE_FEBBRAIO | PERMESSI | `{"file": [{"ruolo": "COORDINATORI", "permesso": "scrittura"}]}` | `{"file": [{"ruolo": "COORDINATORI", "permesso": "SCRITTURA"}]}` |
| CONF_DOC | RELAZIONE_FINALE | PERMESSI | `{"file": [{"ruolo": "DOCENTE", "permesso": "scrittura"}]}` | `{"file": [{"ruolo": "DOCENTE", "permesso": "SCRITTURA"}]}` |
| CONF_DOC | PROGRAMMA | PERMESSI | `{"file": [{"ruolo": "DOCENTE", "permesso": "scrittura"}]}` | `{"file": [{"ruolo": "DOCENTE", "permesso": "SCRITTURA"}]}` |
| CONF_DOC | PROGRAMMA_RELAZIONI_QUINTE | PERMESSI | `{"file": [{"ruolo": "DOCENTE", "permesso": "scrittura"}, {"ruolo": "COORDINATORI", "permesso": "scrittura"}]}` | `{"file": [{"ruolo": "DOCENTE", "permesso": "SCRITTURA"}, {"ruolo": "COORDINATORI", "permesso": "SCRITTURA"}]}` |
| CONF_DOC | DOC15MAGGIO | PERMESSI | `{"file": [{"ruolo": "COORDINATORI", "permesso": "scrittura"}, {"ruolo": "CDC", "permesso": "lettura"}], "cartella": [{"ruolo": "COORDINATORI", "permesso": "scrittura"}, {"ruolo": "CDC", "permesso": "lettura"}]}` | `{"file": [{"ruolo": "COORDINATORI", "permesso": "SCRITTURA"}, {"ruolo": "CDC", "permesso": "LETTURA"}], "folder": [{"ruolo": "COORDINATORI", "permesso": "SCRITTURA"}, {"ruolo": "CDC", "permesso": "LETTURA"}]}` |
| CONF_DOC | SEGNALAZIONI_PEA_APRILE | PERMESSI | `{"file": [{"ruolo": "COORDINATORI", "permesso": "scrittura"}]}` | `{"file": [{"ruolo": "COORDINATORI", "permesso": "SCRITTURA"}]}` |

### confdoc.placeholder-file-name — 3 modifiche

| Foglio | Riga | Colonna | Vecchio | Nuovo |
| --- | --- | --- | --- | --- |
| CONF_DOC | RELAZIONE_FINALE | FILE_NAME | `Relazione - {{materia.sigla}} - {{focus.classe.anagrafica.nome}} - {{docente.nomeCompleto}} - {{focus.classe.anagrafica.annoScolastico}}` | `Relazione - {{focus.materia.sigla}} - {{focus.classe.anagrafica.nome}} - {{focus.docente.nomeCompleto}} - {{focus.classe.anagrafica.annoScolastico}}` |
| CONF_DOC | PROGRAMMA | FILE_NAME | `Programma - {{materia.sigla}} - {{focus.classe.anagrafica.nome}}  - {{focus.classe.anagrafica.annoScolastico}}` | `Programma - {{focus.materia.sigla}} - {{focus.classe.anagrafica.nome}}  - {{focus.classe.anagrafica.annoScolastico}}` |
| CONF_DOC | PROGRAMMA_RELAZIONI_QUINTE | FILE_NAME | `Programma e Relazione per Doc 15 maggio - {{focus.classe.anagrafica.nome}} - {{materia.sigla}} - {{focus.classe.anagrafica.annoScolastico}}` | `Programma e Relazione per Doc 15 maggio - {{focus.classe.anagrafica.nome}} - {{focus.materia.sigla}} - {{focus.classe.anagrafica.annoScolastico}}` |

### confdoc.tipo-per-cattedra — 3 modifiche

| Foglio | Riga | Colonna | Vecchio | Nuovo |
| --- | --- | --- | --- | --- |
| CONF_DOC | RELAZIONE_FINALE | TIPO | `RELAZIONE_FINALE` | `DOCUMENTO_DOCENTE_MATERIA` |
| CONF_DOC | PROGRAMMA | TIPO | `PROGRAMMA_SVOLTO` | `DOCUMENTO_DOCENTE_MATERIA` |
| CONF_DOC | PROGRAMMA_RELAZIONI_QUINTE | TIPO | `RELAZIONE_DOCENTE_DOC_15_MAGGIO` | `DOCUMENTO_DOCENTE_MATERIA` |

### dipart.capo — 12 modifiche

| Foglio | Riga | Colonna | Vecchio | Nuovo |
| --- | --- | --- | --- | --- |
| DIPART | LETT | CAPO | `docente1@scuola.edu` | `` |
| DIPART | LING | CAPO | `docente4@scuola.edu` | `` |
| DIPART | FIL | CAPO | `docente14@scuola.edu` | `` |
| DIPART | SCI | CAPO | `docente10@scuola.edu` | `` |
| DIPART | INFO | CAPO | `docente11@scuola.edu` | `` |
| DIPART | ARTE | CAPO | `docente23@scuola.edu` | `` |
| DIPART | SPORT | CAPO | `docente16@scuola.edu` | `` |
| DIPART | DIR | CAPO | `docente30@scuola.edu` | `` |
| DIPART | SOS | CAPO | `docente21@scuola.edu` | `` |
| DIPART | GEO | CAPO | `docente5@scuola.edu` | `` |
| DIPART | REL | CAPO | `docente19@scuola.edu` | `` |
| DIPART | CIV | CAPO | `docente30@scuola.edu` | `` |

### indirizzi.tipo — 4 modifiche

| Foglio | Riga | Colonna | Vecchio | Nuovo |
| --- | --- | --- | --- | --- |
| INDIRIZZI | LC | TIPO | `CLASSICO` | `LICEO` |
| INDIRIZZI | LSO | TIPO | `SCIENTIFICO` | `LICEO` |
| INDIRIZZI | LSA | TIPO | `SCIENTIFICO` | `LICEO` |
| INDIRIZZI | LSS | TIPO | `SCIENTIFICO` | `LICEO` |

### log.docs-idgen — 241 modifiche

| Foglio | Riga | Colonna | Vecchio | Nuovo |
| --- | --- | --- | --- | --- |
| LOG_DOCS | 1LA2zgnyOPkZP2Uakud1TDjBnVNxm4BWV36EcbZI3AXk | ID_GEN | `` | `PCTO` |
| LOG_DOCS | 1AM1PO2jjTKimYP0Nuxea-prB7AR3qiGD927ECW1MZ74 | ID_GEN | `` | `PCTO` |
| LOG_DOCS | 1whpeI03OX7zC3HNqxn2Ober3Y9ootPBSoCdyIQwTa4I | ID_GEN | `` | `PCTO` |
| LOG_DOCS | 12gqYyyrbwzSoCziHR8EB7kCj_FSocpdYNZ1z0FjP66Y | ID_GEN | `` | `PCTO` |
| LOG_DOCS | 19cQ5BzNWodxfpRyyGwTCtI-m3V3mycbxJhwzVOGYErc | ID_GEN | `` | `PCTO` |
| LOG_DOCS | 1-Ip0bsKWzEpGFtEJCnSN5FO1oG9SPtPL3Ciq2-jml3I | ID_GEN | `` | `PCTO` |
| LOG_DOCS | 14zlICk3Nu15S5BLMCxFwUHULHwIsv0J2iFNzIkEti2Q | ID_GEN | `` | `PIANO_LAVORO` |
| LOG_DOCS | 1RyJRohwUPpwV5JZIokVqJA8nrMukvnChVRhMhpIxFxw | ID_GEN | `` | `PIANO_LAVORO` |
| LOG_DOCS | 1pXtsWrTeHpNXHv0edBL-huu89nEmn2Fw0NglE_jN9fQ | ID_GEN | `` | `PIANO_LAVORO` |
| LOG_DOCS | 1PZuWpTwM1NGxPTNXIjqNF21pqiqy0URWNTscNQsaX7w | ID_GEN | `` | `PIANO_LAVORO` |
| LOG_DOCS | 1ExmoSYU-XkZHyKuSsfUNDhl4Pk21S521o0oR1E94ob4 | ID_GEN | `` | `PIANO_LAVORO` |
| LOG_DOCS | 1IPqQ5ddGQrM7grw_03GV1L1MPPcDKg0ds_aAwdVU8Ec | ID_GEN | `` | `PIANO_LAVORO` |
| LOG_DOCS | 1erF1ZP34UG3RpVtJ5WYtGtiwzG8Qx2DhnJPJuIqPwhM | ID_GEN | `` | `PIANO_LAVORO` |
| LOG_DOCS | 1H7Eik7EfHx0YpIPKeyar-6fO48YnL7BL8TAHwNQ49Js | ID_GEN | `` | `PIANO_LAVORO` |
| LOG_DOCS | 1utBiIqOT8oXPhZtDIdfrl6t9b3BHXU-ViaNaA6yqELY | ID_GEN | `` | `PIANO_LAVORO` |
| LOG_DOCS | 1nuiZidTTY2Y9zyRML3LGH4ooVnakuaL4581C9emmFCs | ID_GEN | `` | `PIANO_LAVORO` |
| LOG_DOCS | 1NtSP_ong3KPYG7-ZEZjRRqVgwu5QVj7iJzmcI5Z3dfw | ID_GEN | `` | `PIANO_LAVORO` |
| LOG_DOCS | 1AWmfowSiUj35uh2CpwloIAYU4r8kvuG5EerYuPHUOOM | ID_GEN | `` | `PIANO_LAVORO` |
| LOG_DOCS | 1_7aUr3H7Z0NDITbhoRdFL4CFUjRndo0_PLWCuh4tDVA | ID_GEN | `` | `PIANO_LAVORO` |
| LOG_DOCS | 1t8GrsDALEkJQe3v4OXShSaGZXpfZWYieYvpj2dqgjcE | ID_GEN | `` | `PIANO_LAVORO` |
| LOG_DOCS | 1lihnre1N6jJorBSwcMDxyYHzkNnkPis8TzLNO_pnOIs | ID_GEN | `` | `PIANO_LAVORO` |
| LOG_DOCS | 1bAUx636gUvUwagjD3LXARyS3UfTGvbl0hexyxxKwYLQ | ID_GEN | `` | `PIANO_LAVORO` |
| LOG_DOCS | 1UujFSM7RxyF5WZOvrBLYqvUD2snu0oi4Cjfn6RwdJSw | ID_GEN | `` | `PIANO_LAVORO` |
| LOG_DOCS | 1h51xbA-OevAe8mFUA2X51dvTxqvh506Nj5uxzp9V_xY | ID_GEN | `` | `PIANO_LAVORO` |
| LOG_DOCS | 1vU-uI1RuTfZMB7PuCye9AHvrY0MJvIEa1SPaQw8WVx0 | ID_GEN | `` | `PIANO_LAVORO` |
| LOG_DOCS | 18Sb-jDuamQ0aWK_V6K13tOSzgYkOKAf7jnpqEXdp718 | ID_GEN | `` | `PIANO_LAVORO` |
| LOG_DOCS | 1GW-2DXfhDm_ljmTw3Kz9e8Lcx4OW5m5eRgWnz2OjTlU | ID_GEN | `` | `PIANO_LAVORO` |
| LOG_DOCS | 1OVgcun5YJvryLSiCPiW2krDJoL5DMoA5Q2O9W_MmXKQ | ID_GEN | `` | `PIANO_LAVORO` |
| LOG_DOCS | 1zvVn_YLS0woSUfPKYD62dl2bHYyyISMMlWwq7GMz82c | ID_GEN | `` | `PIANO_LAVORO` |
| LOG_DOCS | 1xLTELpDPApbOjDhxtTuHj0_yw35DD_jI3vQo1OOE1iE | ID_GEN | `` | `PIANO_LAVORO` |
| LOG_DOCS | 1M7JLL4eoCN6kmZgzhPAGW2PGWCP3cORW2100ptA1PME | ID_GEN | `` | `PIANO_LAVORO` |
| LOG_DOCS | 1GPvIDOOGKXbHPNg0DHeeLf8lgKLwR7z1zrt7absrK_o | ID_GEN | `` | `PIANO_LAVORO` |
| LOG_DOCS | 1vrQSzAEG3fAwPbXwr73pvM9n1zMFEfP_xvkfm6LDcSQ | ID_GEN | `` | `PIANO_LAVORO` |
| LOG_DOCS | 1XlJTsSkxUrHTKcu8kUmhSIUe6HGZVy0ldzRtEzQPC50 | ID_GEN | `` | `PIANO_LAVORO` |
| LOG_DOCS | 1E06z7Xo6koA5U-cfv9ISBCDUn9BZr0HHeGGGc2iUoMg | ID_GEN | `` | `PIANO_LAVORO` |
| LOG_DOCS | 1foZdSLgtSeLTekGgviJuL5HirOc16bIac92WhVE8SwI | ID_GEN | `` | `PIANO_LAVORO` |
| LOG_DOCS | 1tQmG33a4a57kukrNiyzVoqo42Pi2iTXIT80OmWEcUTE | ID_GEN | `` | `PIANO_LAVORO` |
| LOG_DOCS | 1QANgWoSYm2821F9HTnQH9ODSLSD8K1JUg0kXN1mCOWg | ID_GEN | `` | `PIANO_LAVORO` |
| LOG_DOCS | 1Gb8f0Yn-2DfR5ypfqTWs6qg114xhHnnaB46AJPI3X-U | ID_GEN | `` | `PIANO_LAVORO` |
| LOG_DOCS | 1-oxxZoFfLZjCZhUBFZvs78p5ks_c5Igt7Qo1LDzzWb4 | ID_GEN | `` | `PIANO_LAVORO` |
| LOG_DOCS | 1V-HN4xySuJ3L8idAbfERZdR3un6JNrD6KtesX7oPs04 | ID_GEN | `` | `PIANO_LAVORO` |
| LOG_DOCS | 1kE_PRga4wG8kDKGS6bQZGIL_kfIfy5SXdV8s8IJ581c | ID_GEN | `` | `PIANO_LAVORO` |
| LOG_DOCS | 11fv3wKEZgrzrVsH6icGiiP9z9P5DGZUcew7iXe6lvVg | ID_GEN | `` | `PIANO_LAVORO` |
| LOG_DOCS | 1ISwSq4UIuSxx-LctZjYj2r2jk79NUewhNgtEGnNtjZ0 | ID_GEN | `` | `PIANO_LAVORO` |
| LOG_DOCS | 16ayu64PW0L1BUmGRdKRYb1ZFYsuhoWyI5G0vFg5_G0g | ID_GEN | `` | `PIANO_LAVORO` |
| LOG_DOCS | 1x_Oef8lPOODaPe5XZIXYJ3KyZwNVOqrMu8usZKyqrI4 | ID_GEN | `` | `PIANO_LAVORO` |
| LOG_DOCS | 1zx90ECCLG6EU06D-FUbHd0QOqwDFZrydsJl8AL8oiEA | ID_GEN | `` | `PIANO_LAVORO` |
| LOG_DOCS | 1sRPghIYxcKKaiIcnQDP-9qEPjuwSdsEDKl1PcVmnBPg | ID_GEN | `` | `PIANO_LAVORO` |
| LOG_DOCS | 1F_LAigXwyHSNN8habDD-QYviUb5qWY_cg7aMsjkP5Yw | ID_GEN | `` | `PIANO_LAVORO` |
| LOG_DOCS | 1A7HyTZ5SCj4PBh-I8cTPz5KiJSst2C6F2twY2MsZI9c | ID_GEN | `` | `PIANO_LAVORO` |
| LOG_DOCS | 1zAXS29BdAhoJMPY4peL3Gt6RlOEoC6vVK15Ed_nuuwY | ID_GEN | `` | `PIANO_LAVORO` |
| LOG_DOCS | 1hJwki7-87y3ZcaYxDtw4uFnDjrFRlVmvVw5rA3oMZEw | ID_GEN | `` | `PIANO_LAVORO` |
| LOG_DOCS | 1K1hQIHryNXo2bDpIjtOEnHYugProblbGqYFJ_gNkKHQ | ID_GEN | `` | `PIANO_LAVORO` |
| LOG_DOCS | 1gxlMCV4yE7stAaWUSGD3es8ke_hdWNgYsy4oTgenJNM | ID_GEN | `` | `PIANO_LAVORO` |
| LOG_DOCS | 1NbEbFStmL4pTJpMmKi-pqGX7yeFPDHPnJU1_88NVPiU | ID_GEN | `` | `PIANO_LAVORO` |
| LOG_DOCS | 1P7Ay7glZjvbuecyoilJ6Z3JrkTOzbhwNZY_J66d9HW8 | ID_GEN | `` | `VERBALE_CDC_OTTOBRE` |
| LOG_DOCS | 1MmSUKQUnQ3UXOD8qAlqJ-Px5N-DIX-e9a1QhM3bcWnw | ID_GEN | `` | `VERBALE_CDC_OTTOBRE` |
| LOG_DOCS | 1FHeVLv-b35AwnJM2nxkDTHg1sL76cbPWuMhJUTzYS0c | ID_GEN | `` | `VERBALE_CDC_OTTOBRE` |
| LOG_DOCS | 19APevR9RiqbRHxtvh3qJQLzL6Dwc5ZxnfpIX05koep4 | ID_GEN | `` | `VERBALE_CDC_OTTOBRE` |
| LOG_DOCS | 1o3imlW5KmLtZHJojsIxDS6fBD4fTP0_OsZ3bzTIKCVw | ID_GEN | `` | `VERBALE_CDC_OTTOBRE` |
| LOG_DOCS | 19apnw24UTWB3rn8hgV2EKtpgJg-VI_R4lT159_aBtXs | ID_GEN | `` | `VERBALE_CDC_OTTOBRE` |
| LOG_DOCS | 1xJ3iaW9MsnN9vvxlKpo9aSm99s-A_oF8tKFA8W8V2P4 | ID_GEN | `` | `VERBALE_CDC_OTTOBRE` |
| LOG_DOCS | 1SjcQUJ64L04iLXlqLjupVyTLz0UmdNLzrK3fqDxuYEw | ID_GEN | `` | `VERBALE_CDC_OTTOBRE` |
| LOG_DOCS | 1OHRg46dCBzcdVHISDE_Ni-aMgMvCD63SO8-PCTNlFOM | ID_GEN | `` | `VERBALE_CDC_OTTOBRE` |
| LOG_DOCS | 1ISXExBFR0mh_cO4iNNZAlIUXqVAsJe7wMpAQh4KJ7QY | ID_GEN | `` | `VERBALE_CDC_OTTOBRE` |
| LOG_DOCS | 14Gk4d0XSHFnKmP88ro6JMLe5ri50ajcAuHw3CHx-KZ4 | ID_GEN | `` | `VERBALE_CDC_OTTOBRE` |
| LOG_DOCS | 1216xvof3VePo4PxQ51-MQ1TQWEAOrRJGGBsJWqIHZv4 | ID_GEN | `` | `VERBALE_CDC_OTTOBRE` |
| LOG_DOCS | 1Vu7m1YkCKuIJyTiz2SQnsVkQICYPSGpVb9Ch5V0BgMc | ID_GEN | `` | `VERBALE_CDC_OTTOBRE` |
| LOG_DOCS | 1Hid9BKFwlfbHVupaJjIpPMPg1_DowzSDEbusbm3G3Ck | ID_GEN | `` | `VERBALE_CDC_OTTOBRE` |
| LOG_DOCS | 1jmGl-QwlJYNptIK7oRVEvbXSXLgg0S4yL9umXSJ42CU | ID_GEN | `` | `VERBALE_CDC_OTTOBRE` |
| LOG_DOCS | 1IZ7iL5m-kbsq4W5ncKgaU2odBtHh_eea98gQS1K0yKM | ID_GEN | `` | `VERBALE_CDC_OTTOBRE` |
| LOG_DOCS | 1UhpL89rjs7h7HaFE6_Fut3x5LmD2YVtbMsqYY1XZDU8 | ID_GEN | `` | `VERBALE_CDC_OTTOBRE` |
| LOG_DOCS | 19mZbva2n-wysS8AKVSjiStLQc_iLDalA30bvZwFmghI | ID_GEN | `` | `VERBALE_CDC_OTTOBRE` |
| LOG_DOCS | 1zvnogpEqg-WiuJr0rVgfC2CdUJFf_wcW0o2v_Ccy0So | ID_GEN | `` | `VERBALE_CDC_OTTOBRE` |
| LOG_DOCS | 1TlQVc6xThy0lQB6XdJCm6w3Htww58bWmF0bScdDXznQ | ID_GEN | `` | `VERBALE_CDC_OTTOBRE` |
| LOG_DOCS | 1EbvMH8ygNKKWfo-DenW95l-hw8TtRNvsOi6NyYxWt4s | ID_GEN | `` | `VERBALE_CDC_OTTOBRE` |
| LOG_DOCS | 1bs1HSRwmoljk33WJeL9vfDoZFjdSRkwSJXEYGAfthJA | ID_GEN | `` | `VERBALE_CDC_OTTOBRE` |
| LOG_DOCS | 103wHh1DWhovXXc_45dJs25gcrO5wIJmbkHFHsIRGj94 | ID_GEN | `` | `VERBALE_CDC_OTTOBRE` |
| LOG_DOCS | 12c25Le0C3gRUm5vAE61zSWsZKS29xJOqyAgpuoazlRQ | ID_GEN | `` | `VERBALE_CDC_OTTOBRE` |
| LOG_DOCS | 1Wy8Q_rgMO73IHkXoK2fdyBFsvI6D-lD3bo3ZXrH_iss | ID_GEN | `` | `VERBALE_CDC_OTTOBRE` |
| LOG_DOCS | 14BIjvDX1swjz8kuujI17mdZLu6qj1i8H81zP8N6Eh1s | ID_GEN | `` | `VERBALE_CDC_OTTOBRE` |
| LOG_DOCS | 1ySe5gQDa3rnZNChgJZJVaThxv91FpWN8c5CU7rdet5s | ID_GEN | `` | `VERBALE_CDC_OTTOBRE` |
| LOG_DOCS | 1RFtygv3b-wGrIudWsVYsH_eXus7lH_FDawQNGcefnp8 | ID_GEN | `` | `VERBALE_CDC_OTTOBRE` |
| LOG_DOCS | 1712mvP1nBDVYnwrpBlgrIv0O3JzyjzJ4LK0COcZN7dc | ID_GEN | `` | `VERBALE_CDC_OTTOBRE` |
| LOG_DOCS | 1zLQ3jtQOwLexzV8m4aUMO9O_-BrW1s0biJp0sOhjQDs | ID_GEN | `` | `VERBALE_CDC_OTTOBRE` |
| LOG_DOCS | 1a-CHMcYKCXzQIR_0GkUw_qkdeZuEIW8uFkvkMpT7G0M | ID_GEN | `` | `VERBALE_CDC_OTTOBRE` |
| LOG_DOCS | 1RCYiikMc_3dx-z6Kg__SMPzHbNFfDi-P8pXiPxHMmuQ | ID_GEN | `` | `VERBALE_CDC_OTTOBRE` |
| LOG_DOCS | 1w2qdCYsgZPSs30I9x7jpqtoOG5MWdA17rX59IMCwNHI | ID_GEN | `` | `VERBALE_CDC_OTTOBRE` |
| LOG_DOCS | 1ZjnLcLyrxL1nsp-nMznWEkrs1Viyawr7FYXB24BRvbM | ID_GEN | `` | `VERBALE_CDC_OTTOBRE` |
| LOG_DOCS | 1rcUOqgISzrBsIXOGmNFhETbkQIDYtwE3mFBHIj1_L_I | ID_GEN | `` | `VERBALE_CDC_OTTOBRE` |
| LOG_DOCS | 1JY5ndRCGzu5SImKj84G3dd5TaTIqLCLQv5chruaxSJc | ID_GEN | `` | `VERBALE_CDC_OTTOBRE` |
| LOG_DOCS | 1vJu-hL0UBOAYCvfb0ivmCqKslVJUCK_Kjt9C3OqE7EA | ID_GEN | `` | `VERBALE_CDC_OTTOBRE` |
| LOG_DOCS | 16Y4uY2k2Fkp211Vb4QfNIuJkBRerfxYHnGzX03GMgJo | ID_GEN | `` | `VERBALE_CDC_OTTOBRE` |
| LOG_DOCS | 1ebD6Pm694ovGsdnHpWKd5M0338QnE50MGdV6ffyY4Fg | ID_GEN | `` | `VERBALE_CDC_OTTOBRE` |
| LOG_DOCS | 1tjeLeoBLvi-USxwlscGW7NIelGCbTTRbEWyYOBmbdFk | ID_GEN | `` | `VERBALE_CDC_OTTOBRE` |
| LOG_DOCS | 1qKhTPF_t0hJpdIdPV_SvBOLmMgA8kxftBg05MPty-SU | ID_GEN | `` | `VERBALE_CDC_OTTOBRE` |
| LOG_DOCS | 1LY-M7rUIZdlhqqCf3B3jIF0NOm3NVZwR1FBZVzTDGOo | ID_GEN | `` | `VERBALE_CDC_OTTOBRE` |
| LOG_DOCS | 1SsBUUcUXjlPUcwS5jfHrOb5JywhVLx7lQExJza23NGs | ID_GEN | `` | `VERBALE_CDC_OTTOBRE` |
| LOG_DOCS | 1jHgUDaly3_Di7nlI3g9lk0SNYEUaGirR3EwUUuXe0j4 | ID_GEN | `` | `VERBALE_CDC_OTTOBRE` |
| LOG_DOCS | 1kS01xqoHuKZ9WX8pJJXUXr_7RdDRUbfVK5uP-o2vyDw | ID_GEN | `` | `VERBALE_CDC_OTTOBRE` |
| … | … | … | … (141 omesse) | 

### log.docs-sottotipo — 49 modifiche

| Foglio | Riga | Colonna | Vecchio | Nuovo |
| --- | --- | --- | --- | --- |
| LOG_DOCS | 1cXC_HCMO31vu68qqo28QKfMid_1PKqaHA_-T3OEHzLk | SOTTOTIPO | `PDP BES` | `PDP_BES` |
| LOG_DOCS | 1FNutkjfLoryE6pwRybyWWsqh0J9EAMw-2GBETzmChbo | SOTTOTIPO | `PDP DSA` | `PDP_DSA` |
| LOG_DOCS | 1KEv-3awnfLgzZnjC9Mrs-m0noOQiSYEG9nlIvSTtXHQ | SOTTOTIPO | `PDP DSA` | `PDP_DSA` |
| LOG_DOCS | 1hNnh3tpscYa_dJ13-Z6jbApp23-tKPeO_wj_zvfCvYo | SOTTOTIPO | `PDP DSA` | `PDP_DSA` |
| LOG_DOCS | 1l1bxjdRL0fzJKqBjb93GvqU7XNy2PwSLzmrs67cYZfo | SOTTOTIPO | `PDP DSA` | `PDP_DSA` |
| LOG_DOCS | 1JYbPKNRPLvMGjOf98WFBH-wjjF488iXVuDE_MJWjQXs | SOTTOTIPO | `PDP DSA` | `PDP_DSA` |
| LOG_DOCS | 1_WD8gEqp8i5XtJYzEv-EAg2AuF0aqHpK-SiItZ1LWiE | SOTTOTIPO | `PDP DSA` | `PDP_DSA` |
| LOG_DOCS | 1dE51uxIVSF4udqMwUdt_sdk0cZ3xQE4uTFTmI9NGIL0 | SOTTOTIPO | `PDP BES` | `PDP_BES` |
| LOG_DOCS | 1M-mxBnLPbquEqRUTqVwEUyMf6127yfXBMe6VXsyIEEo | SOTTOTIPO | `PDP DSA` | `PDP_DSA` |
| LOG_DOCS | 1YffDywORcf7a7IlQc7mGYD2f2DljOHnPmp9pR666rCA | SOTTOTIPO | `PDP DSA` | `PDP_DSA` |
| LOG_DOCS | 1QNSIWTpzS2eekCBe7wxnwiNI49OsUJ2QS4IA_0G_llA | SOTTOTIPO | `PDP DSA` | `PDP_DSA` |
| LOG_DOCS | 1mfmzL4EVpREilOhOHVk-MTdvc1WtrI6h36LeL7wtz8Q | SOTTOTIPO | `PDP DSA` | `PDP_DSA` |
| LOG_DOCS | 1hGz1FbFnNNzjZZVYGrPFTv4xzi3c-tPF7HKFRgufUTg | SOTTOTIPO | `PDP BES` | `PDP_BES` |
| LOG_DOCS | 18h6rahWL_H-4itxsPu7XpaOomi96E4MzGnVpuCIpWhw | SOTTOTIPO | `PDP DSA` | `PDP_DSA` |
| LOG_DOCS | 15okmGZUuHqutZGEKa5aWCyd-qBCVrf48yaQn-qtgLds | SOTTOTIPO | `PDP DSA` | `PDP_DSA` |
| LOG_DOCS | 1HpeRcI_8BvOWUTxvE-4lyQLaUfHdnPX1wSx3PPZcWL4 | SOTTOTIPO | `PDP DSA` | `PDP_DSA` |
| LOG_DOCS | 1ZoZ4a9RCGsXU8LxzJCppLKwEGxvbM84e2SX2gpQ4aqc | SOTTOTIPO | `PDP DSA` | `PDP_DSA` |
| LOG_DOCS | 1ixqap8IuhvGhdoo3uVkNLAPtEV0__N2ybIIMbWnjhT4 | SOTTOTIPO | `PDP DSA` | `PDP_DSA` |
| LOG_DOCS | 11IBoLBOXHCprZxSjZUUtJ3IfJSgeGQE7jk1l1z_Nsq0 | SOTTOTIPO | `PDP DSA` | `PDP_DSA` |
| LOG_DOCS | 1bxW-QMajBmmmRNTCHT-fNhfymeQdo_rWF5hMrCvsRZ0 | SOTTOTIPO | `PDP DSA` | `PDP_DSA` |
| LOG_DOCS | 14OL3EeTy5ddN1dfmbEOuyWsdVwEHicKCF_s11hJD72Y | SOTTOTIPO | `PDP DSA` | `PDP_DSA` |
| LOG_DOCS | 1kSx8Z3K5SlJiSdwYFB-A04XOxqskH-6sYnCdhNeZik8 | SOTTOTIPO | `PDP DSA` | `PDP_DSA` |
| LOG_DOCS | 1402UvnKrJ5EQGprxpz9SnFvaiFMyxFM5NW1TzA4hR74 | SOTTOTIPO | `PDP BES` | `PDP_BES` |
| LOG_DOCS | 1G2Q-J7Fiuz6RjM8JJ22qDOvJonCOBJiKTlMRU955-Xo | SOTTOTIPO | `PDP DSA` | `PDP_DSA` |
| LOG_DOCS | 1aA06B9BBNCeK0ug2TPHmx8aWKzRU-S0Ctb9MchMjI40 | SOTTOTIPO | `PDP DSA` | `PDP_DSA` |
| LOG_DOCS | 1fql4fiU-4cKPTaKhpwaEGQtNZppKHH4Dxd_QYm_Uykk | SOTTOTIPO | `PDP BES` | `PDP_BES` |
| LOG_DOCS | 1PoVncHH2Q8Df3E_oVH_IwqYPBdo2WtwTLMc6v9t8lR0 | SOTTOTIPO | `PDP STRANIERI` | `PDP_STRANIERI` |
| LOG_DOCS | 1V2rPbz4YVqvcyXuZ-n_bVMHgAbsKmdQkSo46VCdQrIU | SOTTOTIPO | `PDP STRANIERI` | `PDP_STRANIERI` |
| LOG_DOCS | 1sRvoAEw-XgSAisck6Tp-15SvbbKCSpT2N-72T_reQVQ | SOTTOTIPO | `PDP STRANIERI` | `PDP_STRANIERI` |
| LOG_DOCS | 1VDFx2idzR9eXPgdC33HVuC7nLcnYuc-rOgEX-BVgahE | SOTTOTIPO | `PDP BES` | `PDP_BES` |
| LOG_DOCS | 1iu75x_58u4xfkWwVm0BAKUmIa2uFzfPEXJz9AH2T3o8 | SOTTOTIPO | `PDP BES` | `PDP_BES` |
| LOG_DOCS | 1O3YIFxhFs-RW0SET0n9VBoph3z3-2MDWM-vGlZBHrcw | SOTTOTIPO | `PDP BES` | `PDP_BES` |
| LOG_DOCS | 1FuR4IZ0uy23jNi_pstPs0A2BceYabkMe-EwIcKPHSPI | SOTTOTIPO | `PDP BES` | `PDP_BES` |
| LOG_DOCS | 1jMf-ZaIiBPCBwRuD9yqlwDRFoFLeDXU1JnrHfyWuOBE | SOTTOTIPO | `PDP STRANIERI` | `PDP_STRANIERI` |
| LOG_DOCS | 1eGNTkw7KhNfzfbgrC_GGvVrQcbZoJzHxcyi2yaNV4ic | SOTTOTIPO | `PDP BES` | `PDP_BES` |
| LOG_DOCS | 1GT0SueWEZfIZp2iIHLUXLy6JY-Ycb05FxP1NsdC6OJ4 | SOTTOTIPO | `PDP BES` | `PDP_BES` |
| LOG_DOCS | 18anEoWhm6cZ-3mu_9fMautHC2XsGgtdDd39mEEpHV9g | SOTTOTIPO | `PDP BES` | `PDP_BES` |
| LOG_DOCS | 15gQjOw18-hFfsgfZvuEldIFtPPSHCjdOC9rlLpdlcXk | SOTTOTIPO | `PDP BES` | `PDP_BES` |
| LOG_DOCS | 1XbwXHN8J153pR7qHldzuL01qaINq3CJwL-TcUOqh58M | SOTTOTIPO | `PDP DSA` | `PDP_DSA` |
| LOG_DOCS | 1X5AV4_EC7ujh-zhTvuLXfDGjLNk2RY7ui-2R8rfFF-w | SOTTOTIPO | `PDP BES` | `PDP_BES` |
| LOG_DOCS | 1oOX9LTrnXe5SScR0o5-8xBjUCxCGh5dXMQ00Spin84E | SOTTOTIPO | `PDP BES` | `PDP_BES` |
| LOG_DOCS | 1tpHEy1v-WF4xGcPQJOSPOEfrG4OQnC9doHxt0GpvTSw | SOTTOTIPO | `PDP BES` | `PDP_BES` |
| LOG_DOCS | 1XYRrXcEIWJo9eN_haJEWtvWYP1-QNYX296iyatl_kAA | SOTTOTIPO | `PDP BES` | `PDP_BES` |
| LOG_DOCS | 1m0-DL5p4H2fqLWMNJjv8VKtCkln9DMoD5gq7MwIJW-M | SOTTOTIPO | `PDP BES` | `PDP_BES` |
| LOG_DOCS | 1YwZvLYGAyQ0joYIiw-Lanw86_MzJGBdjGg_MjY2htw4 | SOTTOTIPO | `PDP BES` | `PDP_BES` |
| LOG_DOCS | 1t_LOjMzIZplGIYkav7QymgxKqILD18uxbl_qLASHt3M | SOTTOTIPO | `PDP BES` | `PDP_BES` |
| LOG_DOCS | 1bRRu7TiTV75XV4EZ7baXuue_jTIFg5CU28_Qyn30pRk | SOTTOTIPO | `PDP BES` | `PDP_BES` |
| LOG_DOCS | 1iSFzsXa9HSL9ogSDvm_0vawSWhPryoFlvfB11klP8AA | SOTTOTIPO | `PDP BES` | `PDP_BES` |
| LOG_DOCS | 1kCGMRs87htydwzLE9ETlefxX-pC2VQpbBb4LqTVf6b0 | SOTTOTIPO | `PDP BES` | `PDP_BES` |

### log.fold-tipo — 158 modifiche

| Foglio | Riga | Colonna | Vecchio | Nuovo |
| --- | --- | --- | --- | --- |
| LOG_FOLD | 15Io775s6wMiCA9GjB9_ovy5w6eSPHFHo | TIPO | `DOCUMENTO_PERSONALIZZATO` | `PIANI_PERSONALIZZATI` |
| LOG_FOLD | 1hj4Uu84UGD7HFaFPJE1jtJ-PiJgYv0wf | TIPO | `VERBALE_CDC` | `VERBALE_CDC_OTTOBRE` |
| LOG_FOLD | 1LJxfINfLvvdOr-8p1vtbpVbZF1RxeWk5 | TIPO | `VERBALE_CDC` | `VERBALE_CDC_OTTOBRE` |
| LOG_FOLD | 1cVo4zDQw0b6Qo3oRWg4_nDN0dhJ2XwDN | TIPO | `VERBALE_CDC` | `VERBALE_CDC_OTTOBRE` |
| LOG_FOLD | 1zlkf4Au2_MTyy-H4-yVLsZVP4xoQKgEp | TIPO | `VERBALE_CDC` | `VERBALE_CDC_OTTOBRE` |
| LOG_FOLD | 1n1q7t8865wNlPLaBR4lu7Nn57Wug4n2E | TIPO | `VERBALE_CDC` | `VERBALE_CDC_OTTOBRE` |
| LOG_FOLD | 1PAWpUvsEn5xi0RVPmS7UHhdi-FNFH_Tl | TIPO | `VERBALE_CDC` | `VERBALE_CDC_OTTOBRE` |
| LOG_FOLD | 1ciWtJy3PDDfVQ44aeT9tDOmSDFpz0u6W | TIPO | `VERBALE_CDC` | `VERBALE_CDC_OTTOBRE` |
| LOG_FOLD | 1gCqC4aWhL61EAuY8n69H9yV0YaFaikBY | TIPO | `VERBALE_CDC` | `VERBALE_CDC_OTTOBRE` |
| LOG_FOLD | 1im1H69bGaXNL_3Zn4jyPd4JccOu6SDbN | TIPO | `VERBALE_CDC` | `VERBALE_CDC_OTTOBRE` |
| LOG_FOLD | 1u8wifX9d5qd66x5IfXG8q0wRxI0k2aqe | TIPO | `VERBALE_CDC` | `VERBALE_CDC_OTTOBRE` |
| LOG_FOLD | 1vDX0VrGjYwOylMI3ZgYLC41L_-KdWodx | TIPO | `VERBALE_CDC` | `VERBALE_CDC_OTTOBRE` |
| LOG_FOLD | 1_5YPRpXqOPHuNOYtzajB4Z5rtszO8NQd | TIPO | `VERBALE_CDC` | `VERBALE_CDC_OTTOBRE` |
| LOG_FOLD | 1Yc-BCqa626fylli_gXhJ0yIxpH09IuAE | TIPO | `VERBALE_CDC` | `VERBALE_CDC_OTTOBRE` |
| LOG_FOLD | 1Ga9kfRw-H7ouUCiUqGdXQo7yGjkBqDX0 | TIPO | `VERBALE_CDC` | `VERBALE_CDC_OTTOBRE` |
| LOG_FOLD | 1kxBg5sBY6nrDL3ARUXD1J_vDBHTZLX0Z | TIPO | `VERBALE_CDC` | `VERBALE_CDC_OTTOBRE` |
| LOG_FOLD | 11qcOYBt_Cg-0DWIP-O_m4JsmUWCUHezT | TIPO | `VERBALE_CDC` | `VERBALE_CDC_OTTOBRE` |
| LOG_FOLD | 1IrW0LJhZXJqzPD05L74GtjZRUVZx2aDS | TIPO | `VERBALE_CDC` | `VERBALE_CDC_OTTOBRE` |
| LOG_FOLD | 1GRsNWIck9jC0Q63O7fw1tlkgh48oR9d7 | TIPO | `VERBALE_CDC` | `VERBALE_CDC_OTTOBRE` |
| LOG_FOLD | 1sm15yuIV8QBoUYs8G8kGQts44tjB1pvd | TIPO | `VERBALE_CDC` | `VERBALE_CDC_OTTOBRE` |
| LOG_FOLD | 1_Ep3U1e_DRtOWd496ANjXjRxDM74B1Lk | TIPO | `VERBALE_CDC` | `VERBALE_CDC_OTTOBRE` |
| LOG_FOLD | 1xTX2_0O4o-gBkHpyIxbOQ3debT3JK2dj | TIPO | `VERBALE_CDC` | `VERBALE_CDC_OTTOBRE` |
| LOG_FOLD | 1CzxCkdfZJ-WHUFdGCLaw2lseF0vwm9Fe | TIPO | `VERBALE_CDC` | `VERBALE_CDC_OTTOBRE` |
| LOG_FOLD | 1AR3ZcYVKy1qpOeG-0mwv2bdv44z_X36i | TIPO | `VERBALE_CDC` | `VERBALE_CDC_OTTOBRE` |
| LOG_FOLD | 1whtK9TuqeGwDBoSok1QQdgC97e5dooG_ | TIPO | `VERBALE_CDC` | `VERBALE_CDC_OTTOBRE` |
| LOG_FOLD | 13OyfY72eIRrktwJZe1QnljZmCUNpK0eh | TIPO | `VERBALE_CDC` | `VERBALE_CDC_OTTOBRE` |
| LOG_FOLD | 1IoBVMhrYXMqDvmB80ra1k9AAVirhEEQD | TIPO | `VERBALE_CDC` | `VERBALE_CDC_OTTOBRE` |
| LOG_FOLD | 1nYXO3vNJ4dFk7etIRhlzNMTThR14Tf5v | TIPO | `VERBALE_CDC` | `VERBALE_CDC_OTTOBRE` |
| LOG_FOLD | 1qUXttkapgkOlQrkKmiaQ_QQBUhK_7up7 | TIPO | `VERBALE_CDC` | `VERBALE_CDC_OTTOBRE` |
| LOG_FOLD | 1RvZupeRKM4Nqk7n50j-ZS7VX6HgSsDgo | TIPO | `VERBALE_CDC` | `VERBALE_CDC_OTTOBRE` |
| LOG_FOLD | 14JR4TojElbW2kPKfIFCZ8Q3gdMfTZfZm | TIPO | `VERBALE_CDC` | `VERBALE_CDC_OTTOBRE` |
| LOG_FOLD | 1OUKV1XzfwpfGGdYLuhnbzsfwP3_xi2JQ | TIPO | `VERBALE_CDC` | `VERBALE_CDC_OTTOBRE` |
| LOG_FOLD | 1zQGWdBLW3VnjuyDPsIuPngTwyLYGohYX | TIPO | `VERBALE_CDC` | `VERBALE_CDC_OTTOBRE` |
| LOG_FOLD | 1u58c-c7EED6z1IUjHhiQxZ7dXId04wVr | TIPO | `VERBALE_CDC` | `VERBALE_CDC_OTTOBRE` |
| LOG_FOLD | 1PWZ50A0YSKU0BDIOf_JxwCMr3_plV9wz | TIPO | `VERBALE_CDC` | `VERBALE_CDC_OTTOBRE` |
| LOG_FOLD | 1DuUKGrHhx2GhFMpncXykB1ziaoY-Bu3s | TIPO | `VERBALE_CDC` | `VERBALE_CDC_OTTOBRE` |
| LOG_FOLD | 1Q-gT6zV5Xiy_f-rls1oqUacBvh7xJNPY | TIPO | `VERBALE_CDC` | `VERBALE_CDC_OTTOBRE` |
| LOG_FOLD | 1_iOX_zRcM3ePV8UkSOZ0lUfNOVZ8riT_ | TIPO | `VERBALE_CDC` | `VERBALE_CDC_OTTOBRE` |
| LOG_FOLD | 1CvUmr0LBuj182vJcndnjT41y8ZFadFYF | TIPO | `VERBALE_CDC` | `VERBALE_CDC_OTTOBRE` |
| LOG_FOLD | 1QNOhxRM-FrnUupkwn_G2aQZ232xPO3aH | TIPO | `VERBALE_CDC` | `VERBALE_CDC_OTTOBRE` |
| LOG_FOLD | 1iE1DCdixB2RGHu4laNSIXUXxuT-2Q9p_ | TIPO | `VERBALE_CDC` | `VERBALE_CDC_OTTOBRE` |
| LOG_FOLD | 12EvSrPOTx0OKD3Vuwa5L3U3ZPspqx29d | TIPO | `VERBALE_CDC` | `VERBALE_CDC_OTTOBRE` |
| LOG_FOLD | 1eP8Lp_JWCoL48OvK7kAHjEeHeuwUkk5p | TIPO | `VERBALE_CDC` | `VERBALE_CDC_OTTOBRE` |
| LOG_FOLD | 1M0r6c3xnicpSukFCDD7Y5yurP7MGLM9M | TIPO | `VERBALE_CDC` | `VERBALE_CDC_OTTOBRE` |
| LOG_FOLD | 19yrdQTfJGjGxgRaKGLiQPyMxcKdknEVP | TIPO | `VERBALE_CDC` | `VERBALE_CDC_OTTOBRE` |
| LOG_FOLD | 12fIbH0f8mEZKzBUVx_p7ACM3qnnZn4qs | TIPO | `VERBALE_CDC` | `VERBALE_CDC_OTTOBRE` |
| LOG_FOLD | 1L3LMCXlNesjVDEZ2SDIj0pCnYkm4kpBL | TIPO | `VERBALE_CDC` | `VERBALE_CDC_OTTOBRE` |
| LOG_FOLD | 1e3i_hw8FTKZIk0f9NPmBmu4dRknB71Ib | TIPO | `VERBALE_CDC` | `VERBALE_CDC_OTTOBRE` |
| LOG_FOLD | 1OS-GqMVPx-fhdEQCZlhTaKIM380ZPDv7 | TIPO | `VERBALE_CDC` | `VERBALE_CDC_OTTOBRE` |
| LOG_FOLD | 1lvewKNLpyJldIlg-K6gEHDVwZyHYsH1m | TIPO | `VERBALE_CDC` | `VERBALE_CDC_OTTOBRE` |
| LOG_FOLD | 1culMqiHbwj7Soq-KsZVMfZTHnRZjBzSA | TIPO | `DOCUMENTO_15_MAGGIO` | `DOC15MAGGIO` |
| LOG_FOLD | 1jd2OXtVx2wYf5KNDO2zpK_daQFPAQAHx | TIPO | `DOCUMENTO_15_MAGGIO` | `DOC15MAGGIO` |
| LOG_FOLD | 1w4IDYMmtAs9pafBxqTRxVpVoXoCvUm7j | TIPO | `DOCUMENTO_15_MAGGIO` | `DOC15MAGGIO` |
| LOG_FOLD | 1zIxI5iM4NKoFVEmuMNdkghPOxrFNWd9s | TIPO | `DOCUMENTO_15_MAGGIO` | `DOC15MAGGIO` |
| LOG_FOLD | 1XMSuSWmMqGn42ZAlHez6itQE_LyJ3LKE | TIPO | `DOCUMENTO_15_MAGGIO` | `DOC15MAGGIO` |
| LOG_FOLD | 1VJRtJkLh2ZJDz7tPZXFHRlKlmzQ-S7pF | TIPO | `DOCUMENTO_15_MAGGIO` | `DOC15MAGGIO` |
| LOG_FOLD | 14IagrOxptjH49kHqB7frJqMGbtK9KyZE | TIPO | `DOCUMENTO_15_MAGGIO` | `DOC15MAGGIO` |
| LOG_FOLD | 1rHHYnnLWvm9NSIXkUV-ZOU_j9BNi2myb | TIPO | `DOCUMENTO_15_MAGGIO` | `DOC15MAGGIO` |
| LOG_FOLD | 1n7i4AAPwIlBgZJkZtnomaBPh7ON4HhuQ | TIPO | `DOCUMENTO_15_MAGGIO` | `DOC15MAGGIO` |
| LOG_FOLD | 1pOne2bhyOBursIYJnlsv2yFmTvLgyxqS | TIPO | `DOCUMENTO_15_MAGGIO` | `DOC15MAGGIO` |
| LOG_FOLD | 1COywzJBdHnnPcZ8WCxbssIr5Kaz4JJI8 | TIPO | `PROGRAMMI_SVOLTI` | `PROGRAMMA` |
| LOG_FOLD | 1I5jaHHNe-QVt9mykq6H3PALr6SRcRIWr | TIPO | `PROGRAMMI_SVOLTI` | `PROGRAMMA` |
| LOG_FOLD | 1kiM2SL3J6Zwlh14Kvbsma2tb-RRywPLs | TIPO | `PROGRAMMI_SVOLTI` | `PROGRAMMA` |
| LOG_FOLD | 1kWD4mXKcJgSaLzBhIB-QQ_T4OKUjQ8Mp | TIPO | `PROGRAMMI_SVOLTI` | `PROGRAMMA` |
| LOG_FOLD | 1b9FjsoZqraEWxYhXmh_UUO1MCaXakIum | TIPO | `PROGRAMMI_SVOLTI` | `PROGRAMMA` |
| LOG_FOLD | 1nCSdITYjIb07qN-foGIaDoM_owfVtigX | TIPO | `PROGRAMMI_SVOLTI` | `PROGRAMMA` |
| LOG_FOLD | 16qK5lovzQReHIvMB1CoyA_IMHCYSol-9 | TIPO | `PROGRAMMI_SVOLTI` | `PROGRAMMA` |
| LOG_FOLD | 1Qqqh9LzI3iETP6fRz9rPAmMkIgm5MlO4 | TIPO | `PROGRAMMI_SVOLTI` | `PROGRAMMA` |
| LOG_FOLD | 1-cpymTKEjJ1Bw1smxsPQQqaL__xeDpk5 | TIPO | `PROGRAMMI_SVOLTI` | `PROGRAMMA` |
| LOG_FOLD | 12hdJtPpS8b0qb2kUycX-Xlfg6qlpzeVj | TIPO | `PROGRAMMI_SVOLTI` | `PROGRAMMA` |
| LOG_FOLD | 11itIAR-wJZISTLJeauCZTHrlwFJbwx3f | TIPO | `PROGRAMMI_SVOLTI` | `PROGRAMMA` |
| LOG_FOLD | 1KNXQvIQSxX0oD3XxaGChMs8KgVmZa_8- | TIPO | `PROGRAMMI_SVOLTI` | `PROGRAMMA` |
| LOG_FOLD | 1lBUXJ5HzBZT3cqQLuQHPPNd4cQCGPsKP | TIPO | `PROGRAMMI_SVOLTI` | `PROGRAMMA` |
| LOG_FOLD | 17pk-Qd0gniYTw-O7dGg_nMGbypnE2S7r | TIPO | `PROGRAMMI_SVOLTI` | `PROGRAMMA` |
| LOG_FOLD | 1hBey7E3OnaLXnoLmxA1epYRBI4MDOBLK | TIPO | `PROGRAMMI_SVOLTI` | `PROGRAMMA` |
| LOG_FOLD | 1FTIkE6J1Dpxa0cV_jcL6g-wQ3qjFYDrv | TIPO | `PROGRAMMI_SVOLTI` | `PROGRAMMA` |
| LOG_FOLD | 1WygvmFVWshachemmY3CuDfXT-hlKidry | TIPO | `PROGRAMMI_SVOLTI` | `PROGRAMMA` |
| LOG_FOLD | 1E4rvHjdUXn04ltYRC-duyxndFRfMBaSs | TIPO | `PROGRAMMI_SVOLTI` | `PROGRAMMA` |
| LOG_FOLD | 1cbbACeOSWK29VplGPBR5S00yCwKpdxGi | TIPO | `PROGRAMMI_SVOLTI` | `PROGRAMMA` |
| LOG_FOLD | 1N0w4S6LuI0o6Yb847Lgz8Y6cGHwsxK-R | TIPO | `PROGRAMMI_SVOLTI` | `PROGRAMMA` |
| LOG_FOLD | 1ZADahySvUmjM9UGRCzePnTQPrIl-_H3o | TIPO | `PROGRAMMI_SVOLTI` | `PROGRAMMA` |
| LOG_FOLD | 1dp8c-58KRHTC6ny4txdvXhRe7x1UjwZF | TIPO | `PROGRAMMI_SVOLTI` | `PROGRAMMA` |
| LOG_FOLD | 11StkDPYUvT4X6tyXGsoI3Ob6VO1maEi5 | TIPO | `PROGRAMMI_SVOLTI` | `PROGRAMMA` |
| LOG_FOLD | 1wOfvjj1OAy5dPn6lfZxULp_3Pap25m4J | TIPO | `PROGRAMMI_SVOLTI` | `PROGRAMMA` |
| LOG_FOLD | 1FFwZ0G7ezAIO2HeT3Q-VdsrIeS2sPGQG | TIPO | `PROGRAMMI_SVOLTI` | `PROGRAMMA` |
| LOG_FOLD | 1umKI6nQzdDwZhVX7RFIvHp94tfLMeFZF | TIPO | `PROGRAMMI_SVOLTI` | `PROGRAMMA` |
| LOG_FOLD | 1PV8IsZMKZnO9JsTAB7LQHRp-jJcUSFSt | TIPO | `PROGRAMMI_SVOLTI` | `PROGRAMMA` |
| LOG_FOLD | 1pdnmA9EE6q3m58VFg0-vuw-kVEjW_RO0 | TIPO | `PROGRAMMI_SVOLTI` | `PROGRAMMA` |
| LOG_FOLD | 1JvRTImXHPC_Q1czgi4jc6JJ1AxAZ8lW2 | TIPO | `PROGRAMMI_SVOLTI` | `PROGRAMMA` |
| LOG_FOLD | 1KDfSSR5O61rrhKGqPFhi4hpjIXt9VXe8 | TIPO | `PROGRAMMI_SVOLTI` | `PROGRAMMA` |
| LOG_FOLD | 1AaZ98T6EuvCYcoDFYa6i0INC908ttZhn | TIPO | `PROGRAMMI_SVOLTI` | `PROGRAMMA` |
| LOG_FOLD | 1NPkDDT34g5lE2wk1Yg1T-cMpCC_qtr2K | TIPO | `PROGRAMMI_SVOLTI` | `PROGRAMMA` |
| LOG_FOLD | 15FgmILAj69gpvVlxWcmv0arTYFwc1wdP | TIPO | `PROGRAMMI_SVOLTI` | `PROGRAMMA` |
| LOG_FOLD | 1rF32-4vs_reM2m776g20Vb59dqQw7SYB | TIPO | `PROGRAMMI_SVOLTI` | `PROGRAMMA` |
| LOG_FOLD | 103Qn6yjPt-ydpDO2ELipiv9LJKzMaMXe | TIPO | `PROGRAMMI_SVOLTI` | `PROGRAMMA` |
| LOG_FOLD | 1b8gHKUFKref8Nunp0c3VXIeEUk1crhKZ | TIPO | `PROGRAMMI_SVOLTI` | `PROGRAMMA` |
| LOG_FOLD | 1Pbb0ACxQfnSCtdCn_W40Ovw0rgU--QFp | TIPO | `PROGRAMMI_SVOLTI` | `PROGRAMMA` |
| LOG_FOLD | 14P2EUHOLmXy587F4KdLp7XiQRADtCKFO | TIPO | `PROGRAMMI_SVOLTI` | `PROGRAMMA` |
| LOG_FOLD | 1X42sdcGI6M1y3ZHZm99HYr05RJMBcXZM | TIPO | `PROGRAMMI_SVOLTI` | `PROGRAMMA` |
| LOG_FOLD | 1cx0pNhaEvOqdYEOgdO-6HH2AzvSeZO3s | TIPO | `PROGRAMMI_SVOLTI` | `PROGRAMMA` |
| … | … | … | … (58 omesse) | 

### mov.tipomovimento — 3 modifiche

| Foglio | Riga | Colonna | Vecchio | Nuovo |
| --- | --- | --- | --- | --- |
| MOV_ALUNNI | vittorio.dantonio@pietroaldi.com | TIPO | `OUT` | `RITIRATO` |
| MOV_ALUNNI | vittorio.dantonio@pietroaldi.com | A | `RITIRO FREQUENZA` | `RITIRO` |
| MOV_ALUNNI | aurora.petrini@pietroaldi.com | A | `` | `ALTRO ISTITUTO` |

### ruoli.nome — 5 modifiche

| Foglio | Riga | Colonna | Vecchio | Nuovo |
| --- | --- | --- | --- | --- |
| RUOLI | REF_ORIENTAMENTO | NOME | `` | `Referente Orientamento` |
| RUOLI | RAPPRESENTANTE_GENITORI | NOME | `Rappresentante di classedei genitori` | `Rappresentante di classe dei genitori` |
| RUOLI | DOCENTE_PRIMA_PROVA | NOME | `` | `Docente della prima prova d'esame` |
| RUOLI | DOCENTE_SECONDA_PROVA | NOME | `` | `Docente della seconda prova d'esame` |
| RUOLI | ALUNNO | NOME | `` | `Alunno` |

## Residui non risolti (attesi)

- `CARENZE.STUDENTE` = `matias.veliaj@pietroaldi.com` — 1 righe
- `LOG_DOCS.ID_GEN` = `<VUOTO>` — 1 righe
- `LOG_DOCS.ID_GEN` = `RIEPILOGO_QUINTA` — 10 righe
- `LOG_FOLD.TIPO` = `VERBALE_ASSEMBLEA_CLASSE` — 49 righe
- `LOG_MAIL.PATTERN` = `NOTIFICA_CARENZE_FAMIGLIE` — 35 righe
- `LOG_MAIL.PATTERN` = `NOTIFICA_CARENZE_FAMIGLIE_AUTO` — 3 righe

## Deviazioni accettate

- `PIANI_PERSONALIZZATI.MODELLI`: 4 rami anziché 5 (ramo PEI non previsto per scelta dell'utente): una generazione PEI produce errore esplicito.
- Audit trail storici rimappati ai nuovi ID su richiesta esplicita (violazione locale dell'immutabilità append-only).
- Dati di test mantenuti: harry.potter/HOGWARTS, classe ALTRO ISTITUTO, righe TEST_DOC_TABELLE_*, righe fantasma vuote.
- Timestamp storici in formato `dd/MM/yyyy HH:mm:ss` (le nuove scritture saranno ISO).
- Chiavi PARAMETRI inerti presenti (`colonneMaterie`, `schede`, `anniCorso`, `configurazionePipeline`): non lette da alcuno strategy.
- `DIPART.CAPO` lasciato vuoto in attesa di nomi reali.
