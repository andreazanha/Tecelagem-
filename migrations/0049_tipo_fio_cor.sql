-- Ícone de cor para o tipo de fio + sementes dos tipos comuns.
ALTER TABLE tipos_fio ADD COLUMN cor TEXT;

INSERT OR IGNORE INTO tipos_fio (id, nome, cor) VALUES
  (lower(hex(randomblob(8))), '100% Poliéster', '#2563eb'),
  (lower(hex(randomblob(8))), '100% Acrílico', '#16a34a'),
  (lower(hex(randomblob(8))), 'Chenille', '#9333ea');
