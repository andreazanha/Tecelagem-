-- FOTO DO USUÁRIO (avatar) do chat interno. Cada pessoa (login) tem UMA foto, que
-- aparece do lado das mensagens dela e no topo do chat. Isolado do resto do sistema:
-- é só mais uma tabela do chat (não toca em pedido, estoque nem Syntech). A foto em si
-- fica no R2 (pasta chat/, prefixo av-), igual às fotos e figurinhas.
CREATE TABLE IF NOT EXISTS chat_avatar (
  usuario    TEXT PRIMARY KEY,
  nome       TEXT,
  imagem_key TEXT NOT NULL,
  criado_em  TEXT NOT NULL DEFAULT (datetime('now'))
);
