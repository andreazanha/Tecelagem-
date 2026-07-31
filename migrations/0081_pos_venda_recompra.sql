-- Fase 4: pós-venda e recompra (mensagens automáticas por tempo após a entrega).
INSERT OR IGNORE INTO config (chave, valor) VALUES ('pos_venda_ativo', '1');
INSERT OR IGNORE INTO config (chave, valor) VALUES ('pos_venda_dias', '7');    -- dias após "enviado" para o pós-venda
INSERT OR IGNORE INTO config (chave, valor) VALUES ('recompra_ativo', '1');
INSERT OR IGNORE INTO config (chave, valor) VALUES ('recompra_dias', '45');     -- dias sem novo pedido para lembrar a recompra
