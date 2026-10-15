-- Receita do KIT vinda do Syntech (tabela INSUMOS_PROD do ERP).
-- O kit (ex.: produto QC1078-1 "KIT BALLS QUEEN + 55X35") é montado por INSUMOS:
--   QC1078-1 → KT1078-C (capa) x2 ; KT1078-P (peseira) x1
-- A ponte espelha isso aqui (substitui tudo a cada envio). O catálogo usa pra:
--   1) saber QUAIS produtos são kit (os que aparecem como kit_ref);
--   2) calcular o estoque AO VIVO do kit = menor( estoque_componente / quantidade ).
CREATE TABLE IF NOT EXISTS erp_kit_receita (
  kit_ref        TEXT NOT NULL,            -- CODIGO no Syntech (o kit, ex.: QC1078-1)
  componente_ref TEXT NOT NULL,            -- COD_PROD no Syntech (a peça, ex.: KT1078-C)
  quantidade     REAL NOT NULL DEFAULT 1,  -- quantas peças por kit
  tamanho        TEXT,                     -- TAMANHO do insumo no Syntech (ex.: 4K)
  atualizado_em  TEXT,
  PRIMARY KEY (kit_ref, componente_ref)
);
CREATE INDEX IF NOT EXISTS idx_kit_receita_kit ON erp_kit_receita(kit_ref);
CREATE INDEX IF NOT EXISTS idx_kit_receita_comp ON erp_kit_receita(componente_ref);
