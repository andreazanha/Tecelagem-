-- Produto (modelo) com suas cores e seus tamanhos. Peso (por peça) e tempo de
-- produção são por PRODUTO+TAMANHO (iguais em todas as cores).
CREATE TABLE IF NOT EXISTS modelo_cores (
  modelo_nome TEXT NOT NULL,
  cor_nome    TEXT NOT NULL,
  PRIMARY KEY (modelo_nome, cor_nome)
);

CREATE TABLE IF NOT EXISTS modelo_tamanhos (
  modelo_nome TEXT NOT NULL,
  tamanho     TEXT NOT NULL,
  peso        REAL,                              -- kg por peça
  tempo       INTEGER,                           -- minutos de produção
  PRIMARY KEY (modelo_nome, tamanho)
);
