-- Encerrar atendimento: marca quando a conversa foi dada como resolvida. Serve pra
-- o card parar de "piscar" (aguardando resposta) quando o assunto já acabou.
-- NÃO envia nada pro cliente — é só um marcador interno. Se o cliente escrever de
-- novo (ultima_in_em > encerrado_em), o card volta a aparecer como aguardando.
ALTER TABLE atend_conversas ADD COLUMN encerrado_em TEXT;
