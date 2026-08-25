-- =============================================================================
-- AS ABAS DO SISTEMA, POR PESSOA
-- =============================================================================
-- O papel diz o que a pessoa PODE FAZER; as abas dizem o que ela VÊ. Eram duas
-- perguntas tratadas como uma só, e por isso ninguém conseguia dizer "esta
-- pessoa aqui só mexe com dinheiro".
--
-- `text[]` e não uma tabela de ligação: é uma lista curta e fechada de chaves
-- que só o próprio código conhece, sempre lida inteira, junto com o usuário, e
-- nunca consultada de trás para frente ("quem tem a aba X?"). Uma tabela extra
-- aqui custaria um JOIN em toda leitura de sessão para não responder nada que
-- já não esteja respondido.
--
-- O DEFAULT é a lista VAZIA, e isso importa: vazio significa "o padrão do papel
-- dela". Assim, as pessoas que já existem continuam vendo exatamente o que
-- viam ontem, e ninguém precisa sair remarcando acesso de gente que já
-- trabalha. A migração não toca em uma linha sequer de dado existente.
-- =============================================================================

ALTER TABLE public.usuarios
  ADD COLUMN IF NOT EXISTS telas text[] NOT NULL DEFAULT '{}';
