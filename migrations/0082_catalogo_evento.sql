-- Integração com o catálogo: o catálogo faz POST dos eventos (acesso/abertura/…)
-- para o CRM, que vira contato/lead + histórico. Token opcional de segurança.
INSERT OR IGNORE INTO config (chave, valor) VALUES ('catalogo_evento_token', '');
