-- Para a enxurrada de avisos "precisa de atendente" causada pela limpeza (0191/0192):
-- marca como responsável "Big Tricot" as conversas EM ATENDIMENTO HUMANO que estão SEM
-- dono mas em que o NEGÓCIO já respondeu por último (ultima_out_em >= ultima_in_em) —
-- ou seja, NÃO estão realmente aguardando um atendente. Assim elas mostram "Big Tricot"
-- e saem da fila de "precisa de atendente" (sem disparar aviso).
-- Conversas onde o CLIENTE escreveu por último (realmente aguardando) continuam sem dono
-- e seguem avisando normalmente, como deve ser.
UPDATE atend_conversas SET responsavel = 'Big Tricot'
  WHERE estado = 'atendimento-humano'
    AND (responsavel IS NULL OR TRIM(responsavel) = '')
    AND ultima_out_em IS NOT NULL
    AND (ultima_in_em IS NULL OR ultima_out_em >= ultima_in_em);
