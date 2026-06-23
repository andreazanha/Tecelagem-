-- Recibo de pagamento com Pix: chave Pix e cidade do prestador (recebedor).
ALTER TABLE prestadores ADD COLUMN pix TEXT;
ALTER TABLE prestadores ADD COLUMN cidade TEXT;
