-- =============================================================================
-- Registro de tentativa de login
-- =============================================================================
-- Conflito real entre duas decisões de segurança, resolvido sem afrouxar
-- nenhuma das duas:
--
--   • A policy de `usuarios` permite que o contexto de login LEIA um usuário
--     (é preciso achá-lo pelo e-mail antes de saber a empresa dele), mas
--     proíbe ESCRITA. Sem essa assimetria, uma falha no login viraria criação
--     ou alteração de usuário — inclusive de papel.
--   • O contador anti-força-bruta precisa escrever a cada tentativa.
--
-- A saída não é abrir a policy. É uma função SECURITY DEFINER que toca
-- EXATAMENTE três colunas de UMA linha identificada por id:
--
--     tentativasFalhas · bloqueadoAte · ultimoLogin
--
-- Ela não consegue alterar papel, tenantId, senhaHash, e-mail nem `ativo`.
-- Mesmo que alguém encontre um jeito de chamá-la com o id errado, o pior que
-- consegue é bloquear ou desbloquear a contagem de outra pessoa — não escalar
-- privilégio, não trocar senha, não migrar de empresa.
-- =============================================================================

CREATE OR REPLACE FUNCTION app.registrar_tentativa_login(
  _user_id       text,
  _sucesso       boolean,
  _limite        integer,
  _bloqueio_base interval
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
-- search_path fixo: sem isso, um schema plantado antes de `public` no caminho
-- de busca poderia sequestrar a resolução dos nomes dentro de uma função que
-- roda com privilégio de dono.
SET search_path = public, pg_temp
AS $$
DECLARE
  v_falhas integer;
BEGIN
  IF _sucesso THEN
    UPDATE usuarios
       SET "tentativasFalhas" = 0,
           "bloqueadoAte"     = NULL,
           "ultimoLogin"      = now()
     WHERE id = _user_id;
    RETURN;
  END IF;

  UPDATE usuarios
     SET "tentativasFalhas" = "tentativasFalhas" + 1
   WHERE id = _user_id
  RETURNING "tentativasFalhas" INTO v_falhas;

  IF v_falhas IS NULL THEN
    RETURN;
  END IF;

  -- Bloqueio progressivo: cada falha além do limite dobra a espera.
  IF v_falhas >= _limite THEN
    UPDATE usuarios
       SET "bloqueadoAte" = now() + (_bloqueio_base * power(2, v_falhas - _limite))
     WHERE id = _user_id;
  END IF;
END;
$$;

-- A função é do dono do schema; o app só pode executá-la, nunca redefini-la.
REVOKE ALL ON FUNCTION app.registrar_tentativa_login(text, boolean, integer, interval) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dtechmed_app') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION app.registrar_tentativa_login(text, boolean, integer, interval) TO dtechmed_app';
  END IF;
END
$$;
