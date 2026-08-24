-- Combinações de cores por produto (peça tricotada com VÁRIAS cores ao mesmo tempo).
-- O NOME da combinação é a "cor" que aparece no pedido (ex.: pedido "Popcorn Tropical" →
-- combinação "Tropical"). Cada combinação lista as GUIAS de fio (GF4, GF5...) e a cor de cada
-- uma, pra sair no PDF da tecelagem qual cor colocar em cada guia.
CREATE TABLE IF NOT EXISTS modelo_combinacoes (
  id          TEXT PRIMARY KEY,
  modelo_nome TEXT NOT NULL,
  nome        TEXT NOT NULL           -- = a "cor" do pedido
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_modcomb_modelo_nome ON modelo_combinacoes(modelo_nome, nome);

-- Guias de fio de cada combinação: GF4 = Verde, GF5 = Marrom, GF6 = Amarelo...
CREATE TABLE IF NOT EXISTS modelo_combinacao_guias (
  combinacao_id TEXT NOT NULL,
  ordem         INTEGER NOT NULL,     -- ordem de exibição no PDF
  guia          TEXT NOT NULL,        -- ex.: "GF4"
  cor_nome      TEXT NOT NULL,        -- ex.: "Verde"
  PRIMARY KEY (combinacao_id, ordem)
);
