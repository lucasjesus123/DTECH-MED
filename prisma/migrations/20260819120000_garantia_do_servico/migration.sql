-- ============================================================================
-- A GARANTIA DO SERVIÇO — de número solto a data com consequência
-- ============================================================================
-- Até aqui a garantia era `garantiaDias: 90` no orçamento, e nada mais. Não
-- havia data de fim, não havia ligação entre o retorno e o serviço original, e
-- nada impedia o sistema de FATURAR um aparelho que voltou dentro do prazo.
--
-- Numa assistência técnica isso não é detalhe: "voltou em garantia" acontece
-- toda semana e é o que decide se cobra ou não. Sem a data no sistema, quem
-- decide é a memória de quem está no balcão.
--
-- Três colunas:
--
--   garantiaAte     quando a garantia deste serviço vence. Preenchida quando o
--                   equipamento é ENTREGUE — é da entrega que o prazo corre, e
--                   não da aprovação do orçamento.
--
--   ordemOrigemId   o serviço que esta ordem está honrando. Auto-relação: uma
--                   ordem aponta para a que veio antes. É o que transforma
--                   "voltou de novo" num histórico legível.
--
--   emGarantia      esta ordem é retorno de garantia. Separado de
--                   `ordemOrigemId` de propósito: existe retorno em garantia
--                   sem a ordem antiga estar no sistema (serviço feito antes da
--                   implantação), e existe ordem ligada a outra sem ser
--                   garantia (o cliente mandou o mesmo aparelho por outro
--                   defeito).
-- ============================================================================

ALTER TABLE "ordens" ADD COLUMN IF NOT EXISTS "garantiaAte"   TIMESTAMP(3);
ALTER TABLE "ordens" ADD COLUMN IF NOT EXISTS "ordemOrigemId" TEXT;
ALTER TABLE "ordens" ADD COLUMN IF NOT EXISTS "emGarantia"    BOOLEAN NOT NULL DEFAULT false;

-- `ON DELETE SET NULL`: apagar a ordem antiga não pode derrubar a nova. O
-- vínculo se perde; o serviço, não.
DO $$ BEGIN
  ALTER TABLE "ordens"
    ADD CONSTRAINT "ordens_ordemOrigemId_fkey"
    FOREIGN KEY ("ordemOrigemId") REFERENCES "ordens"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- A pergunta que a tela faz o tempo todo: "este equipamento está na garantia?"
-- Sem o índice, ela varre a tabela de ordens inteira a cada abertura de ficha.
CREATE INDEX IF NOT EXISTS "ordens_equipamentoId_garantiaAte_idx"
  ON "ordens" ("equipamentoId", "garantiaAte");
CREATE INDEX IF NOT EXISTS "ordens_ordemOrigemId_idx" ON "ordens" ("ordemOrigemId");
