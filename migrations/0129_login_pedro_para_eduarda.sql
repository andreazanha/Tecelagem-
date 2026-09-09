-- Renomeia o LOGIN do Pedro para Eduarda (ela usa o mesmo acesso que era dele).
--  • Nome de exibição: vira "Eduarda" sempre (é o que aparece no quadro e no "Acompanhar").
--  • Usuário/login: vira "eduarda" SÓ SE ainda não existir um login "eduarda" (o campo é único).
-- A SENHA e a permissão de "Gestor do Atendimento" NÃO são mexidas aqui de propósito — ficam pra o
-- admin ajustar em Cadastros → Usuários (senha nova + marcar "Atendimento — Gestor").
-- Nunca toca no usuário 'admin'.
UPDATE usuarios SET nome='Eduarda'
 WHERE lower(trim(nome))='pedro' AND usuario <> 'admin';

UPDATE usuarios SET usuario='eduarda'
 WHERE lower(trim(usuario))='pedro'
   AND NOT EXISTS (SELECT 1 FROM usuarios u2 WHERE lower(u2.usuario)='eduarda');
