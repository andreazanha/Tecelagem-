-- Figurinhas (stickers) do CHAT INTERNO — compartilhadas por toda a equipe.
-- A imagem fica no R2 em chat/<imagem_key> (o imagem_key começa com "fig-").
-- Mandar uma figurinha é só uma mensagem com esse imagem_key. Isolado do resto.
CREATE TABLE IF NOT EXISTS chat_figurinha (
  id         TEXT PRIMARY KEY,
  imagem_key TEXT NOT NULL,        -- arquivo no R2 (chat/<imagem_key>), prefixo "fig-"
  criado_por TEXT,
  criado_em  TEXT NOT NULL DEFAULT (datetime('now'))
);
