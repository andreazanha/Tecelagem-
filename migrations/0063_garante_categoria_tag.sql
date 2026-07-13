-- O menu "Materiais" lista as categorias que existem no banco. Em produção a
-- categoria "Tag" acabou não ficando cadastrada (não aparece no menu), então
-- não havia tela para cadastrar as tags — e por isso elas foram parar na tela
-- do Encarte. Esta migração garante a categoria Tag (idempotente: só cria se
-- não existir; se já existir, não mexe). Assim a tela "Materiais › Tag" aparece.
INSERT OR IGNORE INTO material_categorias (id, slug, nome, cor, icone, ordem) VALUES
  (lower(hex(randomblob(8))), 'tag', 'Tag', '#0d9488', '🔖', 7);
