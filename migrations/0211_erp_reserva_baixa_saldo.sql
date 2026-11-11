-- Reserva da BAIXA de estoque: guarda o saldo que havia ANTES da baixa (baixa_saldo_ref).
-- Serve para soltar a reserva sozinha quando o Syntech já refletir a saída (saldo caiu >= qtd),
-- evitando o desconto em dobro (saldo menor do Syntech + reserva local). Null = reserva comum
-- (pedido de cliente), tratada como sempre.
ALTER TABLE erp_reserva ADD COLUMN baixa_saldo_ref REAL;
