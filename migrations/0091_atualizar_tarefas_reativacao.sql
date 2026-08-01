-- Atualiza as tarefas dos cards de reativação/pós-venda de cliente COM
-- representante que ainda estavam com o texto antigo ("não falar direto com o
-- cliente") para o texto novo (pode falar direto; venda vai pro representante;
-- assume só se houver reclamação). Só mexe em tarefas abertas com o texto antigo.
UPDATE funil_tarefas
SET titulo =
  'Pós-venda + catálogo (pode falar direto): perguntar se recebeu o pedido e se deu tudo certo, mandar novidades. Se quiser comprar, passar para o representante '
  || (SELECT c.responsavel FROM funil_cards c WHERE c.id = funil_tarefas.card_id)
  || ' fechar a venda. Se reclamar que '
  || (SELECT c.responsavel FROM funil_cards c WHERE c.id = funil_tarefas.card_id)
  || ' não atende / atende mal, assumir o cliente.'
WHERE funil_tarefas.feita = 0
  AND funil_tarefas.titulo LIKE 'Acionar o representante%'
  AND EXISTS (
    SELECT 1 FROM funil_cards c
    WHERE c.id = funil_tarefas.card_id
      AND c.etapa = 'reativacao'
      AND COALESCE(c.responsavel, '') <> ''
  );
