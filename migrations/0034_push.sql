-- Inscrições de Web Push (notificação "entrou pedido novo" perto do relógio,
-- mesmo com o navegador fechado). Uma linha por aparelho/navegador inscrito.
CREATE TABLE IF NOT EXISTS push_subscriptions (
  endpoint   TEXT PRIMARY KEY,
  p256dh     TEXT NOT NULL,
  auth       TEXT NOT NULL,
  user_agent TEXT,
  criado_em  TEXT NOT NULL DEFAULT (datetime('now'))
);
