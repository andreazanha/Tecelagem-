-- ZERAR para começar do zero (a pedido do gestor): apaga o Funil de Vendas e o
-- Atendimento (conversas do WhatsApp). Filhos antes dos pais, sem depender de cascade.
-- NÃO apaga: clientes, pedidos, representantes, usuários, config, setores (atend_setores)
-- nem o treino da Bia (ia_conhecimento).

-- Funil de Vendas
DELETE FROM funil_tarefas;
DELETE FROM funil_eventos;
DELETE FROM funil_cards;

-- Atendimento (WhatsApp) — mantém atend_setores (cadastro de setores)
DELETE FROM atend_mensagens;
DELETE FROM atend_interesses;
DELETE FROM atend_conversas;
