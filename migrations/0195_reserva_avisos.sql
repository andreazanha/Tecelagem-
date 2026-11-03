-- ETAPA 3 — AVISOS DE RESERVA POR WHATSAPP (reusa a integração Z-API do CRM).
-- Controle dos dois avisos (1h após criar; 1h antes de vencer) e do destinatário.
--   reserva_aviso1_em : quando o 1º aviso foi enviado (nunca repete).
--   reserva_aviso2_em : quando o aviso de vencimento foi enviado PARA A JANELA ATUAL.
--                       Ao prorrogar, volta a NULL → reagenda o aviso p/ 1h antes do novo prazo.
--   reserva_aviso_tel : telefone (dígitos) pra onde os avisos foram — cliente OU representante.
--                       Usado pra casar a resposta de prorrogação ao carrinho certo (segurança).
ALTER TABLE pedidos ADD COLUMN reserva_aviso1_em TEXT;
ALTER TABLE pedidos ADD COLUMN reserva_aviso2_em TEXT;
ALTER TABLE pedidos ADD COLUMN reserva_aviso_tel TEXT;

-- Histórico de TODOS os eventos da reserva (auditoria da Etapa 3).
CREATE TABLE IF NOT EXISTS reserva_historico (
  id         TEXT PRIMARY KEY,
  pedido_id  TEXT,
  evento     TEXT,   -- 'aviso1' | 'aviso2' | 'prorrogacao' | 'prorrogacao_negada' | 'confirmacao' | 'expiracao'
  telefone   TEXT,   -- destinatário (dígitos)
  detalhe    TEXT,   -- texto enviado OU motivo da recusa
  criado_em  TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_reserva_hist_pedido ON reserva_historico(pedido_id);
