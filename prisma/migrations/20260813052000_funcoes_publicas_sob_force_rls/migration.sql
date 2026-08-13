-- =============================================================================
-- As funções de token precisam enxergar a linha sob FORCE ROW LEVEL SECURITY
-- =============================================================================
-- Consequência direta — e nada óbvia — da migração anterior.
--
-- `SECURITY DEFINER` faz a função rodar com o privilégio do DONO. Antes do
-- FORCE isso bastava, porque o dono não era submetido às policies. Depois do
-- FORCE, o dono passou a ser submetido como qualquer um, e as funções que
-- atendem as superfícies públicas pararam de enxergar a própria linha que
-- precisam ler ou escrever.
--
-- Medido logo após aplicar o FORCE:
--   app.empresa_do_documento(<token válido>) → NULL   ← PDF do cliente morto
--   app.empresa_do_token(<token válido>)     → NULL   ← portal do cliente morto
--
-- A saída NÃO é afrouxar o FORCE, nem abrir policy pública, nem dar BYPASSRLS
-- ao papel da aplicação. É elevar o contexto pelo tempo exato de uma consulta,
-- dentro da própria função, e devolvê-lo ao estado anterior em seguida.
--
-- A cláusula `SET app.is_super_admin` na definição da função seria mais
-- elegante, mas o PostgreSQL exige superusuário para fixar parâmetro
-- personalizado desse jeito — e o dono deste banco, de propósito, não é
-- superusuário. Então o salvamento e a restauração são explícitos.
--
-- O que cada função devolve continua estreito: `empresa_do_token` e
-- `empresa_do_documento` retornam APENAS o id da empresa — nem nome, nem
-- valor, nem caminho de arquivo. Quem chama abre o escopo normal com esse id,
-- e daí em diante todas as policies voltam a valer. O token prova o direito
-- àquele registro; não vira passe livre.
-- =============================================================================

-- ---- Portal do cliente ------------------------------------------------------
CREATE OR REPLACE FUNCTION app.empresa_do_token(_token text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_antes  text := coalesce(current_setting('app.is_super_admin', true), '');
  v_tenant text;
BEGIN
  PERFORM set_config('app.is_super_admin', 'on', true);
  SELECT "tenantId" INTO v_tenant FROM ordens WHERE "tokenPublico" = _token LIMIT 1;
  PERFORM set_config('app.is_super_admin', v_antes, true);
  RETURN v_tenant;
END;
$$;

-- ---- PDF enviado ao cliente -------------------------------------------------
CREATE OR REPLACE FUNCTION app.empresa_do_documento(_token text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_antes  text := coalesce(current_setting('app.is_super_admin', true), '');
  v_tenant text;
BEGIN
  PERFORM set_config('app.is_super_admin', 'on', true);
  SELECT "tenantId" INTO v_tenant FROM documentos WHERE "tokenAcesso" = _token LIMIT 1;
  PERFORM set_config('app.is_super_admin', v_antes, true);
  RETURN v_tenant;
END;
$$;

-- ---- Formulário do site -----------------------------------------------------
CREATE OR REPLACE FUNCTION app.registrar_lead(
  _slug        text,
  _nome        text,
  _telefone    text,
  _email       text,
  _empresa     text,
  _cidade      text,
  _equipamento text,
  _mensagem    text,
  _ip          text,
  _user_agent  text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_antes  text := coalesce(current_setting('app.is_super_admin', true), '');
  v_tenant text;
  v_id     text;
BEGIN
  PERFORM set_config('app.is_super_admin', 'on', true);

  SELECT id INTO v_tenant
    FROM tenants
   WHERE slug = _slug AND ativo = true AND bloqueado = false;

  -- Empresa inexistente, inativa ou suspensa: silêncio. Devolver o motivo
  -- diria a um curioso quais slugs existem e qual está suspenso.
  IF v_tenant IS NULL THEN
    PERFORM set_config('app.is_super_admin', v_antes, true);
    RETURN NULL;
  END IF;

  v_id := 'lead_' || replace(gen_random_uuid()::text, '-', '');

  INSERT INTO leads (
    id, "tenantId", nome, telefone, email, empresa, cidade,
    equipamento, mensagem, origem, status, ip, "userAgent",
    "criadoEm", "atualizadoEm"
  ) VALUES (
    v_id, v_tenant,
    left(_nome, 160), left(_telefone, 40),
    nullif(left(_email, 160), ''), nullif(left(_empresa, 160), ''),
    nullif(left(_cidade, 120), ''), nullif(left(_equipamento, 200), ''),
    nullif(left(_mensagem, 4000), ''),
    'SITE', 'novo',
    nullif(left(_ip, 64), ''), nullif(left(_user_agent, 400), ''),
    now(), now()
  );

  PERFORM set_config('app.is_super_admin', v_antes, true);
  RETURN v_id;
END;
$$;

-- ---- Contador anti-força-bruta ----------------------------------------------
CREATE OR REPLACE FUNCTION app.registrar_tentativa_login(
  _user_id       text,
  _sucesso       boolean,
  _limite        integer,
  _bloqueio_base interval
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_antes  text := coalesce(current_setting('app.is_super_admin', true), '');
  v_falhas integer;
BEGIN
  PERFORM set_config('app.is_super_admin', 'on', true);

  IF _sucesso THEN
    UPDATE usuarios
       SET "tentativasFalhas" = 0, "bloqueadoAte" = NULL, "ultimoLogin" = now()
     WHERE id = _user_id;
    PERFORM set_config('app.is_super_admin', v_antes, true);
    RETURN;
  END IF;

  UPDATE usuarios
     SET "tentativasFalhas" = "tentativasFalhas" + 1
   WHERE id = _user_id
  RETURNING "tentativasFalhas" INTO v_falhas;

  IF v_falhas IS NOT NULL AND v_falhas >= _limite THEN
    -- Bloqueio progressivo: cada falha além do limite dobra a espera.
    UPDATE usuarios
       SET "bloqueadoAte" = now() + (_bloqueio_base * power(2, v_falhas - _limite))
     WHERE id = _user_id;
  END IF;

  PERFORM set_config('app.is_super_admin', v_antes, true);
END;
$$;

REVOKE ALL ON FUNCTION app.empresa_do_token(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.empresa_do_documento(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.registrar_lead(text, text, text, text, text, text, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.registrar_tentativa_login(text, boolean, integer, interval) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dtechmed_app') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION app.empresa_do_token(text) TO dtechmed_app';
    EXECUTE 'GRANT EXECUTE ON FUNCTION app.empresa_do_documento(text) TO dtechmed_app';
    EXECUTE 'GRANT EXECUTE ON FUNCTION app.registrar_lead(text, text, text, text, text, text, text, text, text, text) TO dtechmed_app';
    EXECUTE 'GRANT EXECUTE ON FUNCTION app.registrar_tentativa_login(text, boolean, integer, interval) TO dtechmed_app';
  END IF;
END
$$;
