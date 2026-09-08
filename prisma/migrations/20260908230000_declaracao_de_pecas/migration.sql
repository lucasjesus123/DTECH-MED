-- "NÃO USEI PEÇA NENHUMA" PRECISA SER DITO POR ALGUÉM
--
-- O serviço só fecha depois que se sabe o que saiu da prateleira. Quando saiu
-- peça, o próprio movimento de estoque responde — ele tem quem, quando e
-- quanto. Quando NÃO saiu, não existe movimento nenhum, e a ausência de
-- registro é indistinguível de "o técnico esqueceu de lançar".
--
-- É a diferença que faz o estoque derivar: a fonte sai fisicamente para o
-- aparelho do cliente e o sistema segue dizendo 24 unidades na prateleira,
-- porque ninguém foi obrigado a dizer nada.
--
-- Esta coluna é a resposta explícita. Nula em tudo que já existe: aquelas
-- ordens fecharam antes desta regra, e preencher com a data de hoje inventaria
-- uma declaração que ninguém fez.
--
-- O NOME É CONGELADO junto, como em todo registro de prova deste banco: se a
-- pessoa for renomeada ou desligada depois, o histórico continua contando a
-- verdade da época.

ALTER TABLE "ordens" ADD COLUMN "semPecaDeclaradoEm"      TIMESTAMP(3);
ALTER TABLE "ordens" ADD COLUMN "semPecaDeclaradoPorNome" TEXT;
