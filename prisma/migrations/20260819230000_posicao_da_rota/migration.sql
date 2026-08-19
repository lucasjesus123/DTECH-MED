-- ---------------------------------------------------------------------------
-- ONDE ESTÁ O APARELHO AGORA — a posição durante a rota
-- ---------------------------------------------------------------------------
-- A pergunta que a central não conseguia responder: o cliente liga às 15h
-- perguntando se o motorista já saiu, e a única resposta possível era ligar
-- para o motorista. Agora a parada em rota carrega o rastro dela.
--
-- A linha pendura no AGENDAMENTO, não no usuário. Sem parada em rota não há
-- onde gravar — a trava de finalidade é a forma da tabela, e não uma regra que
-- alguém precisa lembrar de aplicar. Fora da rota, guardar a localização de
-- uma pessoa deixa de ser logística e vira monitoramento de funcionário.
--
-- E não é prova: a prova da entrega é a assinatura, com a coordenada dela, que
-- fica para sempre. Isto é o caminho, e serve enquanto o caminho acontece.
-- ---------------------------------------------------------------------------
CREATE TABLE "posicoes_rota" (
  "id"            TEXT NOT NULL,
  "tenantId"      TEXT NOT NULL,
  "agendamentoId" TEXT NOT NULL,
  "motoristaId"   TEXT NOT NULL,
  "motoristaNome" TEXT NOT NULL,
  "latitude"      DOUBLE PRECISION NOT NULL,
  "longitude"     DOUBLE PRECISION NOT NULL,
  "precisaoM"     DOUBLE PRECISION,
  "velocidade"    DOUBLE PRECISION,
  "criadoEm"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "posicoes_rota_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "posicoes_rota_tenantId_agendamentoId_criadoEm_idx"
  ON "posicoes_rota"("tenantId","agendamentoId","criadoEm");
CREATE INDEX "posicoes_rota_tenantId_criadoEm_idx"
  ON "posicoes_rota"("tenantId","criadoEm");

ALTER TABLE "posicoes_rota" ADD CONSTRAINT "posicoes_rota_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "posicoes_rota" ADD CONSTRAINT "posicoes_rota_agendamentoId_fkey"
  FOREIGN KEY ("agendamentoId") REFERENCES "agendamentos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- RLS: a mesma política das outras tabelas.
-- ---------------------------------------------------------------------------
ALTER TABLE "posicoes_rota" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "posicoes_rota" FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_posicoes_rota ON "posicoes_rota";
CREATE POLICY tenant_isolation_posicoes_rota ON "posicoes_rota" FOR ALL
  USING      (("tenantId" = app.current_tenant_id()) OR app.is_super_admin())
  WITH CHECK (("tenantId" = app.current_tenant_id()) OR app.is_super_admin());

-- ---------------------------------------------------------------------------
-- A APLICAÇÃO GRAVA, LÊ E APAGA — MAS NÃO REESCREVE
-- ---------------------------------------------------------------------------
-- Sem UPDATE: uma posição é um instante que já passou, e um instante que se
-- edita não serve para nada. Com DELETE, porque diferente das assinaturas e dos
-- eventos, este rastro DEVE poder sumir: guardar meses de deslocamento minuto a
-- minuto é acumular risco sem ganhar nada.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dtechmed_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, DELETE ON "posicoes_rota" TO dtechmed_app';
  END IF;
END $$;
