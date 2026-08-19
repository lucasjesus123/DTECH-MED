-- ============================================================================
-- CONTRATO DE MANUTENÇÃO PREVENTIVA e a PEÇA QUE SAIU DO APARELHO
-- ============================================================================
-- Duas ideias trazidas de ERPs abertos e traduzidas para a assistência técnica:
--
--   • do Maintenance Schedule do ERPNext, a revisão que se repete sozinha —
--     receita que se sabe de antemão, em vez de viver do que quebra;
--   • do Odoo, o destino da peça retirada (`parts_location_id`,
--     `recycle_location_id`) — que aqui vira uma pergunta só: para onde foi.
--
-- As três tabelas nascem com RLS FORÇADA. Tabela nova sem política é a forma
-- mais comum de furar isolamento multiempresa: tudo funciona, e um dia uma
-- franquia enxerga o contrato da outra.
-- ============================================================================

CREATE TYPE "DestinoPeca"   AS ENUM ('DEVOLVIDA_AO_CLIENTE','GUARDADA','DESCARTADA','DESCARTE_CONTROLADO','RECICLADA');
CREATE TYPE "Periodicidade" AS ENUM ('MENSAL','BIMESTRAL','TRIMESTRAL','SEMESTRAL','ANUAL');
CREATE TYPE "StatusVisita"  AS ENUM ('PREVISTA','AGENDADA','REALIZADA','CANCELADA');

-- ---------------------------------------------------------------------------
CREATE TABLE "pecas_retiradas" (
  "id"                TEXT NOT NULL,
  "tenantId"          TEXT NOT NULL,
  "ordemId"           TEXT NOT NULL,
  "descricao"         TEXT NOT NULL,
  "destino"           "DestinoPeca" NOT NULL,
  "identificacao"     TEXT,
  "observacao"        TEXT,
  "registradoPorId"   TEXT,
  "registradoPorNome" TEXT NOT NULL,
  "criadoEm"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "pecas_retiradas_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "pecas_retiradas_tenantId_ordemId_idx" ON "pecas_retiradas"("tenantId","ordemId");
ALTER TABLE "pecas_retiradas" ADD CONSTRAINT "pecas_retiradas_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pecas_retiradas" ADD CONSTRAINT "pecas_retiradas_ordemId_fkey"
  FOREIGN KEY ("ordemId") REFERENCES "ordens"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
CREATE TABLE "contratos_manutencao" (
  "id"                  TEXT NOT NULL,
  "tenantId"            TEXT NOT NULL,
  "numero"              INTEGER NOT NULL,
  "clienteId"           TEXT NOT NULL,
  "equipamentoId"       TEXT NOT NULL,
  "periodicidade"       "Periodicidade" NOT NULL,
  "inicio"              TIMESTAMP(3) NOT NULL,
  "fim"                 TIMESTAMP(3),
  "valorVisitaCentavos" INTEGER NOT NULL DEFAULT 0,
  "ativo"               BOOLEAN NOT NULL DEFAULT true,
  "encerradoEm"         TIMESTAMP(3),
  "observacoes"         TEXT,
  "criadoEm"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizadoEm"        TIMESTAMP(3) NOT NULL,
  CONSTRAINT "contratos_manutencao_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "contratos_manutencao_tenantId_numero_key" ON "contratos_manutencao"("tenantId","numero");
CREATE INDEX "contratos_manutencao_tenantId_ativo_idx"         ON "contratos_manutencao"("tenantId","ativo");
CREATE INDEX "contratos_manutencao_tenantId_equipamentoId_idx" ON "contratos_manutencao"("tenantId","equipamentoId");
ALTER TABLE "contratos_manutencao" ADD CONSTRAINT "contratos_manutencao_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "contratos_manutencao" ADD CONSTRAINT "contratos_manutencao_clienteId_fkey"
  FOREIGN KEY ("clienteId") REFERENCES "clientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "contratos_manutencao" ADD CONSTRAINT "contratos_manutencao_equipamentoId_fkey"
  FOREIGN KEY ("equipamentoId") REFERENCES "equipamentos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
CREATE TABLE "visitas_preventivas" (
  "id"           TEXT NOT NULL,
  "tenantId"     TEXT NOT NULL,
  "contratoId"   TEXT NOT NULL,
  "previstaPara" TIMESTAMP(3) NOT NULL,
  "status"       "StatusVisita" NOT NULL DEFAULT 'PREVISTA',
  "ordemId"      TEXT,
  "observacao"   TEXT,
  "criadoEm"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "visitas_preventivas_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "visitas_preventivas_ordemId_key" ON "visitas_preventivas"("ordemId");
CREATE INDEX "visitas_preventivas_tenantId_status_previstaPara_idx" ON "visitas_preventivas"("tenantId","status","previstaPara");
CREATE INDEX "visitas_preventivas_contratoId_previstaPara_idx"      ON "visitas_preventivas"("contratoId","previstaPara");
ALTER TABLE "visitas_preventivas" ADD CONSTRAINT "visitas_preventivas_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "visitas_preventivas" ADD CONSTRAINT "visitas_preventivas_contratoId_fkey"
  FOREIGN KEY ("contratoId") REFERENCES "contratos_manutencao"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "visitas_preventivas" ADD CONSTRAINT "visitas_preventivas_ordemId_fkey"
  FOREIGN KEY ("ordemId") REFERENCES "ordens"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- RLS: mesma política das outras 25 tabelas. `USING` decide o que se enxerga,
-- `WITH CHECK` decide o que se pode gravar — os dois, sempre.
-- ---------------------------------------------------------------------------
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['pecas_retiradas','contratos_manutencao','visitas_preventivas']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE  ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation_%s ON %I', t, t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation_%s ON %I FOR ALL
         USING      (("tenantId" = app.current_tenant_id()) OR app.is_super_admin())
         WITH CHECK (("tenantId" = app.current_tenant_id()) OR app.is_super_admin())',
      t, t);
  END LOOP;
END $$;

-- O papel da aplicação precisa alcançar as tabelas novas. Sem isto, tudo
-- responde "permission denied" e o defeito aparece só na primeira gravação.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dtechmed_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON "pecas_retiradas", "contratos_manutencao", "visitas_preventivas" TO dtechmed_app';
  END IF;
END $$;
