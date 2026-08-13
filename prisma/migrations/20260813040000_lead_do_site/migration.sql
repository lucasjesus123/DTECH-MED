-- =============================================================================
-- Registro de contato vindo do site
-- =============================================================================
-- O formulário do site é público: quem preenche não tem sessão, e portanto não
-- tem contexto de empresa. O RLS, corretamente, recusa a escrita.
--
-- A saída ERRADA seria abrir uma policy de INSERT em `leads` para o contexto
-- anônimo. Isso deixaria qualquer requisição sem sessão escrever na tabela de
-- qualquer franquia, bastando informar o `tenantId` — e ainda por cima a mesma
-- brecha valeria para consultas mal escritas em outros pontos do código.
--
-- Em vez disso, uma função SECURITY DEFINER que:
--
--   • escreve em UMA tabela só (`leads`), nunca em outra;
--   • resolve a empresa pelo SLUG, e recusa empresa inativa ou suspensa;
--   • grava com status fixo 'novo' e nunca preenche `ordemGeradaId`,
--     que é o campo que ligaria o lead a uma ordem existente.
--
-- O pior que um abuso consegue é encher a caixa de entrada de contatos de uma
-- franquia — barulho, que o limite de taxa da aplicação contém. Não dá para
-- ler nada, não dá para alterar nada, e não dá para alcançar outra tabela.
-- =============================================================================

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
-- search_path fixo: sem isso, um schema plantado antes de `public` no caminho
-- de busca sequestraria a resolução dos nomes dentro de uma função que roda
-- com privilégio de dono.
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tenant text;
  v_id     text;
BEGIN
  SELECT id INTO v_tenant
    FROM tenants
   WHERE slug = _slug AND ativo = true AND bloqueado = false;

  -- Empresa inexistente, inativa ou suspensa: silêncio. Devolver o motivo
  -- diria a um curioso quais slugs existem e qual está suspenso.
  IF v_tenant IS NULL THEN
    RETURN NULL;
  END IF;

  v_id := 'lead_' || replace(gen_random_uuid()::text, '-', '');

  INSERT INTO leads (
    id, "tenantId", nome, telefone, email, empresa, cidade,
    equipamento, mensagem, origem, status, ip, "userAgent",
    "criadoEm", "atualizadoEm"
  ) VALUES (
    v_id, v_tenant,
    left(_nome, 160),
    left(_telefone, 40),
    nullif(left(_email, 160), ''),
    nullif(left(_empresa, 160), ''),
    nullif(left(_cidade, 120), ''),
    nullif(left(_equipamento, 200), ''),
    nullif(left(_mensagem, 4000), ''),
    'SITE', 'novo',
    nullif(left(_ip, 64), ''),
    nullif(left(_user_agent, 400), ''),
    now(), now()
  );

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION app.registrar_lead(text, text, text, text, text, text, text, text, text, text) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dtechmed_app') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION app.registrar_lead(text, text, text, text, text, text, text, text, text, text) TO dtechmed_app';
  END IF;
END
$$;
