-- Ficha técnica do produto: quanto cada produto consome de cada MATERIAL por peça
-- (quantidade única por produto — só o fio e o tempo variam por tamanho, que já
-- ficam em modelo_tamanhos). Preço (custo) no fio e nos materiais para estimar o
-- custo por peça e alimentar as ordens de compra.
ALTER TABLE materiais ADD COLUMN preco REAL;        -- custo por unidade de consumo (un/cm/kg…)
ALTER TABLE tipos_fio ADD COLUMN preco REAL;         -- custo do fio por kg

-- Materiais que compõem a ficha de um produto. quantidade = consumo por peça na
-- unidade do material; guardamos a unidade junto para exibir/calcular sem ambiguidade.
CREATE TABLE IF NOT EXISTS modelo_materiais (
  modelo_nome TEXT NOT NULL,
  material_id TEXT NOT NULL,
  quantidade  REAL,                                  -- consumo por peça (na unidade do material)
  PRIMARY KEY (modelo_nome, material_id)
);
CREATE INDEX IF NOT EXISTS idx_modelo_materiais_mod ON modelo_materiais(modelo_nome);
