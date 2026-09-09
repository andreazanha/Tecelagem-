-- Pedro saiu e a Eduarda assumiu a carteira dele (usando o mesmo login, que será renomeado em
-- Cadastros → Usuários). Passa as conversas do atendimento que estavam com "Pedro" como RESPONSÁVEL
-- para "Eduarda", pra o nome "Pedro" sair do quadro e os cards casarem com o login dela.
-- Casa só "Pedro" exato (o atendente) — NÃO "Pedro Henrique" (representante, já renomeado na 0127).
UPDATE atend_conversas SET responsavel='Eduarda', atualizado_em=datetime('now')
 WHERE lower(trim(responsavel))='pedro';
