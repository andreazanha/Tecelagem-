-- Operadores (lista pré-salva): ao iniciar produção, seleciona o nome e digita a senha.
CREATE TABLE IF NOT EXISTS operadores (
  id         TEXT PRIMARY KEY,
  nome       TEXT NOT NULL UNIQUE,
  senha      TEXT NOT NULL,
  setor      TEXT,                                   -- opcional: restringe a um setor
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
