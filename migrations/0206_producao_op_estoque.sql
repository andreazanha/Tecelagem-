-- Liga uma unidade da tela "Precisa Produzir" (kit/avulso, por cor) à ORDEM DE PRODUÇÃO
-- criada pra ela — que é um pedido de reposição (reposicao=1) que entra na esteira
-- (Tecelagem → Corte → Revisão), igual às reposições que a fábrica já produz hoje.
-- Enquanto a OP está aberta, a unidade aparece como "em produção" em vez de "precisa produzir".
CREATE TABLE IF NOT EXISTS producao_op_estoque (
  id           TEXT PRIMARY KEY,
  ref          TEXT NOT NULL,        -- unidade PE (kit_ref do kit vazio, ou ref do avulso)
  cor          TEXT NOT NULL,        -- minúsculo
  tipo         TEXT,                 -- 'kit' | 'avulso'
  modelo       TEXT,
  pedido_id    TEXT,                 -- o pedido de reposição criado (entra na esteira)
  qtd          REAL,
  criado_em    TEXT,
  criado_por   TEXT,
  concluida_em TEXT                  -- preenchido quando a OP é concluída/dá entrada (Etapa 4)
);
CREATE INDEX IF NOT EXISTS idx_op_estoque_refcor ON producao_op_estoque(ref, cor);
CREATE INDEX IF NOT EXISTS idx_op_estoque_pedido ON producao_op_estoque(pedido_id);
