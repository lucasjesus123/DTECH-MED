-- =============================================================================
-- O contexto de login precisa enxergar a empresa do usuário
-- =============================================================================
-- Sem isto, o login recusava TODO MUNDO com "Acesso da empresa suspenso".
--
-- O motivo: para autenticar é preciso responder duas perguntas na ordem —
-- "quem é este e-mail?" e "a empresa dele está ativa e liberada?". A primeira
-- já era possível; a segunda não, porque a policy de `tenants` só libera a
-- própria empresa do contexto, e no login ainda não existe contexto de empresa.
-- O join devolvia NULL e a checagem interpretava como suspensa.
--
-- A liberação é deliberadamente estreita:
--
--   • Só SELECT. Criar, alterar ou bloquear empresa continua exclusivo do
--     Super Admin, e o contexto de login não consegue nada disso.
--   • A tabela `tenants` guarda razão social, CNPJ e endereço da franquia —
--     não guarda cliente, equipamento, orçamento nem valor. O dado de negócio
--     de cada empresa continua fechado pelas outras policies.
--   • O contexto `auth` só é ligado dentro de src/server/auth/sessao.ts, em
--     duas funções, e nunca chega perto de dado de operação.
-- =============================================================================

DROP POLICY IF EXISTS tenant_self_read ON public.tenants;

CREATE POLICY tenant_self_read ON public.tenants
  FOR SELECT
  USING (
    id = app.current_tenant_id()
    OR app.is_super_admin()
    -- Necessário para o login descobrir se a empresa do usuário está liberada.
    OR app.is_auth_context()
    -- O worker processa a fila de todas as empresas e monta a mensagem com o
    -- nome da franquia que assina o WhatsApp.
    OR app.is_worker_context()
  );
