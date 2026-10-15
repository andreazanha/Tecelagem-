-- Conteúdo EXTRA por produto do catálogo, editável pela dona (fica no NOSSO banco,
-- não mexe no catálogo antigo). Serve pra colocar VÍDEO e TEXTOS em produtos que não
-- têm (ex.: kits). A chave é o id do produto no catálogo (o código base, ex.: QC1078-1).
-- Na geração do catálogo isso é sobreposto DEPOIS do catálogo antigo (a edição da dona vence).
CREATE TABLE IF NOT EXISTS loja_produto_extra (
  ref           TEXT PRIMARY KEY,   -- id do produto no catálogo (código base)
  video         TEXT,               -- link do vídeo (mp4/again)
  texto         TEXT,               -- descrição/observações (vira um bloco no anúncio)
  atualizado_em TEXT
);
