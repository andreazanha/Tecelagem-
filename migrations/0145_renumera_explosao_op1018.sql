-- Renumera a explosão antiga OP-1018 para o padrão novo (menor número livre: 001, 002...).
-- O menor livre é calculado entre as explosões que JÁ usam o formato numérico novo
-- (CAST > 0). As antigas "OP-XXXX" fazem CAST = 0 e são ignoradas, então não colidem.
-- Idempotente: se OP-1018 não existir mais, não faz nada.
UPDATE pedidos
   SET codigo_pai = (
     WITH RECURSIVE seq(n) AS (
       SELECT 1
       UNION ALL SELECT n + 1 FROM seq WHERE n < 1000
     )
     SELECT printf('%03d', MIN(seq.n))
       FROM seq
      WHERE seq.n NOT IN (
        SELECT CAST(codigo_pai AS INTEGER)
          FROM pedidos
         WHERE codigo_pai IS NOT NULL
           AND CAST(codigo_pai AS INTEGER) > 0
      )
   )
 WHERE codigo_pai = 'OP-1018';
