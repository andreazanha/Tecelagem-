-- Kits (pronta-entrega) voltam a passar pela produção. Os que o 0020 mandou
-- para o Estoque retornam ao início da esteira (Tecelagem, aguardando).
UPDATE producao SET setor = 'tecelagem', status = 'aguardando'
 WHERE parte = 'pronta-entrega' AND setor = 'estoque';
