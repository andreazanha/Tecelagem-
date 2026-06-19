-- Catálogo configurável: Modelos (define Parte 1/2) e Cores (define 100% Poliéster).
-- O tipo (peseira/manta/almofada/kit) e a condição de Pronta Entrega (kit) vêm do
-- prefixo do produto no ERP; aqui guardamos apenas o que o cliente edita.

CREATE TABLE IF NOT EXISTS modelos (
  nome       TEXT PRIMARY KEY,                 -- nome amigável (ex.: Perola, Daytona)
  parte      INTEGER NOT NULL DEFAULT 2,       -- 1 ou 2 (modelos novos caem na Parte 2)
  ref        TEXT,                             -- grade/ref opcional (ex.: 1076)
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS cores (
  nome       TEXT PRIMARY KEY,                 -- nome da cor (ex.: Romenia)
  poliester  INTEGER NOT NULL DEFAULT 0,       -- 1 = "100% Poliéster"; 0 = sem composição
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
