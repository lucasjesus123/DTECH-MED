-- =============================================================================
-- Resolução da empresa a partir do token do documento
-- =============================================================================
-- Mesma situação já resolvida para o portal do cliente, e pelo mesmo caminho.
--
-- O cliente recebe o link do PDF no WhatsApp e o abre sem sessão. Sem contexto
-- de empresa, o RLS — corretamente — devolve zero linhas, e a rota respondia
-- 404 para TODO documento legítimo: laudo, orçamento, contrato, ordem de
-- serviço, recibo e comprovante de entrega.
--
-- A saída não é abrir uma policy pública em `documentos`. Isso deixaria
-- qualquer consulta sem contexto enxergar os documentos de todas as franquias.
-- Em vez disso, esta função converte o token em APENAS o id da empresa — sem
-- devolver caminho, número nem tipo. Com esse id, a aplicação abre o escopo
-- normal e todas as policies voltam a valer.
--
-- O token prova o direito àquele documento; ele não vira passe livre.
-- =============================================================================

CREATE OR REPLACE FUNCTION app.empresa_do_documento(_token text)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
STABLE
-- search_path fixo: sem isso, um schema plantado antes de `public` no caminho
-- de busca sequestraria a resolução dos nomes dentro de uma função que roda
-- com privilégio de dono.
SET search_path = public, pg_temp
AS $$
  SELECT "tenantId" FROM documentos WHERE "tokenAcesso" = _token LIMIT 1;
$$;

REVOKE ALL ON FUNCTION app.empresa_do_documento(text) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dtechmed_app') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION app.empresa_do_documento(text) TO dtechmed_app';
  END IF;
END
$$;
