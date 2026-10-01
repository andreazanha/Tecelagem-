-- Facilita o teste do popup de aviso: reseta os cards de teste do Corte pra
-- 'aguardando' (pra o botão "Cortar"/Iniciar aparecer) e põe aviso em vários.
-- Só mexe nos cards de TESTE. Idempotente.
UPDATE producao SET status = 'aguardando', iniciado_em = NULL, finalizado_em = NULL, operador = NULL
 WHERE pedido_id LIKE 'teste-corte-%' AND setor = 'corte';

INSERT OR IGNORE INTO pedido_avisos (id, pedido_id, setor, texto) VALUES
  ('aviso-teste-2', 'teste-corte-2', 'corte', 'TESTE DO AVISO — se apareceu este popup, está funcionando! (Peseira Wave)'),
  ('aviso-teste-3', 'teste-corte-3', 'corte', 'TESTE DO AVISO — Almofada Kora: conferir a cor terracota'),
  ('aviso-teste-4', 'teste-corte-4', 'corte', 'TESTE DO AVISO — Capa Aspen: embalagem especial do cliente');
