-- ETAPA 1 da RESERVA DE ESTOQUE (servidor): janela de reserva do carrinho/pedido.
-- O carrinho é o próprio pedido em RASCUNHO (erp_sync_status='rascunho', canal='loja_b2b').
-- Ao reservar peças FÍSICAS, o pedido ganha uma janela; enquanto ela está ATIVA, as reservas
-- do rascunho descontam do catálogo (como já acontece com os pedidos enviados). Um rascunho
-- com janela vencida deixa de segurar estoque (e a limpeza o solta na próxima sincronização).
--
--   reserva_iniciada_em  : quando a 1ª peça física foi reservada (não reinicia ao editar).
--   reserva_expira_em    : fim da janela (padrão 12h). Só vale para RASCUNHO; pedido ENVIADO
--                          continua contando pelo erp_sync_status, independente disto.
--   reserva_responsavel  : 'cliente' ou 'rep' — dono da reserva (base da prorrogação, Etapa 4).
--   reserva_prorrogacoes : nº de prorrogações já concedidas (base da Etapa 4).
ALTER TABLE pedidos ADD COLUMN reserva_iniciada_em TEXT;
ALTER TABLE pedidos ADD COLUMN reserva_expira_em TEXT;
ALTER TABLE pedidos ADD COLUMN reserva_responsavel TEXT;
ALTER TABLE pedidos ADD COLUMN reserva_prorrogacoes INTEGER DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_pedidos_reserva_expira ON pedidos(reserva_expira_em);
