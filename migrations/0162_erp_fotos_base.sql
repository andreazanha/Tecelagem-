-- Endereço base (HTTPS) das fotos dos produtos no Syntech. As fotos ficam expostas
-- publicamente; a URL de cada foto é: <base>/<CLASSE>/<arquivo>.jpg
--   • foto principal:   <base>/<CLASS_PROD.DESCRICAO>/<CODIGO>.jpg            (ex.: .../PESEIRAS E MANTAS/8019P.jpg)
--   • foto por cor/tam: <base>/<CLASS_PROD.DESCRICAO>/<COD>_<TAM>_<COR>_<NUM>.jpg
-- Carregamos direto no front (não precisa re-hospedar). Editável depois em config.
INSERT INTO config (chave, valor, atualizado_em)
VALUES ('erp_fotos_base', 'https://bigtricot.syntechsistemas.com', datetime('now'))
ON CONFLICT(chave) DO NOTHING;
