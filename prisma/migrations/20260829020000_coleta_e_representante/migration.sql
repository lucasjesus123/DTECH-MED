-- =============================================================================
-- ENDEREÇO DE COLETA E REPRESENTANTE
-- =============================================================================
-- O cadastro do cliente tinha UM endereço, e o motorista ia nele.
--
-- Na assistência de equipamento isso é errado com frequência suficiente para
-- doer: a clínica tem sede num endereço e a sala de procedimento noutro; o
-- hospital recebe entrega pela doca dos fundos, com outra rua e outro horário;
-- o consultório do centro manda buscar no galpão do sócio. Nesses casos o
-- endereço do cadastro é onde a NOTA vai, e o endereço da coleta é outro.
--
-- Um endereço errado aqui não é dado errado no banco: é o motorista atravessando
-- a cidade e voltando de mãos vazias, com o cliente esperando.
--
-- -----------------------------------------------------------------------------
-- POR QUE `coletaMesmoEndereco` EXISTE, EM VEZ DE SÓ DEIXAR OS CAMPOS VAZIOS
-- -----------------------------------------------------------------------------
-- Campo vazio é ambíguo, e a ambiguidade cai justamente em cima do motorista:
-- ninguém sabe se "vazio" quer dizer "é o mesmo endereço" ou "ninguém perguntou
-- ainda". As duas coisas parecem iguais no banco e são opostas na rua.
--
-- A marca torna a resposta explícita. `true` é uma afirmação — alguém conferiu
-- e é o mesmo lugar. Ela nasce `true` porque é o caso comum, e porque manter o
-- comportamento de hoje para os clientes que já existem é o certo.
--
-- -----------------------------------------------------------------------------
-- O REPRESENTANTE
-- -----------------------------------------------------------------------------
-- Diferente do `contatoNome`, que já existia e é quem atende o telefone no
-- balcão. Representante é quem RESPONDE pelo cliente: assina o contrato,
-- autoriza o orçamento, aparece na nota promissória. Numa clínica costuma ser o
-- sócio; num hospital, o comprador.
--
-- Confundir os dois faz a pessoa mandar o orçamento de oito mil reais para
-- quem atende o telefone, e esperar aprovação de quem não pode dar.
-- =============================================================================

ALTER TABLE public.clientes
  -- Coleta e entrega
  ADD COLUMN IF NOT EXISTS "coletaMesmoEndereco" boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "coletaCep"           text,
  ADD COLUMN IF NOT EXISTS "coletaLogradouro"    text,
  ADD COLUMN IF NOT EXISTS "coletaNumero"        text,
  ADD COLUMN IF NOT EXISTS "coletaComplemento"   text,
  ADD COLUMN IF NOT EXISTS "coletaBairro"        text,
  ADD COLUMN IF NOT EXISTS "coletaCidade"        text,
  ADD COLUMN IF NOT EXISTS "coletaUf"            text,
  -- O que o motorista precisa saber ANTES de sair, e que não cabe em endereço:
  -- "só das 8h às 11h", "tocar no interfone 3", "entrar pela doca dos fundos".
  ADD COLUMN IF NOT EXISTS "coletaObservacao"    text,

  -- Representante
  ADD COLUMN IF NOT EXISTS "representanteNome"      text,
  ADD COLUMN IF NOT EXISTS "representanteTelefone"  text,
  ADD COLUMN IF NOT EXISTS "representanteEmail"     text,
  -- "sócio-proprietário", "gerente de compras", "responsável técnica".
  ADD COLUMN IF NOT EXISTS "representanteVinculo"   text;
