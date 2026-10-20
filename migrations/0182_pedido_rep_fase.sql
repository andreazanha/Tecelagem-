-- Fluxo do pedido montado pelo REPRESENTANTE:
--   loja_fase: 'em_espera' (rascunho, NÃO vai pro Syntech) | 'enviado' (cliente deu OK,
--              aguardando aprovação da Big) ; vazio = pedido normal da loja (cliente direto).
--   loja_cod_prazo / loja_forma_desc: forma de pagamento (prazo) escolhida pelo rep.
ALTER TABLE pedidos ADD COLUMN loja_fase TEXT;
ALTER TABLE pedidos ADD COLUMN loja_cod_prazo TEXT;
ALTER TABLE pedidos ADD COLUMN loja_forma_desc TEXT;
