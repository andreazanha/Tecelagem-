-- CRM Fase 2: Funil de Vendas (pipeline). Cada cartão é um cliente/lead numa etapa.
-- Etapas: novo-lead | primeiro-contato | negociacao | aguardando-retorno |
--         pedido-andamento | pos-venda | ativo | inativo | perdido
CREATE TABLE IF NOT EXISTS funil_cards (
  id             TEXT PRIMARY KEY,
  cliente_id     TEXT,                                         -- vínculo opcional ao cadastro de clientes
  nome           TEXT NOT NULL,
  cidade         TEXT,
  uf             TEXT,
  whatsapp       TEXT,
  etapa          TEXT NOT NULL DEFAULT 'novo-lead',
  responsavel    TEXT,
  valor_estimado REAL,
  probabilidade  INTEGER,                                      -- 0-100 (negociação)
  retorno_em     TEXT,                                         -- data obrigatória (aguardando-retorno)
  motivo_perdido TEXT,                                         -- (perdido)
  pedido_id      TEXT,                                         -- (pedido-andamento) vínculo ao pedido
  tentativas     INTEGER NOT NULL DEFAULT 0,                   -- tentativas sem resposta
  criado_em      TEXT NOT NULL DEFAULT (datetime('now')),
  movido_em      TEXT NOT NULL DEFAULT (datetime('now'))       -- última movimentação → "dias parado"
);
CREATE INDEX IF NOT EXISTS idx_funil_etapa   ON funil_cards(etapa);
CREATE INDEX IF NOT EXISTS idx_funil_cliente ON funil_cards(cliente_id);

-- Tarefas do cartão (toda etapa deve ter uma próxima tarefa).
CREATE TABLE IF NOT EXISTS funil_tarefas (
  id          TEXT PRIMARY KEY,
  card_id     TEXT NOT NULL REFERENCES funil_cards(id) ON DELETE CASCADE,
  titulo      TEXT NOT NULL,
  vence_em    TEXT,
  responsavel TEXT,
  feita       INTEGER NOT NULL DEFAULT 0,
  criado_em   TEXT NOT NULL DEFAULT (datetime('now')),
  feito_em    TEXT
);
CREATE INDEX IF NOT EXISTS idx_funil_tar_card ON funil_tarefas(card_id);

-- Timeline do cartão (histórico nunca apagado): ligações, mensagens, e-mails,
-- pedidos, mudanças de etapa e observações.
CREATE TABLE IF NOT EXISTS funil_eventos (
  id        TEXT PRIMARY KEY,
  card_id   TEXT NOT NULL REFERENCES funil_cards(id) ON DELETE CASCADE,
  tipo      TEXT NOT NULL DEFAULT 'obs',                       -- obs|ligacao|whatsapp|email|etapa|pedido|tarefa
  texto     TEXT,
  autor     TEXT,
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_funil_ev_card ON funil_eventos(card_id);
