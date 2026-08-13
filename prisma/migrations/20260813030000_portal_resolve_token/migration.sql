-- =============================================================================
-- Portal público: converter o token do link em escopo de empresa
-- =============================================================================
-- O cliente abre o link do WhatsApp sem sessão, então não existe contexto de
-- empresa — e o RLS, corretamente, devolvia zero linhas. O portal caía em 404
-- mesmo com o token certo.
--
-- A saída ERRADA seria abrir uma policy pública em `ordens`. Isso deixaria
-- qualquer consulta sem contexto enxergar a carteira inteira de todas as
-- franquias.
--
-- A saída certa é estreitar ao máximo o que o token dá: uma função que recebe
-- o token e devolve APENAS o id da empresa. Nada de nome de cliente, valor,
-- equipamento ou etapa. De posse desse id, a aplicação abre o escopo normal e
-- todas as policies voltam a valer dali em diante.
--
-- Ou seja: o token prova o direito àquela ordem; ele não vira passe livre.
-- Um token inválido devolve NULL, e a aplicação não tem escopo nenhum para
-- abrir.
-- =============================================================================

CREATE OR REPLACE FUNCTION app.empresa_do_token(_token text)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
STABLE
-- search_path fixo: sem isso, um schema plantado antes de `public` no caminho
-- de busca sequestraria a resolução de nomes dentro de uma função que roda
-- com privilégio de dono.
SET search_path = public, pg_temp
AS $$
  SELECT "tenantId"
    FROM ordens
   WHERE "tokenPublico" = _token
   LIMIT 1;
$$;

REVOKE ALL ON FUNCTION app.empresa_do_token(text) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dtechmed_app') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION app.empresa_do_token(text) TO dtechmed_app';
  END IF;
END
$$;
