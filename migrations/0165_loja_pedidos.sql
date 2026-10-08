-- Fase 4: captura do pedido da loja B2B (loja -> D1 -> ponte -> Syntech).
-- O pedido da loja entra num "canal" próprio ('loja_b2b'), com status
-- 'aguardando_aprovacao' (fica FORA da produção nossa) e erp_integracao NÃO setado
-- (fica FORA da tela de conferência do ERP). O envio pro Syntech é controlado por
-- erp_sync_status / erp_liberado. Quando o Syntech aprovar, o pedido volta pra nós
-- pelo fluxo normal ERP->nós (STATUS=10).
ALTER TABLE pedidos ADD COLUMN cliente_cnpj TEXT;
ALTER TABLE pedidos ADD COLUMN cliente_id TEXT;
ALTER TABLE pedidos ADD COLUMN valor_total REAL;
ALTER TABLE pedidos ADD COLUMN canal TEXT;                 -- 'loja_b2b' p/ pedidos da loja
ALTER TABLE pedidos ADD COLUMN erp_sync_status TEXT;       -- 'pendente' | 'enviado' | 'erro'
ALTER TABLE pedidos ADD COLUMN erp_numero INTEGER;         -- NUMERO do pedido no Syntech (após enviar)
ALTER TABLE pedidos ADD COLUMN erp_sync_em TEXT;           -- quando foi enviado/errou
ALTER TABLE pedidos ADD COLUMN erp_sync_erro TEXT;         -- msg de erro do último envio
ALTER TABLE pedidos ADD COLUMN erp_liberado INTEGER DEFAULT 0; -- trava: só envia se =1
ALTER TABLE pedidos ADD COLUMN idem TEXT;                  -- idempotência do checkout
ALTER TABLE pedido_itens ADD COLUMN cod_cor INTEGER;       -- COD_COR do Syntech (CORES.NUMERO)
ALTER TABLE pedido_itens ADD COLUMN erp_tamanho TEXT;      -- TAMANHO (código) do Syntech, ex "UN"/"P"
ALTER TABLE clientes ADD COLUMN codigo_erp TEXT;           -- cache do COD_CLI do Syntech (a ponte preenche)
