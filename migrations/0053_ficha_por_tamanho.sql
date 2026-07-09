-- Ficha técnica POR TAMANHO: em cada tamanho do produto escolhe-se qual material
-- (etiqueta, forro, zíper, tabuleiro, tassel…) é usado. A tabela 0051 estava
-- vazia (recém-criada), então recriamos com a coluna tamanho.
DROP TABLE IF EXISTS modelo_materiais;
CREATE TABLE modelo_materiais (
  modelo_nome TEXT NOT NULL,
  tamanho     TEXT NOT NULL,                 -- tamanho do produto (ex.: 50X50)
  material_id TEXT NOT NULL,                 -- item escolhido (→ materiais.id)
  quantidade  REAL,                          -- consumo por peça nesse tamanho (padrão 1)
  PRIMARY KEY (modelo_nome, tamanho, material_id)
);
CREATE INDEX IF NOT EXISTS idx_modelo_materiais_mod ON modelo_materiais(modelo_nome);
