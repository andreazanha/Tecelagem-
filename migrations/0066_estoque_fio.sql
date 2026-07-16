-- Estoque do FIO por cor (a cor já implica o tipo de fio — cores.nome é único).
-- E o livro-razão passa a distinguir a origem do movimento (material vs fio),
-- para o estorno devolver exatamente à origem certa. Tudo aditivo/idempotente.
ALTER TABLE cores ADD COLUMN saldo REAL NOT NULL DEFAULT 0;
ALTER TABLE material_mov ADD COLUMN fonte TEXT NOT NULL DEFAULT 'material';
