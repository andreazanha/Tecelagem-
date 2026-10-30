-- Imagens da loja controladas pela dona (página "Imagens"):
--  - foto do PRODUTO (tipo='produto', cor='') — sobrepõe a foto casada do Syntech/Cloudinary;
--  - foto da COR por MODELO (tipo='cor') — a foto global é por NOME de cor (igual pra todos
--    os produtos), então aqui cada modelo pode ter a sua foto pra a MESMA cor (conserta
--    casos como Stanza/Chess com a cor errada).
-- Chave: (tipo, modelo, cor). A imagem em si fica no R2 (loja/<nome>), servida por
-- /api/integracao/loja-arquivo/<nome>; aqui guardamos só a URL.
CREATE TABLE IF NOT EXISTS loja_imagem (
  tipo          TEXT NOT NULL,            -- 'produto' | 'cor'
  modelo        TEXT NOT NULL,            -- id do produto no catálogo (ex.: QC1078-1, ED1012, kit-balls)
  cor           TEXT NOT NULL DEFAULT '', -- id_cor (vazio quando tipo='produto')
  foto          TEXT NOT NULL,            -- URL servida pelo nosso R2
  atualizado_em TEXT,
  PRIMARY KEY (tipo, modelo, cor)
);
