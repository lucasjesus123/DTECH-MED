-- ---------------------------------------------------------------------------
-- CONTEÚDO DO SITE, EDITÁVEL PELO PAINEL
-- ---------------------------------------------------------------------------
-- Duas tabelas: a linha viva e o histórico de tudo o que ela já foi.
--
-- Elas NÃO têm `tenantId`, e por isso não entram na política de isolamento
-- entre franquias que vale para as outras 25 tabelas. Precisam de política
-- própria, e ela é mais restrita que qualquer outra do sistema: só o Super
-- Admin enxerga e só ele grava.
--
-- O detalhe que fecha isso: o site institucional é lido SEM sessão, por
-- qualquer visitante. Se a leitura dependesse desta tabela passar pelo RLS do
-- usuário da aplicação, a home ficaria em branco para quem não está logado —
-- que é exatamente todo mundo que interessa. A saída é uma função de leitura
-- com `SECURITY DEFINER`, que devolve só o conteúdo publicado e nada mais.

CREATE TABLE "conteudo_site" (
  "id"              TEXT NOT NULL DEFAULT 'site',
  "dados"           JSONB NOT NULL,
  "versao"          INTEGER NOT NULL DEFAULT 1,
  "atualizadoEm"    TIMESTAMP(3) NOT NULL,
  "atualizadoPorId" TEXT,
  CONSTRAINT "conteudo_site_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "conteudo_site_versoes" (
  "id"        TEXT NOT NULL,
  "siteId"    TEXT NOT NULL,
  "versao"    INTEGER NOT NULL,
  "dados"     JSONB NOT NULL,
  "autorId"   TEXT,
  "autorNome" TEXT,
  "nota"      TEXT,
  "criadoEm"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "conteudo_site_versoes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "conteudo_site_versoes_siteId_versao_idx"
  ON "conteudo_site_versoes"("siteId", "versao");

ALTER TABLE "conteudo_site_versoes"
  ADD CONSTRAINT "conteudo_site_versoes_siteId_fkey"
  FOREIGN KEY ("siteId") REFERENCES "conteudo_site"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- --------------------------------------------------------------------------
-- Row Level Security, forçada inclusive para o dono da tabela
-- --------------------------------------------------------------------------
ALTER TABLE "conteudo_site"          ENABLE ROW LEVEL SECURITY;
ALTER TABLE "conteudo_site"          FORCE  ROW LEVEL SECURITY;
ALTER TABLE "conteudo_site_versoes"  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "conteudo_site_versoes"  FORCE  ROW LEVEL SECURITY;

-- `USING` decide o que se enxerga; `WITH CHECK` decide o que se pode gravar.
-- Os dois, sempre. Política com só o primeiro deixa a escrita aberta, e é o
-- descuido mais comum em RLS.
DROP POLICY IF EXISTS conteudo_site_super ON "conteudo_site";
CREATE POLICY conteudo_site_super ON "conteudo_site"
  FOR ALL
  USING      (app.is_super_admin())
  WITH CHECK (app.is_super_admin());

DROP POLICY IF EXISTS conteudo_site_versoes_super ON "conteudo_site_versoes";
CREATE POLICY conteudo_site_versoes_super ON "conteudo_site_versoes"
  FOR ALL
  USING      (app.is_super_admin())
  WITH CHECK (app.is_super_admin());

-- --------------------------------------------------------------------------
-- A leitura pública
-- --------------------------------------------------------------------------
-- `SECURITY DEFINER` faz a função rodar com os poderes de quem a criou (o dono
-- do schema), atravessando a política acima. É um poder perigoso e por isso ela
-- é mínima: não recebe parâmetro nenhum, não aceita filtro, e devolve UMA
-- coluna de UMA linha. Não há o que injetar nem o que vazar além do conteúdo
-- que já está publicado no site para qualquer visitante ver.
--
-- `search_path` fixo no corpo da função: sem isso, quem chama poderia apontar
-- `public` para um schema próprio e fazer a função ler outra tabela.
CREATE OR REPLACE FUNCTION app.conteudo_publicado()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT "dados" FROM public."conteudo_site" WHERE "id" = 'site';
$$;

REVOKE ALL ON FUNCTION app.conteudo_publicado() FROM PUBLIC;

-- O GRANT é condicional. Em produção o papel da aplicação já existe (nasce com
-- o banco, pelo script de inicialização), mas num banco de desenvolvimento
-- criado à mão ele pode não existir — e a migração inteira falharia por causa
-- de uma linha de permissão.
DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dtechmed_app') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION app.conteudo_publicado() TO dtechmed_app';
  END IF;
END
$do$;
