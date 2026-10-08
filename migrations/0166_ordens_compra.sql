-- Ordens de compra de insumos PERSISTIDAS, com fluxo de aprovação:
-- PCP cria (aguardando_aprovacao) -> gestor edita/aprova -> envia no WhatsApp (enviada).
CREATE TABLE IF NOT EXISTS ordens_compra (
  id              TEXT PRIMARY KEY,
  numero          TEXT NOT NULL,                 -- OC-AAAAMMDD-HHMM
  fornecedor_id   TEXT,
  fornecedor_nome TEXT,
  fornecedor_json TEXT,                          -- snapshot {nome,contato,telefone,email,cnpj}
  empresa_json    TEXT,                          -- snapshot {nome,cnpj,endereco,telefone,email}
  status          TEXT NOT NULL DEFAULT 'aguardando_aprovacao', -- aguardando_aprovacao|aprovada|enviada|recusada
  total           REAL DEFAULT 0,
  obs             TEXT,
  criado_por_id   TEXT,
  criado_por_nome TEXT,
  criado_em       TEXT NOT NULL,
  aprovado_por_id TEXT,
  aprovado_por_nome TEXT,
  aprovado_em     TEXT,
  enviado_em      TEXT,
  erro            TEXT
);
CREATE INDEX IF NOT EXISTS idx_ordens_compra_status ON ordens_compra(status);
CREATE INDEX IF NOT EXISTS idx_ordens_compra_criado ON ordens_compra(criado_em);

CREATE TABLE IF NOT EXISTS ordem_compra_itens (
  id          TEXT PRIMARY KEY,
  ordem_id    TEXT NOT NULL,
  material_id TEXT,
  nome        TEXT,
  codigo      TEXT,
  tamanho     TEXT,
  cor         TEXT,
  unidade     TEXT,
  qtd         REAL DEFAULT 0,
  preco       REAL DEFAULT 0,
  ordem       INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_ordem_compra_itens_ordem ON ordem_compra_itens(ordem_id);
