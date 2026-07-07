-- Insumos mais completos: cor e fornecedor próprios, além de listas próprias de
-- CATEGORIAS e CORES de insumo (separadas das cores de produto — ex.: cores de zíper).
-- Também cria o cadastro de FORNECEDORES (base para ordem de compra).

ALTER TABLE insumos ADD COLUMN cor TEXT;
ALTER TABLE insumos ADD COLUMN fornecedor_id TEXT;

-- Categorias de insumo (Aviamento, Zíper, Linha, Embalagem…) — vira dropdown.
CREATE TABLE IF NOT EXISTS insumo_categorias (
  id        TEXT PRIMARY KEY,
  nome      TEXT NOT NULL UNIQUE,
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Cores de insumo (diferentes das cores de produto).
CREATE TABLE IF NOT EXISTS insumo_cores (
  id        TEXT PRIMARY KEY,
  nome      TEXT NOT NULL UNIQUE,
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Fornecedores (para vincular ao insumo e gerar ordem de compra depois).
CREATE TABLE IF NOT EXISTS fornecedores (
  id         TEXT PRIMARY KEY,
  nome       TEXT NOT NULL,
  contato    TEXT,
  telefone   TEXT,
  email      TEXT,
  cnpj       TEXT,
  observacao TEXT,
  ativo      INTEGER NOT NULL DEFAULT 1,
  criado_em  TEXT NOT NULL DEFAULT (datetime('now'))
);
