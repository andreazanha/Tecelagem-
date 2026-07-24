-- Garante que as categorias PADRÃO de material existam.
-- ADITIVA e IDEMPOTENTE: slug é UNIQUE, então INSERT OR IGNORE só cria o que
-- falta e nunca sobrescreve/apaga o que já existe (inclui categorias criadas à
-- mão pelo usuário, como "Fio").
--
-- Motivo: em algumas bases a tabela material_categorias ficou sem as categorias
-- padrão (a tela "Estoque de materiais" aparecia vazia). Este re-seed devolve
-- Forro, Zíper, Etiqueta, Encarte, Embalagem, Refil, Tag, Tabuleiro, Tassel,
-- Linha e Aviamento. Se já existirem, não muda nada.
INSERT OR IGNORE INTO material_categorias (id, slug, nome, cor, icone, ordem) VALUES
  (lower(hex(randomblob(8))), 'forro',     'Forro',     '#0891b2', '🧵', 1),
  (lower(hex(randomblob(8))), 'ziper',     'Zíper',     '#7c3aed', '🤐', 2),
  (lower(hex(randomblob(8))), 'etiqueta',  'Etiqueta',  '#ca8a04', '🏷️', 3),
  (lower(hex(randomblob(8))), 'encarte',   'Encarte',   '#16a34a', '📄', 4),
  (lower(hex(randomblob(8))), 'embalagem', 'Embalagem', '#ea580c', '📦', 5),
  (lower(hex(randomblob(8))), 'refil',     'Refil',     '#db2777', '🛏️', 6),
  (lower(hex(randomblob(8))), 'tag',       'Tag',       '#0d9488', '🔖', 7),
  (lower(hex(randomblob(8))), 'tabuleiro', 'Tabuleiro', '#9333ea', '🟪', 8),
  (lower(hex(randomblob(8))), 'tassel',    'Tassel',    '#e11d48', '🧶', 9),
  (lower(hex(randomblob(8))), 'linha',     'Linha',     '#2563eb', '🧵', 10),
  (lower(hex(randomblob(8))), 'aviamento', 'Aviamento', '#0891b2', '🔘', 11);
