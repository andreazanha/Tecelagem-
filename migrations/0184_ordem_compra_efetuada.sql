-- Renomeia o status final da ordem de compra: 'enviada' -> 'compra_efetuada'.
-- O fluxo passa a ser: aguardando_aprovacao -> cotando -> compra_efetuada -> recebida.
UPDATE ordens_compra SET status='compra_efetuada' WHERE status='enviada';
