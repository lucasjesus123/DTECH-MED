-- =============================================================================
-- A FICHA DE QUEM TRABALHA NA EMPRESA
-- =============================================================================
-- O cadastro de usuário tinha nome, e-mail, telefone e perfil — o suficiente
-- para ENTRAR no sistema, e insuficiente para ser a ficha da pessoa.
--
-- Duas necessidades concretas puxaram estes campos:
--
--   documento  o termo de retirada leva o nome e o CPF de quem recebeu o
--              equipamento; do nosso lado, leva quem entregou. Sem o campo,
--              esse dado era digitado à mão a cada entrega.
--
--   endereço   ficha de funcionário que a empresa precisa ter, e rota: o
--              motorista que sai de casa direto para a primeira retirada não
--              passa pela oficina, e o ponto de partida dele muda a ordem das
--              paradas do dia.
--
-- Todos opcionais. Uma coluna obrigatória acrescentada a uma tabela que já tem
-- gente dentro obriga a inventar valor para quem já existe, e valor inventado
-- em ficha de pessoa é pior que campo vazio.
-- =============================================================================

ALTER TABLE public.usuarios
  ADD COLUMN IF NOT EXISTS documento   text,
  ADD COLUMN IF NOT EXISTS cep         text,
  ADD COLUMN IF NOT EXISTS logradouro  text,
  ADD COLUMN IF NOT EXISTS numero      text,
  ADD COLUMN IF NOT EXISTS complemento text,
  ADD COLUMN IF NOT EXISTS bairro      text,
  ADD COLUMN IF NOT EXISTS cidade      text,
  ADD COLUMN IF NOT EXISTS uf          text;
