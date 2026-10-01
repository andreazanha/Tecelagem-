-- AVISOS do PCP por setor: um recado preso ao pedido, direcionado a um setor
-- (ex.: "Tecelagem: não esquecer de trocar a cor"). Aparece num popup no meio da
-- tela quando a pessoa clica em INICIAR um card daquele pedido NAQUELE setor.
CREATE TABLE IF NOT EXISTS pedido_avisos (
  id         TEXT PRIMARY KEY,
  pedido_id  TEXT NOT NULL,
  setor      TEXT NOT NULL,
  texto      TEXT NOT NULL,
  criado_por TEXT,
  criado_em  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_pedido_avisos ON pedido_avisos (pedido_id, setor);
