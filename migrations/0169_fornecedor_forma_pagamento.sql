-- Forma de pagamento padrão do fornecedor (pré-preenche a ordem de compra).
ALTER TABLE fornecedores ADD COLUMN forma_pagamento TEXT;
