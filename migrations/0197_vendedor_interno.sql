-- ETAPA 6 — VENDEDOR INTERNO responsável por cada cliente + notificações individuais no CRM.
-- vendedor_interno = usuarios.id de um usuário real da Big Tricot (função 'vendedor.interno').
-- NÃO confundir com representante comercial (clientes.representante, um NOME). Os dois coexistem.
ALTER TABLE clientes ADD COLUMN vendedor_interno TEXT;  -- usuarios.id (NULL = sem vendedor)
CREATE INDEX IF NOT EXISTS idx_clientes_vend_int ON clientes(vendedor_interno);

-- Histórico de alterações da carteira (quem mudou o vendedor de quem, quando).
CREATE TABLE IF NOT EXISTS cliente_vendedor_hist (
  id         TEXT PRIMARY KEY,
  cliente_id TEXT NOT NULL,
  de         TEXT,            -- usuarios.id anterior (ou NULL)
  para       TEXT,            -- usuarios.id novo (ou NULL)
  por        TEXT,            -- quem alterou (usuarios.id)
  por_nome   TEXT,
  criado_em  TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_cli_vend_hist ON cliente_vendedor_hist(cliente_id, criado_em);

-- Notificações individuais do CRM (pop-up "Seu cliente fez um pedido!"). Uma por pedido+vendedor.
CREATE TABLE IF NOT EXISTS crm_notificacoes (
  id           TEXT PRIMARY KEY,
  usuario_id   TEXT NOT NULL,   -- vendedor interno dono (só ele vê)
  pedido_id    TEXT,
  cliente_id   TEXT,            -- pra "Ver pedido" abrir a ficha do cliente (tela existente)
  numero_erp   TEXT,
  cliente_nome TEXT,
  representante TEXT,
  valor_total  REAL,
  pecas        REAL,
  recebido_em  TEXT,
  criado_em    TEXT DEFAULT (datetime('now')),
  visto_em     TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_notif_ped_user ON crm_notificacoes(pedido_id, usuario_id);
CREATE INDEX IF NOT EXISTS idx_crm_notif_user ON crm_notificacoes(usuario_id, visto_em);
