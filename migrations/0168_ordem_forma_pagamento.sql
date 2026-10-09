-- Forma de pagamento na ordem de compra (sai no PDF junto com a observação).
ALTER TABLE ordens_compra ADD COLUMN forma_pagamento TEXT;
