-- O ESTOQUE PASSA A SABER QUE FERRAMENTA NÃO SE CONSOME.
--
-- =============================================================================
-- O QUE ESTAVA ERRADO
-- =============================================================================
-- Todo item do estoque era uma PEÇA DE CONSUMO: tinha um saldo que só descia.
-- Os verbos existentes eram entrada, saída, perda, ajuste, reserva e liberação
-- — todos sobre coisa que se gasta.
--
-- Uma chave de fenda, um multímetro ou uma estação de solda não se gastam: eles
-- SAEM COM ALGUÉM e voltam. Registrar isso como saída faz o saldo cair para
-- zero e a ferramenta desaparecer do sistema no dia em que alguém a levou. É
-- assim que se perde ferramenta: não por roubo, por não saber com quem está.
--
-- =============================================================================
-- O DESENHO: CUSTÓDIA, E NÃO CONSUMO
-- =============================================================================
-- A ferramenta emprestada continua sendo da empresa. O que muda é o LUGAR dela.
-- Por isso `saldoEmprestado` é irmão de `saldoReservado`, e não do saldo:
--
--   disponível = saldo − reservado − emprestado
--
-- O saldo (o patrimônio) não se mexe no empréstimo nem na devolução, exatamente
-- como já acontece na reserva. Os dois movimentos novos entram no livro-razão
-- com saldo anterior igual ao posterior — eles registram MOVIMENTO DE POSSE, e
-- o livro continua fechando com o saldo.
--
-- =============================================================================
-- POR QUE UMA TABELA PRÓPRIA PARA O EMPRÉSTIMO
-- =============================================================================
-- O livro-razão responde "o que aconteceu". Ele NÃO responde "onde está o
-- multímetro agora" sem varrer o histórico inteiro e parear cada saída com a
-- devolução correspondente — e o pareamento não existe, porque duas unidades da
-- mesma ferramenta podem estar com duas pessoas diferentes.
--
-- `emprestimos_ferramenta` é o estado presente: uma linha aberta é uma
-- ferramenta na mão de alguém. `devolvidoEm IS NULL` é a pergunta inteira.
--
-- O responsável é gravado como id E nome, sem chave estrangeira — mesma escolha
-- de `pecas_retiradas`. Quem levou a ferramenta em 2026 continua escrito ali
-- mesmo que a pessoa saia da empresa e o usuário seja apagado; um registro de
-- posse que perde o nome de quem tinha a posse não serve para nada.

-- ---------------------------------------------------------------------------
-- 1. O item do estoque ganha TIPO
-- ---------------------------------------------------------------------------
-- Três coisas diferentes, com contas diferentes: a PEÇA é vendida na O.S. e
-- entra no orçamento; o INSUMO é gasto no trabalho e não se cobra por unidade
-- (solda, álcool, graxa); a FERRAMENTA volta.
--
-- O padrão é PECA para que toda linha existente continue a ser exatamente o que
-- já era. Nada precisa ser reclassificado para o sistema seguir funcionando.
CREATE TYPE "TipoItemEstoque" AS ENUM ('PECA', 'INSUMO', 'FERRAMENTA');

ALTER TABLE "pecas"
  ADD COLUMN "tipo" "TipoItemEstoque" NOT NULL DEFAULT 'PECA',
  -- A plaquinha da ferramenta. Peça não tem patrimônio; ferramenta tem, e é por
  -- ele que se acha a que sumiu.
  ADD COLUMN "patrimonio" TEXT,
  ADD COLUMN "saldoEmprestado" DECIMAL(12,3) NOT NULL DEFAULT 0;

CREATE INDEX "pecas_tenantId_tipo_ativo_idx" ON "pecas" ("tenantId", "tipo", "ativo");

-- ---------------------------------------------------------------------------
-- 2. Os dois verbos que faltavam no livro-razão
-- ---------------------------------------------------------------------------
-- Postgres 12+ aceita ADD VALUE dentro de transação desde que o valor novo não
-- seja USADO na mesma transação. Aqui ele só é declarado; quem usa é o código,
-- depois. (Este servidor é 16.)
ALTER TYPE "TipoMovimentoEstoque" ADD VALUE IF NOT EXISTS 'EMPRESTIMO';
ALTER TYPE "TipoMovimentoEstoque" ADD VALUE IF NOT EXISTS 'DEVOLUCAO';

-- ---------------------------------------------------------------------------
-- 3. Onde está cada ferramenta, agora
-- ---------------------------------------------------------------------------
CREATE TABLE "emprestimos_ferramenta" (
  "id"                TEXT NOT NULL,
  "tenantId"          TEXT NOT NULL,
  "pecaId"            TEXT NOT NULL,
  "quantidade"        DECIMAL(12,3) NOT NULL DEFAULT 1,

  -- Quem está com a ferramenta. Id para ligar à pessoa, nome para o registro
  -- sobreviver à saída dela da empresa.
  "responsavelId"     TEXT,
  "responsavelNome"   TEXT NOT NULL,

  -- Levou para qual serviço. Opcional: ferramenta também sai para a bancada.
  "ordemId"           TEXT,

  "retiradoEm"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "previstoPara"      TIMESTAMP(3),
  "devolvidoEm"       TIMESTAMP(3),
  -- Como voltou. É aqui que "voltou sem a ponteira" fica escrito no dia em que
  -- aconteceu, e não na discussão de três meses depois.
  "condicaoVolta"     TEXT,
  "observacao"        TEXT,

  "registradoPorId"   TEXT,
  "registradoPorNome" TEXT NOT NULL,
  "criadoEm"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "emprestimos_ferramenta_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "emprestimos_ferramenta_quantidade_positiva" CHECK ("quantidade" > 0)
);

ALTER TABLE "emprestimos_ferramenta"
  ADD CONSTRAINT "emprestimos_ferramenta_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RESTRICT na peça: apagar do catálogo uma ferramenta que está na mão de alguém
-- apagaria junto o registro de quem está com ela.
ALTER TABLE "emprestimos_ferramenta"
  ADD CONSTRAINT "emprestimos_ferramenta_pecaId_fkey"
  FOREIGN KEY ("pecaId") REFERENCES "pecas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "emprestimos_ferramenta"
  ADD CONSTRAINT "emprestimos_ferramenta_ordemId_fkey"
  FOREIGN KEY ("ordemId") REFERENCES "ordens"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- O índice que responde a pergunta da tela: o que ainda não voltou.
CREATE INDEX "emprestimos_ferramenta_abertos_idx"
  ON "emprestimos_ferramenta" ("tenantId", "devolvidoEm", "retiradoEm");
CREATE INDEX "emprestimos_ferramenta_peca_idx"
  ON "emprestimos_ferramenta" ("tenantId", "pecaId", "retiradoEm");
CREATE INDEX "emprestimos_ferramenta_responsavel_idx"
  ON "emprestimos_ferramenta" ("tenantId", "responsavelId", "devolvidoEm");

-- ---------------------------------------------------------------------------
-- 4. O isolamento entre empresas, igual a todas as outras tabelas
-- ---------------------------------------------------------------------------
-- ENABLE e FORCE: o FORCE vale também para o DONO da tabela, e é ele que faz um
-- cliente Prisma sem contexto de empresa enxergar zero linhas em vez de todas.
ALTER TABLE "emprestimos_ferramenta" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "emprestimos_ferramenta" FORCE ROW LEVEL SECURITY;

CREATE POLICY "emprestimos_ferramenta_tenant" ON "emprestimos_ferramenta"
  USING (
    "tenantId" = current_setting('app.tenant_id', true)
    OR current_setting('app.is_super_admin', true) = 'on'
  )
  WITH CHECK (
    "tenantId" = current_setting('app.tenant_id', true)
    OR current_setting('app.is_super_admin', true) = 'on'
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON "emprestimos_ferramenta" TO dtechmed_app;
