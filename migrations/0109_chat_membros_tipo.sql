-- Membro pode ser 'externo' (usa outro número de WhatsApp, canal ext:<id>) ou
-- 'interno' (usa o próprio sistema — conversa por DM, canal dm:A|B). A lista da
-- Comunicação interna começa vazia e é montada só com quem for adicionado aqui.
ALTER TABLE chat_membros ADD COLUMN tipo TEXT NOT NULL DEFAULT 'externo';
-- Internos não têm número: permitir telefone vazio (a coluna já aceita texto).
