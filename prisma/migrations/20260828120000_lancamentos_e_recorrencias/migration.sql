-- =============================================================================
-- LANÇAMENTOS E RECORRÊNCIAS — o dinheiro que não nasce de uma ordem
-- =============================================================================
-- O sistema já sabia cobrar serviço: `faturas` é 1 para 1 com `ordens`, porque a
-- cobrança é do reparo daquele equipamento. Isso responde "quanto o cliente me
-- deve" e não responde nada sobre a empresa: aluguel, energia, contador,
-- salário, a peça comprada no fornecedor, e o recebimento avulso que não passou
-- pela esteira.
--
-- Sem esse outro lado, o Financeiro mostrava metade da história — e metade da
-- história sobre dinheiro é pior que nenhuma, porque parece completa.
--
-- -----------------------------------------------------------------------------
-- POR QUE UMA TABELA NOVA E NÃO UM CAMPO EM `faturas`
-- -----------------------------------------------------------------------------
-- `faturas.ordemId` é NOT NULL e UNIQUE. Um aluguel não tem ordem. Afrouxar
-- aquela coluna para caber conta de luz quebraria a garantia que ela existe para
-- dar: uma ordem, uma fatura, sem duplicata.
--
-- São dois conceitos com ciclos de vida diferentes. A fatura nasce da esteira e
-- morre conferida pela gestão; o lançamento nasce à mão ou de uma recorrência e
-- morre pago. Forçá-los na mesma tabela obrigaria metade das colunas a serem
-- nulas em metade das linhas — e é assim que uma tabela deixa de significar algo.
--
-- A TELA junta os dois. O BANCO os mantém separados. É nessa ordem que funciona.
--
-- -----------------------------------------------------------------------------
-- PARCELAS
-- -----------------------------------------------------------------------------
-- Uma compra em 3x vira TRÊS linhas, com vencimentos diferentes, ligadas por
-- `grupo`. Não é uma linha com "parcelas = 3".
--
-- O motivo é o mês: a segunda parcela vence em setembro e tem que aparecer no
-- caixa de setembro, não no de agosto. Uma linha só com contador não consegue
-- estar em três meses ao mesmo tempo, e toda consulta de fluxo teria de saber
-- expandir isso — em todo lugar, para sempre.
-- =============================================================================

-- Pagar ou receber. As duas metades do caixa, na mesma tabela porque tudo o que
-- se faz com uma se faz com a outra: lançar, parcelar, dar baixa, somar no mês.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'TipoLancamento') THEN
    CREATE TYPE "TipoLancamento" AS ENUM ('PAGAR', 'RECEBER');
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS public.lancamentos (
  "id"            text PRIMARY KEY,
  "tenantId"      text NOT NULL,
  "tipo"          "TipoLancamento" NOT NULL,

  "descricao"     text NOT NULL,
  /// Texto livre com sugestões na tela, e não lista fechada: cada empresa
  /// organiza o próprio plano de contas, e uma lista fixa vira "Outros" com
  /// 80% dos lançamentos dentro.
  "categoria"     text,

  -- A quem se paga, ou de quem se recebe.
  -- `clienteId` quando é alguém que já está na carteira — assim a ficha do
  -- cliente consegue somar o que ele deve. `contraparte` é o texto para o
  -- resto: fornecedor, prefeitura, o contador.
  "clienteId"     text,
  "contraparte"   text,

  "valorCentavos" integer NOT NULL,
  "vencimento"    timestamp(3) NOT NULL,

  -- A baixa. `pagoEm` nulo = em aberto. Guardamos o valor pago separado do
  -- previsto porque eles divergem: desconto, juros, pagamento a menor.
  "pagoEm"            timestamp(3),
  "valorPagoCentavos" integer NOT NULL DEFAULT 0,
  "forma"             "FormaPagamento",

  -- Parcelas: linhas irmãs ligadas por `grupo`.
  "grupo"    text,
  "parcela"  integer NOT NULL DEFAULT 1,
  "parcelas" integer NOT NULL DEFAULT 1,

  -- De qual modelo mensal esta linha nasceu, quando nasceu de um.
  "recorrenciaId" text,

  "observacoes" text,

  "autorId"   text,
  "autorNome" text,

  "criadoEm"     timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizadoEm" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  -- Dinheiro não é negativo. O sinal está no `tipo`, e um valor negativo aqui
  -- inverteria o significado da linha sem ninguém perceber na soma.
  CONSTRAINT "lancamentos_valor_positivo" CHECK ("valorCentavos" > 0),
  CONSTRAINT "lancamentos_pago_nao_negativo" CHECK ("valorPagoCentavos" >= 0),
  CONSTRAINT "lancamentos_parcela_valida" CHECK ("parcela" >= 1 AND "parcela" <= "parcelas")
);

-- O índice que sustenta a tela: "as contas DESTE mês, deste tipo".
CREATE INDEX IF NOT EXISTS "lancamentos_tenantId_tipo_vencimento_idx"
  ON public.lancamentos ("tenantId", "tipo", "vencimento");
-- O que está em aberto e já venceu — o número que abre a tela.
CREATE INDEX IF NOT EXISTS "lancamentos_tenantId_pagoEm_vencimento_idx"
  ON public.lancamentos ("tenantId", "pagoEm", "vencimento");
CREATE INDEX IF NOT EXISTS "lancamentos_tenantId_grupo_idx"
  ON public.lancamentos ("tenantId", "grupo");
CREATE INDEX IF NOT EXISTS "lancamentos_tenantId_clienteId_idx"
  ON public.lancamentos ("tenantId", "clienteId");

-- =============================================================================
-- RECORRÊNCIAS — o que se repete todo mês
-- =============================================================================
-- Aluguel, energia, internet, contador, o contrato de manutenção que o cliente
-- paga mensalmente. Lançar isso à mão doze vezes por ano é o tipo de trabalho
-- que alguém esquece em fevereiro e só descobre em abril.
--
-- A recorrência é um MODELO, não um lançamento. Ela não aparece no caixa: ela
-- GERA a linha do mês, e a linha gerada é comum como qualquer outra — dá para
-- editar o valor daquele mês (a conta de luz nunca vem igual) sem mexer no
-- modelo.
--
-- `ultimoMesGerado` é o que torna a geração IDEMPOTENTE. Apertar "gerar agora"
-- duas vezes no mesmo mês não pode criar a conta duas vezes, e é exatamente o
-- que alguém faz quando a tela demora a responder.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.recorrencias (
  "id"            text PRIMARY KEY,
  "tenantId"      text NOT NULL,
  "tipo"          "TipoLancamento" NOT NULL,

  "descricao"     text NOT NULL,
  "categoria"     text,
  "clienteId"     text,
  "contraparte"   text,
  "valorCentavos" integer NOT NULL,

  -- Dia do mês em que vence. Fevereiro e os meses de 30 dias são resolvidos na
  -- geração, empurrando para o último dia do mês — nunca para o mês seguinte,
  -- porque uma conta que vence dia 31 vence NAQUELE mês.
  "diaVencimento" integer NOT NULL,

  "ativo"  boolean NOT NULL DEFAULT true,
  "inicio" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "fim"    timestamp(3),

  -- 'AAAA-MM' do último mês já gerado. Texto e não data: o que importa é a
  -- competência, e comparar texto de mês é exato — comparar data exige pensar
  -- em fuso toda vez.
  "ultimoMesGerado" text,

  "observacoes" text,

  "criadoEm"     timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizadoEm" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "recorrencias_valor_positivo" CHECK ("valorCentavos" > 0),
  CONSTRAINT "recorrencias_dia_valido" CHECK ("diaVencimento" >= 1 AND "diaVencimento" <= 31)
);

CREATE INDEX IF NOT EXISTS "recorrencias_tenantId_ativo_idx"
  ON public.recorrencias ("tenantId", "ativo");

-- -----------------------------------------------------------------------------
-- Chaves estrangeiras
-- -----------------------------------------------------------------------------
-- `clienteId` é SET NULL e não CASCADE: apagar um cliente não pode apagar o
-- histórico de dinheiro que entrou por causa dele. A linha do caixa fica, sem
-- dono, que é a verdade — e é o que o contador precisa ver.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lancamentos_tenantId_fkey') THEN
    ALTER TABLE public.lancamentos
      ADD CONSTRAINT "lancamentos_tenantId_fkey" FOREIGN KEY ("tenantId")
      REFERENCES public.tenants("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lancamentos_clienteId_fkey') THEN
    ALTER TABLE public.lancamentos
      ADD CONSTRAINT "lancamentos_clienteId_fkey" FOREIGN KEY ("clienteId")
      REFERENCES public.clientes("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lancamentos_autorId_fkey') THEN
    ALTER TABLE public.lancamentos
      ADD CONSTRAINT "lancamentos_autorId_fkey" FOREIGN KEY ("autorId")
      REFERENCES public.usuarios("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  -- Apagar a recorrência NÃO apaga as contas que ela já gerou: elas viraram
  -- caixa, e caixa não some porque alguém encerrou um contrato.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lancamentos_recorrenciaId_fkey') THEN
    ALTER TABLE public.lancamentos
      ADD CONSTRAINT "lancamentos_recorrenciaId_fkey" FOREIGN KEY ("recorrenciaId")
      REFERENCES public.recorrencias("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'recorrencias_tenantId_fkey') THEN
    ALTER TABLE public.recorrencias
      ADD CONSTRAINT "recorrencias_tenantId_fkey" FOREIGN KEY ("tenantId")
      REFERENCES public.tenants("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'recorrencias_clienteId_fkey') THEN
    ALTER TABLE public.recorrencias
      ADD CONSTRAINT "recorrencias_clienteId_fkey" FOREIGN KEY ("clienteId")
      REFERENCES public.clientes("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END
$$;

-- -----------------------------------------------------------------------------
-- RLS — o mesmo desenho de todas as tabelas de negócio
-- -----------------------------------------------------------------------------
-- Uma franquia não vê o caixa da outra, e quem garante isso é o Postgres. FORCE
-- prende o DONO da tabela junto: sem ele, o papel que roda as migrações
-- continuaria enxergando tudo, e é com esse papel que um script de manutenção
-- roda no dia em que alguém tiver pressa.
ALTER TABLE public.lancamentos  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lancamentos  FORCE  ROW LEVEL SECURITY;
ALTER TABLE public.recorrencias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recorrencias FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lancamentos_tenant ON public.lancamentos;
CREATE POLICY lancamentos_tenant ON public.lancamentos
  FOR ALL
  USING ("tenantId" = app.current_tenant_id() OR app.is_super_admin())
  WITH CHECK ("tenantId" = app.current_tenant_id() OR app.is_super_admin());

DROP POLICY IF EXISTS recorrencias_tenant ON public.recorrencias;
CREATE POLICY recorrencias_tenant ON public.recorrencias
  FOR ALL
  USING ("tenantId" = app.current_tenant_id() OR app.is_super_admin())
  WITH CHECK ("tenantId" = app.current_tenant_id() OR app.is_super_admin());

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dtechmed_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.lancamentos TO dtechmed_app';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.recorrencias TO dtechmed_app';
  END IF;
END
$$;
