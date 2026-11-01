-- ETAPA 5 — RECEBIDO NO SYNTECH (confirmação) + POP-UP DO PCP ("Para conferir").
-- Evento 1 (recebido): a ponte confirma a gravação no Syntech (POST /pedido-erp-gravado →
--   erp_sync_status='enviado' + erp_numero). Aí a contagem encerra, as peças seguem reservadas
--   e enviamos UMA confirmação de recebimento no WhatsApp. Este carimbo evita duplicar o aviso.
ALTER TABLE pedidos ADD COLUMN reserva_recebido_aviso_em TEXT;

-- Evento 2 (Para conferir): quando um pedido do ERP entra na fila do PCP (POST /pedido,
--   status 'aguardando_aprovacao'), guardamos uma notificação pra mostrar o pop-up à responsável
--   do PCP. Idempotente por numero_erp (não repete). 'visto_em' marca quando foi tratada.
CREATE TABLE IF NOT EXISTS pcp_notificacoes (
  id           TEXT PRIMARY KEY,
  numero_erp   TEXT,
  cliente_nome TEXT,
  vendedor     TEXT,
  pecas        REAL DEFAULT 0,
  criado_em    TEXT DEFAULT (datetime('now')),
  visto_em     TEXT,
  visto_por    TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_pcp_notif_numero ON pcp_notificacoes(numero_erp);
CREATE INDEX IF NOT EXISTS idx_pcp_notif_visto ON pcp_notificacoes(visto_em);
