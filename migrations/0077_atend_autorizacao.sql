-- CRM: encaminhamento ao representante exige AUTORIZAÇÃO humana.
-- autorizado: NULL = não se aplica (sem representante) | 0 = pendente de autorização
--            | 1 = autorizado (aí sim o cliente é conectado e o representante entra).
ALTER TABLE atend_conversas ADD COLUMN autorizado INTEGER;
