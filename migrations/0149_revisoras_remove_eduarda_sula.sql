-- Corrige as revisoras da tela Revisão. As colunas/filtros vêm de Cadastros ›
-- Operadores (operadoras com setor "revisao"). A lista estava com operadoras
-- antigas: remove Eduarda e Sula, deixando as corretas (Betânia e Bruna).
--
-- Equivale a apagá-las em Cadastros › Operadores. Idempotente: rodar de novo
-- não faz nada. Case-insensitive e ignora espaços por segurança.
DELETE FROM operadores
 WHERE lower(setor) = 'revisao'
   AND lower(trim(nome)) IN ('eduarda', 'sula');
