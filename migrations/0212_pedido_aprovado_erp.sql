-- Marca QUANDO o pedido da loja foi REALMENTE aprovado no Syntech (o pedido aprovado
-- retorna pela integração — passo 4). Antes, o cliente via "Confirmado" assim que o pedido
-- era só GRAVADO no Syntech (ainda aguardando a Big aprovar). Com esta marca, o status do
-- cliente mostra "Aguardando aprovação" até aprovar de verdade, e só então "Confirmado".
ALTER TABLE pedidos ADD COLUMN aprovado_erp_em TEXT;
