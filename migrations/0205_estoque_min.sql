-- Estoque MÍNIMO por modelo+cor (gatilho do "precisa produzir"), só Pronta Entrega.
-- ref = unidade vendável: para KIT é o ref do kit (vazio); para avulso é o ref do produto.
-- cor é guardada em minúsculo (casa sem depender de acento/caixa). minimo = alvo de estoque.
-- Fica em tabela PRÓPRIA (não em erp_estoque, que é sobrescrito a cada sync do Syntech).
CREATE TABLE IF NOT EXISTS estoque_min (
  ref           TEXT NOT NULL,
  cor           TEXT NOT NULL,        -- minúsculo
  minimo        REAL NOT NULL DEFAULT 0,
  atualizado_em TEXT,
  PRIMARY KEY (ref, cor)
);
CREATE INDEX IF NOT EXISTS idx_estoque_min_ref ON estoque_min(ref);
