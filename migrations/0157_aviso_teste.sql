-- Aviso de TESTE pra experimentar o popup: ao clicar INICIAR no card TESTE-01
-- (fase Corte), aparece o aviso do PCP no meio da tela. Idempotente.
INSERT OR IGNORE INTO pedido_avisos (id, pedido_id, setor, texto) VALUES
  ('aviso-teste-1', 'teste-corte-1', 'corte', 'TESTE: cortar a etiqueta do cliente — não esquecer!');
