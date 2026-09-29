-- Nova categoria de material: ENCHIMENTO (a fibra que enche os refis), controlada
-- em kg, com vários tipos (fibra siliconada, pluma, etc.). Entra como mais uma aba
-- em "Estoque de materiais" e em Cadastros › Materiais, reaproveitando todo o
-- controle de estoque (entrada/ajuste/extrato/compras) já existente.
--
-- ADITIVA e IDEMPOTENTE: slug é UNIQUE, então INSERT OR IGNORE só cria se faltar e
-- nunca sobrescreve nada já existente.
INSERT OR IGNORE INTO material_categorias (id, slug, nome, cor, icone, ordem) VALUES
  (lower(hex(randomblob(8))), 'enchimento', 'Enchimento', '#0ea5e9', '☁️', 12);
