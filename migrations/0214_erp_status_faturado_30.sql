-- Ativa a liberacao automatica da reserva no FATURAMENTO do Syntech.
--
-- O status "Faturado" no Syntech e o numero 30 (confirmado lendo um pedido da
-- loja ja faturado no painel "Pedidos da Loja (B2B)": o "Aprovado" e 10, o
-- "Separado" fica entre eles). Com este valor na config, quando a ponte le
-- PEDIDO.STATUS >= 30 de um pedido da loja, a reserva daquele pedido solta
-- sozinha -- o estoque ja baixou no Syntech, entao nao ha risco de vender duas
-- vezes. O cancelamento (CANC='S') ja soltava sozinho de antes.
--
-- Fica so na config (sem campo na tela), a pedido do dono: "configura uma vez e
-- esquece". Se um dia o Syntech mudar esse numero, basta outra migration como esta.
INSERT INTO config (chave, valor, atualizado_em)
VALUES ('erp_status_faturado', '30', datetime('now'))
ON CONFLICT(chave) DO UPDATE SET valor = '30', atualizado_em = datetime('now');
