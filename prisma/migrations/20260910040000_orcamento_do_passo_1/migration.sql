-- =============================================================================
-- O ORÇAMENTO DO PASSO 1 — a proposta que existe antes da ordem
-- =============================================================================
-- O passo a passo do dono começa em ORÇAMENTO e só no 2 abre a O.S. O sistema
-- pulava o 1: guardava um `valorPrevioCentavos` solto na ordem — "o combinado
-- na abertura" — e chamava isso de orçamento. Não era. Não tinha itens, não
-- saía para o cliente, não tinha validade e ninguém aprovava nada.
--
-- Esta é a peça que faltava: uma proposta com itens, validade, link próprio, e
-- a assinatura do cliente do outro lado. Aprovada, ela vira a O.S. do passo 2
-- com um clique, levando o valor junto.
--
-- POR QUE TABELA NOVA, E NÃO `orcamentos` COM `ordemId` NULO
-- ----------------------------------------------------------
-- `orcamentos` é o preço de um aparelho DIAGNOSTICADO que já está na oficina:
-- nasce do laudo e a máquina de estados o exige no passo 7. Afrouxar `ordemId`
-- ali obrigaria toda consulta que hoje faz `orcamento.ordem.cliente` a checar
-- nulo — portal do cliente, PDF, funil do Comercial, validação da máquina. Uma
-- delas esqueceria, e o erro apareceria na tela de alguém, não no compilador.
-- =============================================================================

CREATE TYPE "StatusProposta" AS ENUM (
  'RASCUNHO', 'ENVIADA', 'APROVADA', 'RECUSADA', 'EXPIRADA', 'CANCELADA'
);

CREATE TABLE public.propostas (
  "id"                   TEXT PRIMARY KEY,
  "tenantId"             TEXT NOT NULL,
  "numero"               INTEGER NOT NULL,
  "status"               "StatusProposta" NOT NULL DEFAULT 'RASCUNHO',
  "clienteId"            TEXT NOT NULL,
  "leadId"               TEXT,
  "equipamentoDescricao" TEXT NOT NULL,
  "necessidade"          TEXT,
  "observacoes"          TEXT,
  "condicoesPagamento"   TEXT,
  "garantiaDias"         INTEGER NOT NULL DEFAULT 90,
  "prazoExecucaoDias"    INTEGER NOT NULL DEFAULT 7,
  "subtotalPecas"        INTEGER NOT NULL DEFAULT 0,
  "subtotalServicos"     INTEGER NOT NULL DEFAULT 0,
  "descontoCentavos"     INTEGER NOT NULL DEFAULT 0,
  "acrescimoCentavos"    INTEGER NOT NULL DEFAULT 0,
  "totalCentavos"        INTEGER NOT NULL DEFAULT 0,
  "validoAte"            TIMESTAMP(3),
  "tokenPublico"         TEXT NOT NULL,
  "autorId"              TEXT,
  "autorNome"            TEXT,
  "enviadaEm"            TIMESTAMP(3),
  "respondidaEm"         TIMESTAMP(3),
  "aprovadaPorNome"      TEXT,
  "aprovadaPorDocumento" TEXT,
  "motivoRecusa"         TEXT,
  "ordemGeradaId"        TEXT,
  "criadoEm"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizadoEm"         TIMESTAMP(3) NOT NULL
);

CREATE UNIQUE INDEX "propostas_tokenPublico_key" ON public.propostas("tokenPublico");
-- Uma proposta vira UMA ordem. Sem isto, aprovar duas vezes abriria duas O.S.
-- para o mesmo serviço, e o cliente receberia duas cobranças.
CREATE UNIQUE INDEX "propostas_ordemGeradaId_key" ON public.propostas("ordemGeradaId");
CREATE UNIQUE INDEX "propostas_tenantId_numero_key" ON public.propostas("tenantId", "numero");
CREATE INDEX "propostas_tenantId_status_criadoEm_idx" ON public.propostas("tenantId", "status", "criadoEm");
CREATE INDEX "propostas_tenantId_clienteId_idx" ON public.propostas("tenantId", "clienteId");

ALTER TABLE public.propostas
  ADD CONSTRAINT "propostas_tenantId_fkey" FOREIGN KEY ("tenantId")
    REFERENCES public.tenants("id") ON DELETE CASCADE ON UPDATE CASCADE,
  -- RESTRICT no cliente: apagar quem tem proposta enviada apagaria a prova do
  -- que foi oferecido e por quanto.
  ADD CONSTRAINT "propostas_clienteId_fkey" FOREIGN KEY ("clienteId")
    REFERENCES public.clientes("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "propostas_leadId_fkey" FOREIGN KEY ("leadId")
    REFERENCES public.leads("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "propostas_autorId_fkey" FOREIGN KEY ("autorId")
    REFERENCES public.usuarios("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "propostas_ordemGeradaId_fkey" FOREIGN KEY ("ordemGeradaId")
    REFERENCES public.ordens("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE public.proposta_itens (
  "id"                 TEXT PRIMARY KEY,
  "tenantId"           TEXT NOT NULL,
  "propostaId"         TEXT NOT NULL,
  "tipo"               "TipoItemOrcamento" NOT NULL DEFAULT 'SERVICO',
  "descricao"          TEXT NOT NULL,
  "pecaId"             TEXT,
  "quantidade"         DECIMAL(12,3) NOT NULL DEFAULT 1,
  "valorUnitCentavos"  INTEGER NOT NULL DEFAULT 0,
  "valorTotalCentavos" INTEGER NOT NULL DEFAULT 0,
  "ordem"              INTEGER NOT NULL DEFAULT 0,
  "criadoEm"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "proposta_itens_propostaId_ordem_idx" ON public.proposta_itens("propostaId", "ordem");

ALTER TABLE public.proposta_itens
  ADD CONSTRAINT "proposta_itens_tenantId_fkey" FOREIGN KEY ("tenantId")
    REFERENCES public.tenants("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "proposta_itens_propostaId_fkey" FOREIGN KEY ("propostaId")
    REFERENCES public.propostas("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "proposta_itens_pecaId_fkey" FOREIGN KEY ("pecaId")
    REFERENCES public.pecas("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- -----------------------------------------------------------------------------
-- RLS — o mesmo desenho de todas as tabelas de negócio
-- -----------------------------------------------------------------------------
-- Uma franquia não vê a proposta da outra, e quem garante isso é o Postgres.
-- FORCE prende o DONO da tabela junto. O `infra/subir.sh` derruba o deploy se
-- alguma tabela ficar sem isto.
ALTER TABLE public.propostas       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.propostas       FORCE  ROW LEVEL SECURITY;
ALTER TABLE public.proposta_itens  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proposta_itens  FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS propostas_tenant ON public.propostas;
CREATE POLICY propostas_tenant ON public.propostas
  FOR ALL
  USING ("tenantId" = app.current_tenant_id() OR app.is_super_admin())
  WITH CHECK ("tenantId" = app.current_tenant_id() OR app.is_super_admin());

DROP POLICY IF EXISTS proposta_itens_tenant ON public.proposta_itens;
CREATE POLICY proposta_itens_tenant ON public.proposta_itens
  FOR ALL
  USING ("tenantId" = app.current_tenant_id() OR app.is_super_admin())
  WITH CHECK ("tenantId" = app.current_tenant_id() OR app.is_super_admin());

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dtechmed_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.propostas TO dtechmed_app';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.proposta_itens TO dtechmed_app';
  END IF;
END
$$;

-- -----------------------------------------------------------------------------
-- O token da proposta vira escopo de empresa — igual ao da ordem
-- -----------------------------------------------------------------------------
-- O cliente abre o link sem sessão, então não há contexto de empresa e o RLS,
-- corretamente, devolve zero linhas. A saída ERRADA seria uma policy pública em
-- `propostas`: qualquer consulta sem contexto passaria a enxergar a carteira
-- comercial inteira de todas as franquias — quem pediu preço de quê, e por
-- quanto. A saída certa é a mesma da ordem: uma função que devolve APENAS o id
-- da empresa. O token prova o direito àquela proposta; não vira passe livre.
CREATE OR REPLACE FUNCTION app.empresa_da_proposta(_token text)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
STABLE
-- search_path fixo: sem isso, um schema plantado antes de `public` sequestraria
-- a resolução de nomes dentro de uma função que roda com privilégio de dono.
SET search_path = public, pg_temp
AS $$
  SELECT "tenantId"
    FROM propostas
   WHERE "tokenPublico" = _token
   LIMIT 1;
$$;

REVOKE ALL ON FUNCTION app.empresa_da_proposta(text) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dtechmed_app') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION app.empresa_da_proposta(text) TO dtechmed_app';
  END IF;
END
$$;
