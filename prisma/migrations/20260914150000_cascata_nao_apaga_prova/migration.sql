-- =============================================================================
-- A CASCATA PASSAVA POR CIMA DA PERMISSÃO REVOGADA
-- =============================================================================
-- O papel da aplicação (`dtechmed_app`) NÃO tem DELETE em `eventos_ordem`,
-- `assinaturas`, `fotos` nem `movimentos_estoque`. Isso foi feito de propósito,
-- e é o que sustenta a frase que este sistema diz ao cliente: a trilha não pode
-- ser apagada.
--
-- Só que a frase estava pela metade. As chaves estrangeiras dessas tabelas para
-- `ordens` eram `ON DELETE CASCADE`, e a cascata do PostgreSQL NÃO passa pela
-- checagem de privilégio da tabela filha: ela roda como o sistema.
--
-- Medido, num banco de verdade, com o papel comum da aplicação: um único
-- `DELETE FROM ordens WHERE id = ...` levou junto 17 eventos, 2 assinaturas e
-- 6 fotos. A revogação protegia contra apagamento DIRETO; contra cascata, não
-- protegia nada.
--
-- -----------------------------------------------------------------------------
-- O QUE MUDA
-- -----------------------------------------------------------------------------
-- Três filhas passam a RESTRICT: `fotos`, `assinaturas` e `pecas_retiradas`.
-- São as três que guardam coisa do MUNDO — o estado em que o aparelho chegou, a
-- palavra de quem assinou com o dedo na tela, e a peça do cliente que está
-- fisicamente numa gaveta aqui. A partir daqui, nenhum caminho de código, nem
-- um `.delete()` escrito por engano daqui a dois anos, consegue destruí-las
-- junto com a ordem: o banco recusa a operação inteira.
--
-- `eventos_ordem` continua CASCADE, e isso é escolha, não esquecimento. Toda
-- ordem tem eventos desde o primeiro segundo de vida — inclusive a que foi
-- aberta com o nome errado e precisa sumir. Pôr RESTRICT ali seria proibir
-- apagar qualquer ordem, sempre, e a regra de negócio já resolve isso melhor:
-- `src/server/ordem/exclusao.ts` só libera a exclusão de ordem que ainda não
-- virou prova — sem foto, sem assinatura, sem peça, sem fatura, sem orçamento
-- aprovado e sem nunca ter sido coletada.
--
-- Ou seja: a regra decide, e o banco vira a última linha caso a regra falhe.
-- Nas ordens que a regra libera, essas três tabelas estão vazias — então o
-- RESTRICT nunca é o que impede o apagamento legítimo.
--
-- `documentos` também segue CASCADE: PDF gerado se refaz a partir da ordem, e
-- o que já foi para o WhatsApp do cliente está no celular dele.
-- =============================================================================

ALTER TABLE "fotos" DROP CONSTRAINT "fotos_ordemId_fkey";
ALTER TABLE "fotos"
  ADD CONSTRAINT "fotos_ordemId_fkey"
  FOREIGN KEY ("ordemId") REFERENCES "ordens"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "assinaturas" DROP CONSTRAINT "assinaturas_ordemId_fkey";
ALTER TABLE "assinaturas"
  ADD CONSTRAINT "assinaturas_ordemId_fkey"
  FOREIGN KEY ("ordemId") REFERENCES "ordens"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "pecas_retiradas" DROP CONSTRAINT "pecas_retiradas_ordemId_fkey";
ALTER TABLE "pecas_retiradas"
  ADD CONSTRAINT "pecas_retiradas_ordemId_fkey"
  FOREIGN KEY ("ordemId") REFERENCES "ordens"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
