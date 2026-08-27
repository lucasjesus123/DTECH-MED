-- =============================================================================
-- RECUPERAÇÃO DE SENHA
-- =============================================================================
-- O sistema tinha um buraco de operação, não de segurança: quem esquecia a
-- senha dependia de outra pessoa. O técnico dependia do administrador da
-- empresa, o administrador dependia do dono da plataforma — e o dono da
-- plataforma não dependia de ninguém, porque não havia ninguém acima. A conta
-- que manda no sistema inteiro era a única sem saída.
--
-- Esta tabela guarda o PEDIDO de recuperação. Ela é escrita e lida apenas por
-- funções `SECURITY DEFINER`, porque quem pede está deslogado — não há empresa
-- no contexto, e o RLS, corretamente, devolveria zero linhas.
--
-- -----------------------------------------------------------------------------
-- O QUE ESTA TABELA **NÃO** GUARDA
-- -----------------------------------------------------------------------------
-- O token do link. Só o SHA-256 dele.
--
-- É a mesma decisão do cookie de sessão e pelo mesmo motivo: um backup vazado,
-- um dump esquecido numa pasta, um olho a mais no banco — nada disso pode virar
-- um link que troca a senha de alguém. O token existe por trinta minutos, no
-- WhatsApp de quem pediu e na memória de quem gerou. No banco, nunca.
--
-- -----------------------------------------------------------------------------
-- POR QUE UM LINK VIVO POR VEZ
-- -----------------------------------------------------------------------------
-- Pedir de novo mata o pedido anterior. Sem isso, cada clique em "esqueci"
-- deixaria mais uma chave válida circulando por meia hora — e a que interessa
-- ao atacante é a que a pessoa esqueceu de usar, não a que ela usou.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.recuperacoes_senha (
  "id"        text PRIMARY KEY,
  "userId"    text NOT NULL,
  -- Repetido aqui de propósito: as funções abaixo precisam saber a empresa sem
  -- ter de atravessar `usuarios`, que está sob FORCE RLS.
  "tenantId"  text,
  "tokenHash" text NOT NULL,
  "expiraEm"  timestamp(3) NOT NULL,
  "usadoEm"   timestamp(3),
  "ip"        text,
  "criadoEm"  timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "recuperacoes_senha_tokenHash_key"
  ON public.recuperacoes_senha ("tokenHash");
CREATE INDEX IF NOT EXISTS "recuperacoes_senha_userId_criadoEm_idx"
  ON public.recuperacoes_senha ("userId", "criadoEm");
CREATE INDEX IF NOT EXISTS "recuperacoes_senha_expiraEm_idx"
  ON public.recuperacoes_senha ("expiraEm");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'recuperacoes_senha_userId_fkey'
  ) THEN
    ALTER TABLE public.recuperacoes_senha
      ADD CONSTRAINT "recuperacoes_senha_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES public.usuarios("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'recuperacoes_senha_tenantId_fkey'
  ) THEN
    ALTER TABLE public.recuperacoes_senha
      ADD CONSTRAINT "recuperacoes_senha_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES public.tenants("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END
$$;

-- -----------------------------------------------------------------------------
-- Política: fechada para todo mundo
-- -----------------------------------------------------------------------------
-- Nenhuma tela lê esta tabela. Nem o administrador da empresa, nem o painel do
-- dono — as funções abaixo elevam o contexto pelo tempo exato de uma consulta e
-- o devolvem em seguida, que é o mesmo desenho das outras superfícies públicas
-- (portal do cliente, PDF por token, formulário do site).
--
-- FORCE prende o DONO da tabela junto. É o que impede um script de manutenção,
-- rodando com o papel das migrações, de varrer hashes de recuperação.
ALTER TABLE public.recuperacoes_senha ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recuperacoes_senha FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS recuperacao_fechada ON public.recuperacoes_senha;
CREATE POLICY recuperacao_fechada ON public.recuperacoes_senha
  FOR ALL
  USING (app.is_super_admin())
  WITH CHECK (app.is_super_admin());

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dtechmed_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.recuperacoes_senha TO dtechmed_app';
  END IF;
END
$$;

-- =============================================================================
-- app.criar_recuperacao — abre o pedido
-- =============================================================================
-- Recebe o hash do token já pronto: o token em claro é gerado no servidor da
-- aplicação e não atravessa o banco em momento algum, nem como parâmetro.
--
-- Devolve `true` se o pedido foi aberto e `false` se foi recusado por
-- FREIO — um pedido novo para a mesma conta dentro da janela de espera. O freio
-- vive aqui, e não na aplicação, porque a aplicação roda em memória: dois
-- processos contariam separado e o teto efetivo dobraria. O banco é um só.
--
-- O freio não existe para proteger a senha (o link vai para o dono do número);
-- existe para que ninguém use o botão "esqueci" como máquina de encher o
-- WhatsApp de outra pessoa.
-- =============================================================================
CREATE OR REPLACE FUNCTION app.criar_recuperacao(
  _user_id     text,
  _tenant_id   text,
  _token_hash  text,
  _minutos     integer,
  _espera_seg  integer,
  _ip          text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_antes  text := coalesce(current_setting('app.is_super_admin', true), '');
  v_recente boolean;
BEGIN
  PERFORM set_config('app.is_super_admin', 'on', true);

  SELECT EXISTS (
    SELECT 1 FROM recuperacoes_senha
     WHERE "userId" = _user_id
       AND "usadoEm" IS NULL
       AND "expiraEm" > now()
       AND "criadoEm" > now() - make_interval(secs => _espera_seg)
  ) INTO v_recente;

  IF v_recente THEN
    PERFORM set_config('app.is_super_admin', v_antes, true);
    RETURN false;
  END IF;

  -- Um link vivo por vez.
  UPDATE recuperacoes_senha
     SET "usadoEm" = now()
   WHERE "userId" = _user_id AND "usadoEm" IS NULL;

  INSERT INTO recuperacoes_senha ("id", "userId", "tenantId", "tokenHash", "expiraEm", "ip", "criadoEm")
  VALUES (
    'rec_' || replace(gen_random_uuid()::text, '-', ''),
    _user_id,
    nullif(_tenant_id, ''),
    _token_hash,
    now() + make_interval(mins => _minutos),
    nullif(left(_ip, 64), ''),
    now()
  );

  PERFORM set_config('app.is_super_admin', v_antes, true);
  RETURN true;
END;
$$;

-- =============================================================================
-- app.usar_recuperacao — gasta o link e troca a senha
-- =============================================================================
-- Tudo numa função só porque tudo tem de acontecer junto ou nada acontece:
-- marcar o link como usado, gravar a senha nova, zerar o contador de tentativas
-- e DERRUBAR TODAS AS SESSÕES daquela conta.
--
-- A derrubada é o passo que costuma faltar. Se a conta foi tomada, trocar a
-- senha sem encerrar as sessões deixa o invasor logado exatamente onde estava —
-- e a pessoa acredita ter resolvido o problema.
--
-- Devolve o id do usuário quando deu certo, NULL quando o link não serve
-- (inexistente, vencido ou já gasto). Um NULL só, para os três casos: dizer
-- qual dos três seria dizer a um curioso que o link existe.
-- =============================================================================
CREATE OR REPLACE FUNCTION app.usar_recuperacao(
  _token_hash text,
  _senha_hash text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_antes   text := coalesce(current_setting('app.is_super_admin', true), '');
  v_user_id text;
BEGIN
  PERFORM set_config('app.is_super_admin', 'on', true);

  UPDATE recuperacoes_senha
     SET "usadoEm" = now()
   WHERE "tokenHash" = _token_hash
     AND "usadoEm" IS NULL
     AND "expiraEm" > now()
  RETURNING "userId" INTO v_user_id;

  IF v_user_id IS NULL THEN
    PERFORM set_config('app.is_super_admin', v_antes, true);
    RETURN NULL;
  END IF;

  UPDATE usuarios
     SET "senhaHash" = _senha_hash,
         "trocarSenha" = false,
         "tentativasFalhas" = 0,
         "bloqueadoAte" = NULL
   WHERE id = v_user_id;

  UPDATE sessoes
     SET "revogadaEm" = now()
   WHERE "userId" = v_user_id AND "revogadaEm" IS NULL;

  PERFORM set_config('app.is_super_admin', v_antes, true);
  RETURN v_user_id;
END;
$$;

-- As duas funções são do servidor, nunca de um cliente do banco.
REVOKE ALL ON FUNCTION app.criar_recuperacao(text, text, text, integer, integer, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.usar_recuperacao(text, text) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dtechmed_app') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION app.criar_recuperacao(text, text, text, integer, integer, text) TO dtechmed_app';
    EXECUTE 'GRANT EXECUTE ON FUNCTION app.usar_recuperacao(text, text) TO dtechmed_app';
  END IF;
END
$$;
