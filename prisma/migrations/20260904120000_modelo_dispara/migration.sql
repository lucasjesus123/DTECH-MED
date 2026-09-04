-- O MODELO PASSA A SABER QUANDO ELE MESMO SAI.
--
-- Até aqui, todo modelo era passivo: alguém abria a O.S. e mandava emitir. O
-- papel que acompanha o aparelho é o caso em que isso não funciona — ele tem
-- de sair na hora em que o fato acontece, e "lembrar de emitir" é justamente o
-- que não acontece num dia cheio.
--
-- `dispararNaEtapa` guarda a etapa da esteira que faz este modelo sair sozinho
-- e ir para o cliente. Nulo é o comportamento de sempre: o modelo só sai quando
-- alguém pede.
ALTER TABLE "modelos_documento" ADD COLUMN IF NOT EXISTS "dispararNaEtapa" TEXT;

-- UM MODELO POR ETAPA, E ISSO É TRAVA DE BANCO.
--
-- Dois modelos ativos apontando para a mesma etapa mandariam DOIS documentos
-- para o cliente no mesmo instante, e a escolha de qual chega primeiro seria
-- sorteio. É a mesma disciplina do `padrao`, pelo mesmo motivo: o que a esteira
-- dispara sozinha não pode depender de acaso.
--
-- Parcial: só vale para os que de fato disparam e estão ativos. O modelo
-- aposentado sai da disputa sem perder o que estava configurado nele.
CREATE UNIQUE INDEX IF NOT EXISTS "modelos_documento_disparo_unico"
  ON "modelos_documento" ("tenantId", "tipo", "dispararNaEtapa")
  WHERE "dispararNaEtapa" IS NOT NULL AND "ativo";
