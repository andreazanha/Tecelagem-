-- Área de PRODUTOS: catálogo, controle de estoque, ficha técnica, insumos e
-- histórico. Tudo em tabelas NOVAS — não altera nada do que já existe.
-- (O "Estoque" antigo é setor de produção na tabela `producao`; este é outro.)

-- Catálogo de produtos acabados.
CREATE TABLE IF NOT EXISTS produtos (
  id            TEXT PRIMARY KEY,
  nome          TEXT NOT NULL,
  ref           TEXT,                 -- referência / código
  categoria     TEXT,
  tamanho       TEXT,
  cor           TEXT,
  tipo_fio      TEXT,
  unidade       TEXT NOT NULL DEFAULT 'un',
  foto_key      TEXT,                 -- chave do R2
  ativo         INTEGER NOT NULL DEFAULT 1,
  observacao    TEXT,
  estoque       REAL NOT NULL DEFAULT 0,  -- estoque atual (mantido a cada movimentação)
  criado_em     TEXT NOT NULL DEFAULT (datetime('now')),
  atualizado_em TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_produtos_ref ON produtos(ref);

-- Movimentações de estoque do PRODUTO (entrada/saída, avulsa/pedido/ajuste).
CREATE TABLE IF NOT EXISTS produto_mov (
  id               TEXT PRIMARY KEY,
  produto_id       TEXT NOT NULL,
  tipo             TEXT NOT NULL,     -- 'entrada' | 'saida'
  origem           TEXT NOT NULL,     -- 'avulsa' | 'pedido' | 'ajuste'
  qtd              REAL NOT NULL,
  pedido_id        TEXT,              -- quando origem = 'pedido'
  pedido_numero    TEXT,
  usuario          TEXT,
  observacao       TEXT,
  insumos_baixados INTEGER NOT NULL DEFAULT 0,  -- já baixou os insumos desta entrada?
  criado_em        TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_produto_mov_prod ON produto_mov(produto_id);
CREATE INDEX IF NOT EXISTS idx_produto_mov_criado ON produto_mov(criado_em);

-- Cadastro de insumos (usado na ficha técnica).
CREATE TABLE IF NOT EXISTS insumos (
  id            TEXT PRIMARY KEY,
  nome          TEXT NOT NULL,
  categoria     TEXT,
  unidade       TEXT NOT NULL DEFAULT 'un',
  codigo        TEXT,                 -- código interno
  estoque       REAL NOT NULL DEFAULT 0,
  estoque_min   REAL NOT NULL DEFAULT 0,
  ativo         INTEGER NOT NULL DEFAULT 1,
  observacao    TEXT,
  criado_em     TEXT NOT NULL DEFAULT (datetime('now')),
  atualizado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Movimentações de estoque do INSUMO.
CREATE TABLE IF NOT EXISTS insumo_mov (
  id             TEXT PRIMARY KEY,
  insumo_id      TEXT NOT NULL,
  tipo           TEXT NOT NULL,       -- 'entrada' | 'saida'
  origem         TEXT NOT NULL,       -- 'avulsa' | 'ficha' | 'ajuste'
  qtd            REAL NOT NULL,
  produto_mov_id TEXT,                -- entrada de produto que gerou a baixa
  usuario        TEXT,
  observacao     TEXT,
  criado_em      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_insumo_mov_ins ON insumo_mov(insumo_id);

-- Ficha técnica: insumos usados por unidade de cada produto.
CREATE TABLE IF NOT EXISTS produto_insumos (
  id              TEXT PRIMARY KEY,
  produto_id      TEXT NOT NULL,
  insumo_id       TEXT,              -- vínculo opcional ao cadastro de insumos
  nome            TEXT NOT NULL,
  tipo            TEXT,
  qtd_por_unidade REAL NOT NULL DEFAULT 0,
  unidade         TEXT,
  observacao      TEXT
);
CREATE INDEX IF NOT EXISTS idx_produto_insumos_prod ON produto_insumos(produto_id);

-- Histórico geral da área de produtos (data + usuário + descrição).
CREATE TABLE IF NOT EXISTS produtos_log (
  id         TEXT PRIMARY KEY,
  tipo       TEXT NOT NULL,          -- 'produto' | 'estoque' | 'ficha' | 'insumo' | 'baixa'
  descricao  TEXT NOT NULL,
  usuario    TEXT,
  ref_id     TEXT,                   -- id do produto/insumo relacionado
  criado_em  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_produtos_log_criado ON produtos_log(criado_em);
