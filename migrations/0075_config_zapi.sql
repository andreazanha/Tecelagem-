-- Configurações chave/valor do sistema (começa com a integração Z-API do WhatsApp).
-- Guardado no banco para o admin configurar pela própria tela, sem mexer em env.
CREATE TABLE IF NOT EXISTS config (
  chave        TEXT PRIMARY KEY,
  valor        TEXT,
  atualizado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Chaves usadas pela integração Z-API (preenchidas na tela de Atendimento):
--   zapi_base         → https://api.z-api.io
--   zapi_instance     → ID da instância
--   zapi_token        → token da instância
--   zapi_client_token → Client-Token da conta (segurança)
--   zapi_ativo        → '1' liga o envio real, '0' mantém só o simulador
INSERT OR IGNORE INTO config (chave, valor) VALUES ('zapi_base', 'https://api.z-api.io');
INSERT OR IGNORE INTO config (chave, valor) VALUES ('zapi_ativo', '0');
