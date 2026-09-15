-- =============================================================================
-- O PAPEL TIMBRADO DA FRANQUIA
-- =============================================================================
-- A coluna `tenants."logoUrl"` existe desde o primeiro dia e nunca foi escrita.
-- O motivo apareceu na primeira tentativa de escrever nela: a tabela `tenants`
-- só aceita escrita de quem é dono da plataforma.
--
--   tenant_admin_write  FOR ALL   USING app.is_super_admin()
--   tenant_self_read    FOR SELECT  (id = current_tenant OR super OR ...)
--
-- E está certo que seja assim. Aquela linha guarda `plano`, `ativo` e
-- `bloqueado`: abrir UPDATE nela para o administrador da franquia daria a ele
-- o poder de se desbloquear e de trocar o próprio plano. RLS é por LINHA, não
-- por coluna — não há como liberar só a logo por lá.
--
-- Por isso a marca ganha casa própria, com a política de sempre: o franqueado
-- manda na identidade visual dele sem encostar no contrato comercial dele.
--
-- `tenants."logoUrl"` fica onde está, intocada. Derrubá-la seria mexer numa
-- coluna que o banco de produção carrega; e ela ainda pode servir ao dono da
-- plataforma, que escreve em `tenants` de qualquer jeito.
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.marca_empresa (
  "id"           TEXT NOT NULL,
  "tenantId"     TEXT NOT NULL,
  "logoCaminho"  TEXT,
  "logoHash"     TEXT,
  "logoLargura"  INTEGER,
  "logoAltura"   INTEGER,
  "atualizadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "autorId"      TEXT,
  "autorNome"    TEXT,
  CONSTRAINT "marca_empresa_pkey" PRIMARY KEY ("id")
);

-- UMA marca por empresa. Sem isto, dois envios simultâneos deixariam duas
-- linhas e o gerador de PDF escolheria uma por acaso — a franquia veria a
-- logo trocar sozinha entre um documento e o seguinte.
CREATE UNIQUE INDEX IF NOT EXISTS "marca_empresa_tenantId_key"
  ON public.marca_empresa("tenantId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'marca_empresa_tenantId_fkey'
  ) THEN
    ALTER TABLE public.marca_empresa
      ADD CONSTRAINT "marca_empresa_tenantId_fkey" FOREIGN KEY ("tenantId")
      REFERENCES public.tenants("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;

-- -----------------------------------------------------------------------------
-- RLS — o mesmo desenho de todas as tabelas de negócio
-- -----------------------------------------------------------------------------
-- FORCE prende o dono da tabela junto: sem ele, a migração e qualquer script
-- que rode como `dtechmed_owner` passariam por cima da política.
ALTER TABLE public.marca_empresa ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marca_empresa FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS marca_empresa_tenant ON public.marca_empresa;
CREATE POLICY marca_empresa_tenant ON public.marca_empresa
  FOR ALL
  USING ("tenantId" = app.current_tenant_id() OR app.is_super_admin())
  WITH CHECK ("tenantId" = app.current_tenant_id() OR app.is_super_admin());

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dtechmed_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.marca_empresa TO dtechmed_app';
  END IF;
END
$$;

