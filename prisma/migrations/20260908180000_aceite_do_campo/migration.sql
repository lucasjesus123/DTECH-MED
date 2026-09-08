-- O ACEITE DE QUEM VAI FAZER O TRABALHO
--
-- A central designava e o sistema tratava isso como combinado. Não é: designar
-- é uma linha escrita por quem está no escritório; aceitar é alguém dizendo que
-- vai. Entre as duas cabe um motorista de folga, um celular sem bateria e um
-- aparelho que ninguém foi buscar.
--
-- Os dois campos são NULOS e ficam nulos no que já existe. Preencher com a data
-- de hoje faria toda corrida antiga parecer aceita agora; preencher com a data
-- da criação inventaria um aceite que nunca houve. Nulo é a verdade: aconteceu
-- antes desta regra existir.

ALTER TABLE "agendamentos" ADD COLUMN "aceitoEm" TIMESTAMP(3);
ALTER TABLE "ordens"       ADD COLUMN "tecnicoAceitouEm" TIMESTAMP(3);

-- Quem ainda não aceitou é a pergunta que a central faz o dia inteiro ("a
-- retirada das 9h está de pé?"), e ela varre as paradas do dia por empresa.
-- Sem índice, essa varredura cresce com o histórico inteiro da franquia.
CREATE INDEX "agendamentos_tenantId_aceitoEm_previstoPara_idx"
  ON "agendamentos"("tenantId", "aceitoEm", "previstoPara");
