-- O VALOR COMBINADO ANTES DE EXISTIR ORDEM
--
-- O passo 1 do dia de quem atende é o orçamento — não o orçamento técnico, que
-- só nasce com o aparelho na bancada, mas o que se combina no telefone: a
-- retirada custa tanto, a avaliação custa tanto, o deslocamento é por conta de
-- quem. Isso era dito, acertado, e não ficava em lugar nenhum: quando o cliente
-- ligava duas semanas depois perguntando "mas não era 250?", a resposta era a
-- memória de quem atendeu.
--
-- Dois campos, os dois NULOS e nulos no que já existe. Zero seria pior que
-- nulo: zero diz "combinamos que é de graça", e nulo diz "não foi combinado
-- nada" — que é a verdade de toda ordem aberta antes desta coluna existir.
--
-- Centavos inteiros, como todo dinheiro deste banco. Ponto flutuante em valor
-- que alguém vai cobrar é como se perde um centavo por arredondamento e se
-- ganha uma discussão.

ALTER TABLE "ordens" ADD COLUMN "valorPrevioCentavos" INTEGER;
ALTER TABLE "ordens" ADD COLUMN "condicaoCombinada"   TEXT;
