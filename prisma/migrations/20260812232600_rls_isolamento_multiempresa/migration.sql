-- =============================================================================
-- ISOLAMENTO MULTIEMPRESA — Row Level Security
-- =============================================================================
-- Este arquivo é a linha de defesa que NÃO depende do código da aplicação.
--
-- A regra de ouro: o Postgres decide, não o Node. Se amanhã alguém esquecer um
-- `where tenantId` numa query, ou um endpoint receber um id trocado na URL, o
-- banco devolve zero linhas. O vazamento entre franquias precisa de DUAS falhas
-- simultâneas para acontecer, não de uma.
--
-- Como funciona na prática:
--   1. A aplicação conecta como `dtechmed_app` — papel SEM superuser e SEM
--      bypassrls. Ele é de fato constrangido pelas policies abaixo.
--   2. A cada transação, o servidor executa:
--         SET LOCAL app.tenant_id = '<id da empresa do usuário logado>'
--      O valor vem SEMPRE da sessão autenticada no servidor. Jamais de
--      parâmetro, corpo ou query string enviados pelo navegador.
--   3. Se ninguém setar o tenant, `current_setting(..., true)` devolve NULL,
--      a comparação vira NULL, e a policy nega tudo. Falha fechada, por
--      construção — o esquecimento resulta em "não vejo nada", nunca em
--      "vejo tudo".
--
-- Toda policy tem USING **e** WITH CHECK. Só USING protegeria a leitura e
-- deixaria o usuário GRAVAR uma linha carimbada para outra empresa.
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS app;

-- -----------------------------------------------------------------------------
-- Funções de contexto
-- -----------------------------------------------------------------------------

-- Empresa ativa da requisição. NULL quando não definida → nega tudo.
CREATE OR REPLACE FUNCTION app.current_tenant_id()
RETURNS text
LANGUAGE sql
STABLE
PARALLEL SAFE
AS $$
  SELECT NULLIF(current_setting('app.tenant_id', true), '');
$$;

-- Super Admin da plataforma (o dono). Escape hatch deliberado e explícito:
-- só é ligado pelo servidor quando a sessão pertence a um SUPER_ADMIN.
CREATE OR REPLACE FUNCTION app.is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE
PARALLEL SAFE
AS $$
  SELECT COALESCE(current_setting('app.is_super_admin', true), '') = 'on';
$$;

-- Contexto de autenticação. Existe porque no login ainda NÃO se sabe a empresa:
-- é preciso achar o usuário pelo e-mail para então descobrir o tenant dele.
-- Fica ligado apenas dentro das funções de login e de resolução de sessão, e
-- libera exclusivamente as tabelas `usuarios` e `sessoes` — nunca dado de
-- negócio. Janela estreita, explícita e auditável.
CREATE OR REPLACE FUNCTION app.is_auth_context()
RETURNS boolean
LANGUAGE sql
STABLE
PARALLEL SAFE
AS $$
  SELECT COALESCE(current_setting('app.auth_context', true), '') = 'on';
$$;

-- -----------------------------------------------------------------------------
-- Permissões do papel de runtime
-- -----------------------------------------------------------------------------
-- O app manipula dados, mas não a estrutura. Sem CREATE, sem DROP, sem ALTER.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dtechmed_app') THEN
    RAISE NOTICE 'Papel dtechmed_app inexistente; pulando GRANTs.';
    RETURN;
  END IF;

  EXECUTE 'GRANT USAGE ON SCHEMA public TO dtechmed_app';
  EXECUTE 'GRANT USAGE ON SCHEMA app TO dtechmed_app';
  EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO dtechmed_app';
  EXECUTE 'GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO dtechmed_app';
  -- Tabelas criadas por migrações futuras já nascem com a permissão certa.
  EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO dtechmed_app';
  EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO dtechmed_app';
  -- O histórico de migração é assunto do CLI, não do app.
  EXECUTE 'REVOKE ALL ON TABLE public."_prisma_migrations" FROM dtechmed_app';
END
$$;

-- -----------------------------------------------------------------------------
-- Policies das tabelas com tenant_id obrigatório
-- -----------------------------------------------------------------------------
-- Gerado em laço sobre a lista explícita: a lista serve de checklist auditável,
-- e o laço garante que toda tabela receba exatamente a mesma regra — sem uma
-- policy escrita à mão divergindo das outras.

DO $$
DECLARE
  t text;
  tabelas text[] := ARRAY[
    'clientes',
    'equipamentos',
    'ordens',
    'eventos_ordem',
    'fotos',
    'assinaturas',
    'orcamentos',
    'orcamento_itens',
    'pecas',
    'movimentos_estoque',
    'faturas',
    'pagamentos',
    'agendamentos',
    'documentos',
    'mensagens_whatsapp',
    'templates_mensagem',
    'whatsapp_instances',
    'leads',
    'contadores'
  ];
BEGIN
  FOREACH t IN ARRAY tabelas LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'tenant_isolation_' || t, t);
    EXECUTE format($f$
      CREATE POLICY %I ON public.%I
      FOR ALL
      USING      ("tenantId" = app.current_tenant_id() OR app.is_super_admin())
      WITH CHECK ("tenantId" = app.current_tenant_id() OR app.is_super_admin())
    $f$, 'tenant_isolation_' || t, t);
  END LOOP;
END
$$;

-- -----------------------------------------------------------------------------
-- tenants — a própria lista de empresas
-- -----------------------------------------------------------------------------
-- Uma franquia enxerga apenas a si mesma. Quem cria, edita e bloqueia empresa
-- é só o Super Admin.

ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_self_read ON public.tenants;
CREATE POLICY tenant_self_read ON public.tenants
  FOR SELECT
  USING (id = app.current_tenant_id() OR app.is_super_admin());

DROP POLICY IF EXISTS tenant_admin_write ON public.tenants;
CREATE POLICY tenant_admin_write ON public.tenants
  FOR ALL
  USING      (app.is_super_admin())
  WITH CHECK (app.is_super_admin());

-- -----------------------------------------------------------------------------
-- usuarios — inclui o caso especial do Super Admin (tenantId nulo)
-- -----------------------------------------------------------------------------

ALTER TABLE public.usuarios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS usuarios_isolation ON public.usuarios;
CREATE POLICY usuarios_isolation ON public.usuarios
  FOR ALL
  USING (
    "tenantId" = app.current_tenant_id()
    OR app.is_super_admin()
    OR app.is_auth_context()
  )
  WITH CHECK (
    -- Escrita é mais estrita que leitura de propósito: o contexto de login
    -- pode LER um usuário para autenticá-lo, mas nunca CRIAR ou ALTERAR um.
    -- Sem essa assimetria, uma falha no login viraria criação de usuário.
    "tenantId" = app.current_tenant_id()
    OR app.is_super_admin()
  );

-- -----------------------------------------------------------------------------
-- sessoes — sem tenant_id; o vínculo é pelo usuário dono
-- -----------------------------------------------------------------------------

ALTER TABLE public.sessoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sessoes_isolation ON public.sessoes;
CREATE POLICY sessoes_isolation ON public.sessoes
  FOR ALL
  USING (
    app.is_auth_context()
    OR app.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = public.sessoes."userId"
        AND u."tenantId" = app.current_tenant_id()
    )
  )
  WITH CHECK (
    app.is_auth_context()
    OR app.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = public.sessoes."userId"
        AND u."tenantId" = app.current_tenant_id()
    )
  );

-- -----------------------------------------------------------------------------
-- outbox_jobs — fila de automação (tenantId pode ser nulo em job de plataforma)
-- -----------------------------------------------------------------------------
-- O worker roda fora de requisição HTTP e precisa varrer a fila inteira. Ele
-- conecta com `app.worker_context = on`, que libera SÓ esta tabela. O job
-- carrega o tenantId no payload e o processamento reabre o escopo correto
-- antes de tocar em qualquer dado de negócio.

CREATE OR REPLACE FUNCTION app.is_worker_context()
RETURNS boolean
LANGUAGE sql
STABLE
PARALLEL SAFE
AS $$
  SELECT COALESCE(current_setting('app.worker_context', true), '') = 'on';
$$;

ALTER TABLE public.outbox_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS outbox_isolation ON public.outbox_jobs;
CREATE POLICY outbox_isolation ON public.outbox_jobs
  FOR ALL
  USING (
    app.is_worker_context()
    OR app.is_super_admin()
    OR "tenantId" = app.current_tenant_id()
  )
  WITH CHECK (
    app.is_worker_context()
    OR app.is_super_admin()
    OR "tenantId" = app.current_tenant_id()
  );

-- -----------------------------------------------------------------------------
-- audit_logs — append-only
-- -----------------------------------------------------------------------------
-- Trilha de auditoria que pode ser apagada não é trilha de auditoria.
-- Ninguém — nem o admin da empresa — recebe UPDATE ou DELETE aqui.

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS audit_insert ON public.audit_logs;
CREATE POLICY audit_insert ON public.audit_logs
  FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS audit_read ON public.audit_logs;
CREATE POLICY audit_read ON public.audit_logs
  FOR SELECT
  USING ("tenantId" = app.current_tenant_id() OR app.is_super_admin());

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dtechmed_app') THEN
    EXECUTE 'REVOKE UPDATE, DELETE ON TABLE public.audit_logs FROM dtechmed_app';
  END IF;
END
$$;

-- -----------------------------------------------------------------------------
-- eventos_ordem — a linha do tempo também é append-only
-- -----------------------------------------------------------------------------
-- É o registro que responde "quem mexeu no quê". Se pudesse ser editado depois,
-- não provaria nada. O encadeamento por hash detecta adulteração; a revogação
-- de UPDATE/DELETE impede a tentativa.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dtechmed_app') THEN
    EXECUTE 'REVOKE UPDATE, DELETE ON TABLE public.eventos_ordem FROM dtechmed_app';
    -- Assinatura, foto e pagamento são prova. Corrigir = registrar o oposto
    -- (estorno, nova foto), nunca apagar o que aconteceu.
    EXECUTE 'REVOKE DELETE ON TABLE public.assinaturas FROM dtechmed_app';
    EXECUTE 'REVOKE UPDATE, DELETE ON TABLE public.movimentos_estoque FROM dtechmed_app';
  END IF;
END
$$;

-- -----------------------------------------------------------------------------
-- Índices adicionais de operação
-- -----------------------------------------------------------------------------
-- O Prisma já criou os índices compostos por tenant. Estes cobrem consultas
-- que aparecem em tela quente e não saem do schema declarativo.

-- Busca de cliente por nome, tolerante a acento e a pedaço do nome.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

CREATE INDEX IF NOT EXISTS clientes_busca_trgm
  ON public.clientes USING gin (nome gin_trgm_ops);

CREATE INDEX IF NOT EXISTS equipamentos_busca_trgm
  ON public.equipamentos USING gin ((marca || ' ' || modelo) gin_trgm_ops);

-- Fila do worker: só interessam os jobs pendentes que já venceram.
CREATE INDEX IF NOT EXISTS outbox_pendentes
  ON public.outbox_jobs (prioridade, "agendadoPara")
  WHERE status = 'PENDENTE';

-- Painel de atrasos: ordens abertas com prazo estourado.
CREATE INDEX IF NOT EXISTS ordens_em_aberto
  ON public.ordens ("tenantId", "prazoPrometido")
  WHERE etapa NOT IN ('FINALIZADO', 'CANCELADO', 'DEVOLVIDO_SEM_REPARO');

-- Rota do dia do motorista.
CREATE INDEX IF NOT EXISTS agendamentos_rota_dia
  ON public.agendamentos ("tenantId", "motoristaId", "previstoPara")
  WHERE status IN ('ATRIBUIDO', 'EM_ROTA');
