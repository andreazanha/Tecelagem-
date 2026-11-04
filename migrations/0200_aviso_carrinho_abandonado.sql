-- LEMBRETE DE CARRINHO ABANDONADO (loja B2B).
-- Quando um pedido é criado no catálogo e NÃO é enviado ao ERP (fica em rascunho) por ~1 hora,
-- o sistema manda UMA mensagem gentil no WhatsApp lembrando de concluir. Vale para TODO carrinho
-- (não só ED/KT), igual ao prazo de 12h. Controlado pelo interruptor `aviso_carrinho_ativo`
-- (desligado por padrão) e pela janela de envio 08h–20h (America/São_Paulo).
--
--   aviso_carrinho_em : carimbo (datetime UTC) de quando o lembrete foi enviado. NULL = ainda não
--                       enviado. Garante idempotência (envio único por pedido) e não reinicia ao
--                       editar o carrinho.
ALTER TABLE pedidos ADD COLUMN aviso_carrinho_em TEXT;
