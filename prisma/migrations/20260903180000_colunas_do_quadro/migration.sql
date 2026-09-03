-- =============================================================================
-- AS COLUNAS DO QUADRO — o processo da casa, por cima da esteira
-- =============================================================================
-- O pedido foi um quadro Kanban da O.S. em que a empresa CRIA o próprio fluxo
-- interno, e mover o cartão anda o processo área por área.
--
-- -----------------------------------------------------------------------------
-- O QUE NÃO PODE VIRAR EDITÁVEL, E POR QUÊ
-- -----------------------------------------------------------------------------
-- As 18 etapas NÃO viram cadastro. Cada evento da linha do tempo carrega o
-- resumo criptográfico do anterior, e a ficha da ordem confere a corrente
-- inteira ao abrir — é isso que faz o prontuário dizer "histórico íntegro" e
-- ter valor de prova, e não só de anotação. Uma lista de etapas que qualquer
-- administrador edita quebra a corrente no dia em que alguém renomeia ou apaga
-- uma etapa que já está gravada em mil eventos.
--
-- Também não é só a corrente: a máquina de estados sabe QUAIS transições são
-- legais, QUEM pode fazer cada uma e O QUE cada uma exige (a coleta pede
-- assinatura, o faturamento pede fatura). Nada disso sobrevive a uma lista
-- editável.
--
-- -----------------------------------------------------------------------------
-- O QUE VIRA EDITÁVEL, ENTÃO
-- -----------------------------------------------------------------------------
-- A LEITURA. Esta tabela guarda as colunas do quadro e QUAIS ETAPAS cada uma
-- agrupa. A empresa escreve o processo com as palavras dela — "Comp. peças",
-- "Aprovação", "S/ reparo" — e diz o que cada coluna significa em termos da
-- esteira. Mover o cartão continua sendo uma transição de verdade, com a mesma
-- trava de papel e o mesmo registro na trilha.
--
-- É a mesma separação que o resto do sistema já usa: a CHAVE é estável e o
-- RÓTULO é a palavra da tela.
--
-- -----------------------------------------------------------------------------
-- `etapas` É ARRAY, E ISSO RESOLVE O CASO REAL
-- -----------------------------------------------------------------------------
-- Uma coluna quase nunca é uma etapa: "Em andamento" para quem toca a oficina
-- são recebido, em análise e em manutenção juntos. Uma tabela de ligação
-- resolveria também, com três consultas a mais e nenhum ganho — o conjunto é
-- pequeno, fechado (21 valores) e lido inteiro toda vez que o quadro abre.
--
-- text[] e não EtapaOrdem[]: assim uma etapa nova no enum não exige migração
-- desta tabela, e uma etapa REMOVIDA do enum não trava a leitura do quadro.
-- Em troca, quem lê precisa ignorar valor desconhecido — e a tela faz isso.
--
-- -----------------------------------------------------------------------------
-- A INVARIANTE QUE O BANCO NÃO CONSEGUE GARANTIR SOZINHO
-- -----------------------------------------------------------------------------
-- Nenhuma O.S. pode sumir do quadro. Uma etapa que não esteja em coluna nenhuma
-- deixaria ordens invisíveis — e ordem invisível é a pior falha possível aqui,
-- porque não parece falha: o quadro fica bonito e o aparelho de alguém está
-- parado sem ninguém ver.
--
-- Isso é regra de conjunto, entre linhas, e `CHECK` não alcança. A garantia é
-- da tela: a que não estiver em nenhuma coluna cai numa coluna "Fora do quadro"
-- desenhada na hora, com o aviso do que fazer. Preferir o aviso à recusa é
-- deliberado — recusar salvar deixaria a pessoa presa numa tela de configuração
-- sem entender o que falta.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.colunas_quadro (
  "id"       text PRIMARY KEY,
  "tenantId" text NOT NULL,

  -- A palavra da casa. É o que aparece no topo da coluna.
  "nome" text NOT NULL,

  -- Da esquerda para a direita. Inteiro esparso de propósito (10, 20, 30…):
  -- inserir uma coluna no meio não obriga a reescrever as outras todas.
  "ordem" integer NOT NULL,

  -- As etapas que esta coluna agrupa. Ver o bloco acima.
  "etapas" text[] NOT NULL DEFAULT '{}',

  -- Um tom para a barra do topo, escolhido entre os do sistema. Nulo = neutro.
  -- Guardado como NOME e não como hexadecimal: cor literal gravada no banco
  -- não acompanha a troca de tema, e viraria uma coluna verde-claro ilegível
  -- no tema escuro.
  "cor" text,

  "criadoEm"     timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizadoEm" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  -- Coluna sem nome é uma faixa vazia no quadro que ninguém sabe o que é.
  CONSTRAINT "colunas_quadro_nome_nao_vazio" CHECK (length(btrim("nome")) > 0),
  -- A cor, quando existe, é um dos tons do sistema. Sem isto entra
  -- '#ff0000' e o tema escuro fica com uma coluna gritando.
  CONSTRAINT "colunas_quadro_cor_conhecida"
    CHECK ("cor" IS NULL OR "cor" IN ('violeta', 'sinal', 'alerta', 'espera', 'acao'))
);

-- O índice que sustenta a tela: "as colunas desta empresa, na ordem".
CREATE INDEX IF NOT EXISTS "colunas_quadro_tenantId_ordem_idx"
  ON public.colunas_quadro ("tenantId", "ordem");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'colunas_quadro_tenantId_fkey') THEN
    ALTER TABLE public.colunas_quadro
      ADD CONSTRAINT "colunas_quadro_tenantId_fkey" FOREIGN KEY ("tenantId")
      REFERENCES public.tenants("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;

-- -----------------------------------------------------------------------------
-- RLS — o mesmo desenho de todas as tabelas de negócio
-- -----------------------------------------------------------------------------
-- O processo interno de uma franquia é dela. FORCE prende o DONO da tabela
-- junto: sem ele, o papel que roda as migrações continuaria enxergando tudo.
ALTER TABLE public.colunas_quadro ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.colunas_quadro FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS colunas_quadro_tenant ON public.colunas_quadro;
CREATE POLICY colunas_quadro_tenant ON public.colunas_quadro
  FOR ALL
  USING ("tenantId" = app.current_tenant_id() OR app.is_super_admin())
  WITH CHECK ("tenantId" = app.current_tenant_id() OR app.is_super_admin());

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dtechmed_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.colunas_quadro TO dtechmed_app';
  END IF;
END
$$;
