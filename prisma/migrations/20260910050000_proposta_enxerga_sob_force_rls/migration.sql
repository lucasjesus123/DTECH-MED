-- =============================================================================
-- `app.empresa_da_proposta` precisa enxergar a linha sob FORCE ROW LEVEL SECURITY
-- =============================================================================
-- A migração anterior criou a função copiando o desenho ORIGINAL de
-- `app.empresa_do_token` — o de agosto, em SQL puro. Só que aquele desenho foi
-- corrigido dias depois, em `20260813052000_funcoes_publicas_sob_force_rls`, e
-- a cópia herdou o defeito que já tinha sido consertado:
--
--   `SECURITY DEFINER` roda com o privilégio do DONO. Antes do FORCE isso
--   bastava, porque o dono não era submetido às policies. Depois do FORCE, o
--   dono é submetido como qualquer um — e a função para de enxergar a própria
--   linha que precisa ler.
--
-- Medido: `app.empresa_da_proposta(<token válido>)` devolvia NULL, e o link do
-- orçamento respondia 404 para o cliente que tinha acabado de recebê-lo.
--
-- A saída é a mesma que a casa já escolheu, e por isso esta função vira cópia
-- fiel daquela: elevar o contexto pelo tempo exato de UMA consulta, dentro da
-- própria função, e devolvê-lo ao estado anterior em seguida. Não se afrouxa o
-- FORCE, não se abre policy pública, não se dá BYPASSRLS ao papel da aplicação.
--
-- A cláusula `SET app.is_super_admin` na definição seria mais elegante, mas o
-- PostgreSQL exige superusuário para fixar parâmetro personalizado assim — e o
-- dono deste banco, de propósito, não é superusuário. Por isso o salvamento e a
-- restauração são explícitos.
--
-- O que ela devolve continua estreito: APENAS o id da empresa. Nem cliente, nem
-- valor, nem item. Quem chama abre o escopo normal com esse id, e daí em diante
-- todas as policies voltam a valer.
-- =============================================================================

CREATE OR REPLACE FUNCTION app.empresa_da_proposta(_token text)
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
  SELECT "tenantId" INTO v_tenant FROM propostas WHERE "tokenPublico" = _token LIMIT 1;
  PERFORM set_config('app.is_super_admin', v_antes, true);
  RETURN v_tenant;
END;
$$;

REVOKE ALL ON FUNCTION app.empresa_da_proposta(text) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dtechmed_app') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION app.empresa_da_proposta(text) TO dtechmed_app';
  END IF;
END
$$;
