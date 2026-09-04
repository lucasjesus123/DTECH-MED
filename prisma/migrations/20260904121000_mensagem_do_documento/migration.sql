-- A MENSAGEM PASSA A DIZER QUAL DOCUMENTO ELA ENTREGOU.
--
-- A tela de modelos mostra, por documento, se ele chegou ao cliente. Sem esta
-- coluna, a única maneira de ligar uma coisa à outra seria adivinhar pelo
-- relógio — "a mensagem mais próxima do horário em que o papel foi gerado" —, e
-- adivinhação erra justamente no dia movimentado, que é quando alguém abre a
-- tela para conferir.
--
-- Nulo em todas as mensagens que já existem, e nas que anunciam etapa: elas não
-- entregam documento nenhum.
ALTER TABLE "mensagens_whatsapp" ADD COLUMN IF NOT EXISTS "documentoId" TEXT;

-- SET NULL, e não CASCADE: apagar um documento não pode apagar a prova de que
-- ele foi enviado ao cliente.
ALTER TABLE "mensagens_whatsapp"
  ADD CONSTRAINT "mensagens_whatsapp_documentoId_fkey"
  FOREIGN KEY ("documentoId") REFERENCES "documentos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "mensagens_whatsapp_documentoId_idx"
  ON "mensagens_whatsapp" ("documentoId");
