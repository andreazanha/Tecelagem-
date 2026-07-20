-- Modelos de etiqueta (configuração de folha) salvos no servidor, para
-- sincronizar entre computadores/celulares. Chave = nome (salvar com o mesmo
-- nome sobrescreve). cfg é o JSON da configuração (margens, colunas, etc.).
CREATE TABLE IF NOT EXISTS etiqueta_presets (
  nome          TEXT PRIMARY KEY,
  cfg           TEXT NOT NULL,
  atualizado_em INTEGER
);
