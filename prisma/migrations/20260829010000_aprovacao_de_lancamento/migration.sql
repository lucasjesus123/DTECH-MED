-- =============================================================================
-- APROVAÇÃO DE LANÇAMENTO — quem lança não é quem aprova
-- =============================================================================
-- Até aqui uma conta nascia e podia ser baixada pela mesma pessoa, no mesmo
-- minuto. Numa empresa de sete pessoas isso não é descuido de programação: é a
-- ausência do controle mais básico que existe sobre dinheiro.
--
-- O nome disso é SEGREGAÇÃO DE FUNÇÃO, e a ideia é velha porque funciona: quem
-- registra a obrigação não pode ser quem confirma que ela é legítima. Sem essa
-- separação, uma conta a pagar inventada — para um fornecedor que não existe,
-- no valor que a pessoa quiser — percorre o sistema inteiro sem nunca passar
-- por outro par de olhos, e some no meio de duzentas contas verdadeiras.
--
-- -----------------------------------------------------------------------------
-- O QUE MUDA NA PRÁTICA
-- -----------------------------------------------------------------------------
-- Lançar continua como era. O que passa a exigir aprovação é a BAIXA — o
-- momento em que o dinheiro efetivamente sai ou entra. É lá que o controle vale
-- alguma coisa; barrar o lançamento só empurraria a conversa para antes de o
-- fato existir.
--
-- -----------------------------------------------------------------------------
-- POR QUE DUAS COLUNAS, E NÃO UM BOOLEANO
-- -----------------------------------------------------------------------------
-- `aprovado = true` responde "está aprovado?" e nada mais. Quando aparecer a
-- pergunta que sempre aparece — "quem liberou isso, e quando?" — o booleano não
-- tem resposta, e a trilha de auditoria vira o único lugar onde procurar.
--
-- `aprovadoEm` + `aprovadoPorId` respondem as três de uma vez, na própria linha
-- que está sendo discutida. O nome vai junto porque o id some se a pessoa
-- deixar a empresa, e é o nome que a tela mostra.
-- =============================================================================

ALTER TABLE public.lancamentos
  ADD COLUMN IF NOT EXISTS "aprovadoEm"     timestamp(3),
  ADD COLUMN IF NOT EXISTS "aprovadoPorId"  text,
  ADD COLUMN IF NOT EXISTS "aprovadoPorNome" text;

-- O índice da fila: "o que está esperando aprovação" é a pergunta que abre a
-- aba nova, e ela roda toda vez que alguém entra no Financeiro.
CREATE INDEX IF NOT EXISTS "lancamentos_tenantId_aprovadoEm_idx"
  ON public.lancamentos ("tenantId", "aprovadoEm");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lancamentos_aprovadoPorId_fkey') THEN
    ALTER TABLE public.lancamentos
      ADD CONSTRAINT "lancamentos_aprovadoPorId_fkey" FOREIGN KEY ("aprovadoPorId")
      REFERENCES public.usuarios("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END
$$;

-- -----------------------------------------------------------------------------
-- O QUE JÁ EXISTE NASCE APROVADO
-- -----------------------------------------------------------------------------
-- Sem esta linha, toda conta lançada antes de hoje apareceria na fila de
-- aprovação no dia do deploy — inclusive as que já foram pagas meses atrás.
-- A pessoa abriria o Financeiro e encontraria duzentas contas "esperando
-- aprovação", o que não é verdade: elas foram aprovadas pelo processo que
-- existia antes, que era ninguém precisar aprovar.
--
-- Aprová-las com data de agora seria mentir sobre quando; por isso o carimbo é
-- a data de criação de cada uma, e o nome é explícito sobre o que aconteceu.
UPDATE public.lancamentos
   SET "aprovadoEm" = "criadoEm",
       "aprovadoPorNome" = 'aprovado automaticamente na migração'
 WHERE "aprovadoEm" IS NULL;
