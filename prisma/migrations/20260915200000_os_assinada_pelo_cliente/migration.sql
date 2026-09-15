-- A O.S. que o cliente devolveu assinada: o primeiro documento que ENTRA.
--
-- Todos os outros tipos nascem do nosso gerador. Este chega de fora — do
-- gov.br, ou do cliente que imprimiu, assinou e fotografou —, e por isso ganha
-- tipo próprio: numa auditoria, "saiu daqui" e "veio de fora" não são a mesma
-- afirmação, e um tipo só apagaria a diferença.
ALTER TYPE "TipoDocumento" ADD VALUE IF NOT EXISTS 'OS_ASSINADA_CLIENTE';

-- Quem anexou e com que nome o arquivo chegou. Nulos nos documentos que o
-- sistema gerou, que é o caso de todos os que já existem.
ALTER TABLE "documentos" ADD COLUMN IF NOT EXISTS "anexadoPorNome" TEXT;
ALTER TABLE "documentos" ADD COLUMN IF NOT EXISTS "nomeOriginal" TEXT;
