-- Ficha Técnica de Programa (tricô): cabeçalho + tabelas (guardadas em JSON) + imagem.
CREATE TABLE IF NOT EXISTS ficha_programa (
  id TEXT PRIMARY KEY,
  numero TEXT,                 -- Nº Programa (ex.: AN289)
  cliente TEXT,
  descricao TEXT,
  programador TEXT,
  maquina TEXT,                -- Maq. Modelo
  galga TEXT,
  fio TEXT,
  data TEXT,                   -- data da ficha (yyyy-mm-dd)
  peso_total TEXT,
  tempo_total TEXT,
  imagem_key TEXT,             -- chave no R2
  programa TEXT,               -- JSON [{programa,descricao,tempo}]
  guia_fios TEXT,              -- JSON [{num,fio,cabos,fio2}]
  economizador TEXT,           -- JSON [{num,c1,c1p,c2,c2p,c3,c3p,c4,c4p}]
  graduacao TEXT,              -- JSON [{num,local}]
  take_down TEXT,              -- JSON [{tc,tr,local}]
  velocidade TEXT,             -- JSON [{n,ms,local}]
  criado_em TEXT DEFAULT (datetime('now')),
  atualizado_em TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_ficha_programa_numero ON ficha_programa(numero);

-- Cadastros auxiliares (listas pra escolher na ficha).
CREATE TABLE IF NOT EXISTS ficha_maquina (id TEXT PRIMARY KEY, nome TEXT, ordem INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS ficha_galga (id TEXT PRIMARY KEY, nome TEXT, ordem INTEGER DEFAULT 0);
