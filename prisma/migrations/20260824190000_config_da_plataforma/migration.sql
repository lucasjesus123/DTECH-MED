-- =============================================================================
-- CONFIGURAÇÃO DA PLATAFORMA
-- =============================================================================
-- O que é do dono do SaaS e não de nenhuma franquia: hoje, o endereço e o token
-- de administração da uazapi.
--
-- A tabela NÃO tem `tenantId`, e é justamente por isso que ela precisa de uma
-- política própria. As outras tabelas são isoladas pela comparação
-- `"tenantId" = app.current_tenant_id()`; esta não tem coluna para comparar, e
-- sem política explícita o RLS ficaria valendo apenas pelo `FORCE` — ou seja,
-- ninguém leria nada, nem o servidor.
--
-- Ela abre em dois casos, e só:
--
--   1. O dono da plataforma (`app.is_super_admin()`), que é quem configura.
--   2. A janela `app.plataforma_context`, que o próprio servidor abre por um
--      instante para ler o token na hora de falar com a uazapi. Existe porque a
--      criação da instância é pedida por um GESTOR de franquia — a chave é da
--      plataforma, mas quem aperta o botão é a empresa. Sem essa janela, o
--      gestor não conseguiria conectar o WhatsApp da própria casa.
--
-- Escrever é só do caso 1. A janela lê e não grava — é para isso que ela serve,
-- e uma janela que grava deixa de ser janela.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.config_plataforma (
  chave             text PRIMARY KEY,
  valor             text NOT NULL,
  sigiloso          boolean NOT NULL DEFAULT false,
  "atualizadoEm"    timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizadoPorId" text
);

-- A janela estreita do servidor.
CREATE OR REPLACE FUNCTION app.is_plataforma_context()
RETURNS boolean
LANGUAGE sql
STABLE
PARALLEL SAFE
AS $$
  SELECT COALESCE(current_setting('app.plataforma_context', true), '') = 'on';
$$;

ALTER TABLE public.config_plataforma ENABLE ROW LEVEL SECURITY;
-- FORCE prende o DONO da tabela junto. Sem ele, o papel que roda as migrações
-- continuaria enxergando tudo — e é com esse papel que um script de manutenção
-- roda no dia em que alguém tiver pressa.
ALTER TABLE public.config_plataforma FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS config_plataforma_leitura ON public.config_plataforma;
CREATE POLICY config_plataforma_leitura ON public.config_plataforma
  FOR SELECT
  USING (app.is_super_admin() OR app.is_plataforma_context());

DROP POLICY IF EXISTS config_plataforma_escrita ON public.config_plataforma;
CREATE POLICY config_plataforma_escrita ON public.config_plataforma
  FOR ALL
  USING (app.is_super_admin())
  WITH CHECK (app.is_super_admin());

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dtechmed_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON TABLE public.config_plataforma TO dtechmed_app';
    -- Apagar não: um token some por engano e o WhatsApp da rede inteira para.
    -- Trocar o valor é o caminho, e ele deixa `atualizadoEm` para trás.
    EXECUTE 'REVOKE DELETE ON TABLE public.config_plataforma FROM dtechmed_app';
    RAISE NOTICE 'config_plataforma: leitura e escrita concedidas, DELETE revogado';
  ELSE
    RAISE NOTICE 'papel dtechmed_app não existe aqui; nada a conceder';
  END IF;
END
$$;
