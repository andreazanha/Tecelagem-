-- Usuários do sistema (login) com permissões de páginas/telas.
-- paginas: JSON array de chaves liberadas (ex.: ["pedidos","producao","tv-costura"]).
-- admin = 1 libera tudo.
CREATE TABLE IF NOT EXISTS usuarios (
  id         TEXT PRIMARY KEY,
  nome       TEXT NOT NULL,
  usuario    TEXT NOT NULL UNIQUE,
  senha      TEXT NOT NULL,
  admin      INTEGER NOT NULL DEFAULT 0,
  paginas    TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
