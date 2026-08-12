-- CreateEnum
CREATE TYPE "Papel" AS ENUM ('SUPER_ADMIN', 'ADMIN_EMPRESA', 'GESTOR', 'ATENDENTE', 'TECNICO', 'MOTORISTA', 'FINANCEIRO');

-- CreateEnum
CREATE TYPE "EtapaOrdem" AS ENUM ('SOLICITACAO_RECEBIDA', 'ORDEM_RETIRADA_GERADA', 'RETIRADA_AGENDADA', 'EM_ROTA_RETIRADA', 'COLETADO', 'RECEBIDO_NA_EMPRESA', 'EM_ANALISE', 'ORCAMENTO_INTERNO', 'ORCAMENTO_ENVIADO', 'ORCAMENTO_APROVADO', 'ORCAMENTO_REPROVADO', 'EM_MANUTENCAO', 'MANUTENCAO_CONCLUIDA', 'APROVACAO_GESTAO', 'FATURAMENTO', 'FATURADO', 'EM_ROTA_ENTREGA', 'ENTREGUE', 'FINALIZADO', 'DEVOLVIDO_SEM_REPARO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "TipoPessoa" AS ENUM ('PF', 'PJ');

-- CreateEnum
CREATE TYPE "StatusOrcamento" AS ENUM ('RASCUNHO', 'EM_REVISAO', 'ENVIADO', 'APROVADO', 'REPROVADO', 'EXPIRADO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "TipoItemOrcamento" AS ENUM ('PECA', 'SERVICO', 'DESLOCAMENTO', 'TAXA');

-- CreateEnum
CREATE TYPE "TipoMovimentoEstoque" AS ENUM ('ENTRADA', 'SAIDA', 'AJUSTE', 'RESERVA', 'LIBERACAO', 'PERDA');

-- CreateEnum
CREATE TYPE "FormaPagamento" AS ENUM ('DINHEIRO', 'PIX', 'CARTAO_CREDITO', 'CARTAO_DEBITO', 'BOLETO', 'TRANSFERENCIA', 'CHEQUE');

-- CreateEnum
CREATE TYPE "StatusFatura" AS ENUM ('ABERTA', 'PARCIAL', 'QUITADA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "TipoAgendamento" AS ENUM ('RETIRADA', 'ENTREGA');

-- CreateEnum
CREATE TYPE "StatusAgendamento" AS ENUM ('PENDENTE', 'ATRIBUIDO', 'EM_ROTA', 'CONCLUIDO', 'FALHOU', 'CANCELADO');

-- CreateEnum
CREATE TYPE "TipoAssinatura" AS ENUM ('RETIRADA', 'APROVACAO_ORCAMENTO', 'ENTREGA');

-- CreateEnum
CREATE TYPE "CategoriaFoto" AS ENUM ('RECEBIMENTO', 'ANALISE', 'EXECUCAO', 'PECA_SUBSTITUIDA', 'TESTE_FINAL', 'ENTREGA');

-- CreateEnum
CREATE TYPE "TipoDocumento" AS ENUM ('ORDEM_RETIRADA', 'LAUDO_TECNICO', 'ORCAMENTO', 'CONTRATO_MANUTENCAO', 'ORDEM_SERVICO', 'RECIBO_PAGAMENTO', 'COMPROVANTE_ENTREGA');

-- CreateEnum
CREATE TYPE "StatusJob" AS ENUM ('PENDENTE', 'PROCESSANDO', 'CONCLUIDO', 'FALHOU', 'DESCARTADO');

-- CreateEnum
CREATE TYPE "StatusMensagem" AS ENUM ('PENDENTE', 'ENVIADA', 'ENTREGUE', 'LIDA', 'FALHOU');

-- CreateEnum
CREATE TYPE "StatusInstanciaWhats" AS ENUM ('DESCONECTADA', 'CONECTANDO', 'CONECTADA', 'ERRO');

-- CreateEnum
CREATE TYPE "OrigemLead" AS ENUM ('SITE', 'WHATSAPP', 'TELEFONE', 'INDICACAO', 'PRESENCIAL', 'OUTRO');

-- CreateTable
CREATE TABLE "tenants" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "razaoSocial" TEXT,
    "cnpj" TEXT,
    "email" TEXT,
    "telefone" TEXT,
    "whatsapp" TEXT,
    "cep" TEXT,
    "logradouro" TEXT,
    "numero" TEXT,
    "complemento" TEXT,
    "bairro" TEXT,
    "cidade" TEXT,
    "uf" TEXT,
    "logoUrl" TEXT,
    "corPrimaria" TEXT NOT NULL DEFAULT '#4A0D8F',
    "corSecundaria" TEXT NOT NULL DEFAULT '#1B5CFF',
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "plano" TEXT NOT NULL DEFAULT 'padrao',
    "bloqueado" BOOLEAN NOT NULL DEFAULT false,
    "motivoBloqueio" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usuarios" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "nome" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "telefone" TEXT,
    "senhaHash" TEXT NOT NULL,
    "papel" "Papel" NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "trocarSenha" BOOLEAN NOT NULL DEFAULT true,
    "ultimoLogin" TIMESTAMP(3),
    "tentativasFalhas" INTEGER NOT NULL DEFAULT 0,
    "bloqueadoAte" TIMESTAMP(3),
    "avatarUrl" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    "criadoPorId" TEXT,

    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessoes" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiraEm" TIMESTAMP(3) NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,
    "revogadaEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ultimoUso" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clientes" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "tipo" "TipoPessoa" NOT NULL DEFAULT 'PJ',
    "nome" TEXT NOT NULL,
    "razaoSocial" TEXT,
    "documento" TEXT NOT NULL,
    "documentoHash" TEXT NOT NULL,
    "inscricaoEstadual" TEXT,
    "email" TEXT,
    "telefone" TEXT,
    "whatsapp" TEXT,
    "cep" TEXT,
    "logradouro" TEXT,
    "numero" TEXT,
    "complemento" TEXT,
    "bairro" TEXT,
    "cidade" TEXT,
    "uf" TEXT,
    "pontoReferencia" TEXT,
    "contatoNome" TEXT,
    "contatoTelefone" TEXT,
    "observacoes" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clientes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "equipamentos" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "marca" TEXT NOT NULL,
    "modelo" TEXT NOT NULL,
    "numeroSerie" TEXT,
    "patrimonio" TEXT,
    "categoria" TEXT,
    "voltagem" TEXT,
    "anoFabricacao" INTEGER,
    "acessorios" TEXT,
    "observacoes" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "equipamentos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ordens" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "clienteId" TEXT NOT NULL,
    "equipamentoId" TEXT NOT NULL,
    "etapa" "EtapaOrdem" NOT NULL DEFAULT 'SOLICITACAO_RECEBIDA',
    "tokenPublico" TEXT NOT NULL,
    "defeitoRelatado" TEXT NOT NULL,
    "diagnostico" TEXT,
    "parecerTecnico" TEXT,
    "servicoExecutado" TEXT,
    "testesFinais" TEXT,
    "prioridade" TEXT NOT NULL DEFAULT 'NORMAL',
    "origem" "OrigemLead" NOT NULL DEFAULT 'SITE',
    "viaCorreio" BOOLEAN NOT NULL DEFAULT false,
    "codigoRastreio" TEXT,
    "atendenteId" TEXT,
    "tecnicoId" TEXT,
    "abertaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "coletadaEm" TIMESTAMP(3),
    "recebidaEm" TIMESTAMP(3),
    "orcadaEm" TIMESTAMP(3),
    "aprovadaEm" TIMESTAMP(3),
    "concluidaEm" TIMESTAMP(3),
    "faturadaEm" TIMESTAMP(3),
    "entregueEm" TIMESTAMP(3),
    "finalizadaEm" TIMESTAMP(3),
    "prazoPrometido" TIMESTAMP(3),
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ordens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "eventos_ordem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "ordemId" TEXT NOT NULL,
    "sequencia" INTEGER NOT NULL,
    "etapaAnterior" "EtapaOrdem",
    "etapaNova" "EtapaOrdem" NOT NULL,
    "tipo" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "descricao" TEXT,
    "autorId" TEXT,
    "autorNome" TEXT NOT NULL,
    "autorPapel" "Papel" NOT NULL,
    "payload" JSONB,
    "hash" TEXT NOT NULL,
    "hashAnterior" TEXT,
    "visivelCliente" BOOLEAN NOT NULL DEFAULT true,
    "ip" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "eventos_ordem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fotos" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "ordemId" TEXT NOT NULL,
    "categoria" "CategoriaFoto" NOT NULL,
    "caminho" TEXT NOT NULL,
    "caminhoThumb" TEXT,
    "legenda" TEXT,
    "larguraPx" INTEGER,
    "alturaPx" INTEGER,
    "tamanhoBytes" INTEGER,
    "hashArquivo" TEXT NOT NULL,
    "autorId" TEXT,
    "autorNome" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fotos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assinaturas" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "ordemId" TEXT NOT NULL,
    "tipo" "TipoAssinatura" NOT NULL,
    "assinanteNome" TEXT NOT NULL,
    "assinanteDocumento" TEXT,
    "caminhoImagem" TEXT NOT NULL,
    "hashImagem" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "precisaoM" DOUBLE PRECISION,
    "enderecoAproximado" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,
    "hashDocumento" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assinaturas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orcamentos" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "ordemId" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "versao" INTEGER NOT NULL DEFAULT 1,
    "status" "StatusOrcamento" NOT NULL DEFAULT 'RASCUNHO',
    "laudoTecnico" TEXT,
    "observacoes" TEXT,
    "garantiaDias" INTEGER NOT NULL DEFAULT 90,
    "prazoExecucaoDias" INTEGER NOT NULL DEFAULT 7,
    "subtotalPecas" INTEGER NOT NULL DEFAULT 0,
    "subtotalServicos" INTEGER NOT NULL DEFAULT 0,
    "descontoCentavos" INTEGER NOT NULL DEFAULT 0,
    "acrescimoCentavos" INTEGER NOT NULL DEFAULT 0,
    "totalCentavos" INTEGER NOT NULL DEFAULT 0,
    "validoAte" TIMESTAMP(3),
    "tecnicoId" TEXT,
    "revisorId" TEXT,
    "enviadoEm" TIMESTAMP(3),
    "respondidoEm" TIMESTAMP(3),
    "aprovadoPorNome" TEXT,
    "aprovadoPorDocumento" TEXT,
    "motivoReprovacao" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "orcamentos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orcamento_itens" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "orcamentoId" TEXT NOT NULL,
    "tipo" "TipoItemOrcamento" NOT NULL,
    "pecaId" TEXT,
    "descricao" TEXT NOT NULL,
    "quantidade" DECIMAL(12,3) NOT NULL,
    "valorUnitCentavos" INTEGER NOT NULL,
    "valorTotalCentavos" INTEGER NOT NULL,
    "ordem" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "orcamento_itens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pecas" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "categoria" TEXT,
    "marca" TEXT,
    "aplicacao" TEXT,
    "unidade" TEXT NOT NULL DEFAULT 'UN',
    "custoMedioCentavos" INTEGER NOT NULL DEFAULT 0,
    "precoVendaCentavos" INTEGER NOT NULL DEFAULT 0,
    "saldo" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "saldoReservado" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "estoqueMinimo" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "localizacao" TEXT,
    "fornecedor" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pecas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "movimentos_estoque" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "pecaId" TEXT NOT NULL,
    "ordemId" TEXT,
    "tipo" "TipoMovimentoEstoque" NOT NULL,
    "quantidade" DECIMAL(12,3) NOT NULL,
    "saldoAnterior" DECIMAL(12,3) NOT NULL,
    "saldoPosterior" DECIMAL(12,3) NOT NULL,
    "custoUnitCentavos" INTEGER NOT NULL DEFAULT 0,
    "motivo" TEXT,
    "documentoFiscal" TEXT,
    "autorId" TEXT,
    "autorNome" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "movimentos_estoque_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "faturas" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "ordemId" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "status" "StatusFatura" NOT NULL DEFAULT 'ABERTA',
    "valorTotalCentavos" INTEGER NOT NULL,
    "valorPagoCentavos" INTEGER NOT NULL DEFAULT 0,
    "descontoCentavos" INTEGER NOT NULL DEFAULT 0,
    "multaCentavos" INTEGER NOT NULL DEFAULT 0,
    "jurosCentavos" INTEGER NOT NULL DEFAULT 0,
    "taxaCentavos" INTEGER NOT NULL DEFAULT 0,
    "vencimento" TIMESTAMP(3),
    "emitidaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "quitadaEm" TIMESTAMP(3),
    "conferido" BOOLEAN NOT NULL DEFAULT false,
    "conferidoPorId" TEXT,
    "conferidoPorNome" TEXT,
    "conferidoEm" TIMESTAMP(3),
    "observacoes" TEXT,

    CONSTRAINT "faturas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pagamentos" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "faturaId" TEXT NOT NULL,
    "forma" "FormaPagamento" NOT NULL,
    "valorCentavos" INTEGER NOT NULL,
    "parcelas" INTEGER NOT NULL DEFAULT 1,
    "bandeira" TEXT,
    "autorizacao" TEXT,
    "observacao" TEXT,
    "comprovanteCaminho" TEXT,
    "recebidoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "estornadoEm" TIMESTAMP(3),
    "motivoEstorno" TEXT,
    "autorId" TEXT,
    "autorNome" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pagamentos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agendamentos" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "ordemId" TEXT NOT NULL,
    "tipo" "TipoAgendamento" NOT NULL,
    "status" "StatusAgendamento" NOT NULL DEFAULT 'PENDENTE',
    "motoristaId" TEXT,
    "previstoPara" TIMESTAMP(3) NOT NULL,
    "janelaInicio" TIMESTAMP(3),
    "janelaFim" TIMESTAMP(3),
    "iniciadoEm" TIMESTAMP(3),
    "concluidoEm" TIMESTAMP(3),
    "enderecoSnapshot" TEXT NOT NULL,
    "contatoNome" TEXT,
    "contatoTelefone" TEXT,
    "pontoReferencia" TEXT,
    "posicaoRota" INTEGER,
    "observacoes" TEXT,
    "motivoFalha" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agendamentos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documentos" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "ordemId" TEXT NOT NULL,
    "tipo" "TipoDocumento" NOT NULL,
    "numero" TEXT NOT NULL,
    "caminho" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "tamanhoBytes" INTEGER,
    "tokenAcesso" TEXT NOT NULL,
    "geradoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "documentos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbox_jobs" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "tipo" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "StatusJob" NOT NULL DEFAULT 'PENDENTE',
    "prioridade" INTEGER NOT NULL DEFAULT 5,
    "tentativas" INTEGER NOT NULL DEFAULT 0,
    "maxTentativas" INTEGER NOT NULL DEFAULT 6,
    "agendadoPara" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ultimoErro" TEXT,
    "dedupeKey" TEXT,
    "travadoPor" TEXT,
    "travadoEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processadoEm" TIMESTAMP(3),

    CONSTRAINT "outbox_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mensagens_whatsapp" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "ordemId" TEXT,
    "numero" TEXT NOT NULL,
    "template" TEXT,
    "corpo" TEXT NOT NULL,
    "midiaCaminho" TEXT,
    "status" "StatusMensagem" NOT NULL DEFAULT 'PENDENTE',
    "providerId" TEXT,
    "erro" TEXT,
    "enviadaEm" TIMESTAMP(3),
    "entregueEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mensagens_whatsapp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "templates_mensagem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "chave" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "corpo" TEXT NOT NULL,
    "anexarDocumento" BOOLEAN NOT NULL DEFAULT false,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "templates_mensagem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_instances" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "uazInstanceId" TEXT,
    "uazTokenCifrado" TEXT,
    "status" "StatusInstanciaWhats" NOT NULL DEFAULT 'DESCONECTADA',
    "numero" TEXT,
    "profileName" TEXT,
    "ultimoStatusEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_instances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leads" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "telefone" TEXT NOT NULL,
    "email" TEXT,
    "empresa" TEXT,
    "cidade" TEXT,
    "equipamento" TEXT,
    "mensagem" TEXT,
    "origem" "OrigemLead" NOT NULL DEFAULT 'SITE',
    "status" TEXT NOT NULL DEFAULT 'novo',
    "ordemGeradaId" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "userId" TEXT,
    "userNome" TEXT,
    "userPapel" "Papel",
    "acao" TEXT NOT NULL,
    "entidade" TEXT,
    "entidadeId" TEXT,
    "detalhes" JSONB,
    "ip" TEXT,
    "userAgent" TEXT,
    "negado" BOOLEAN NOT NULL DEFAULT false,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contadores" (
    "tenantId" TEXT NOT NULL,
    "chave" TEXT NOT NULL,
    "valor" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "contadores_pkey" PRIMARY KEY ("tenantId","chave")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenants_slug_key" ON "tenants"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "tenants_cnpj_key" ON "tenants"("cnpj");

-- CreateIndex
CREATE INDEX "tenants_ativo_idx" ON "tenants"("ativo");

-- CreateIndex
CREATE INDEX "usuarios_tenantId_papel_ativo_idx" ON "usuarios"("tenantId", "papel", "ativo");

-- CreateIndex
CREATE INDEX "usuarios_email_idx" ON "usuarios"("email");

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_tenantId_email_key" ON "usuarios"("tenantId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "sessoes_tokenHash_key" ON "sessoes"("tokenHash");

-- CreateIndex
CREATE INDEX "sessoes_userId_expiraEm_idx" ON "sessoes"("userId", "expiraEm");

-- CreateIndex
CREATE INDEX "sessoes_expiraEm_idx" ON "sessoes"("expiraEm");

-- CreateIndex
CREATE INDEX "clientes_tenantId_nome_idx" ON "clientes"("tenantId", "nome");

-- CreateIndex
CREATE INDEX "clientes_tenantId_documentoHash_idx" ON "clientes"("tenantId", "documentoHash");

-- CreateIndex
CREATE INDEX "clientes_tenantId_ativo_criadoEm_idx" ON "clientes"("tenantId", "ativo", "criadoEm");

-- CreateIndex
CREATE UNIQUE INDEX "clientes_tenantId_documento_key" ON "clientes"("tenantId", "documento");

-- CreateIndex
CREATE INDEX "equipamentos_tenantId_clienteId_idx" ON "equipamentos"("tenantId", "clienteId");

-- CreateIndex
CREATE INDEX "equipamentos_tenantId_numeroSerie_idx" ON "equipamentos"("tenantId", "numeroSerie");

-- CreateIndex
CREATE INDEX "equipamentos_tenantId_marca_modelo_idx" ON "equipamentos"("tenantId", "marca", "modelo");

-- CreateIndex
CREATE UNIQUE INDEX "ordens_tokenPublico_key" ON "ordens"("tokenPublico");

-- CreateIndex
CREATE INDEX "ordens_tenantId_etapa_abertaEm_idx" ON "ordens"("tenantId", "etapa", "abertaEm");

-- CreateIndex
CREATE INDEX "ordens_tenantId_clienteId_abertaEm_idx" ON "ordens"("tenantId", "clienteId", "abertaEm");

-- CreateIndex
CREATE INDEX "ordens_tenantId_tecnicoId_etapa_idx" ON "ordens"("tenantId", "tecnicoId", "etapa");

-- CreateIndex
CREATE INDEX "ordens_tenantId_equipamentoId_idx" ON "ordens"("tenantId", "equipamentoId");

-- CreateIndex
CREATE INDEX "ordens_tenantId_prazoPrometido_idx" ON "ordens"("tenantId", "prazoPrometido");

-- CreateIndex
CREATE UNIQUE INDEX "ordens_tenantId_numero_key" ON "ordens"("tenantId", "numero");

-- CreateIndex
CREATE INDEX "eventos_ordem_tenantId_ordemId_sequencia_idx" ON "eventos_ordem"("tenantId", "ordemId", "sequencia");

-- CreateIndex
CREATE INDEX "eventos_ordem_tenantId_tipo_criadoEm_idx" ON "eventos_ordem"("tenantId", "tipo", "criadoEm");

-- CreateIndex
CREATE INDEX "eventos_ordem_tenantId_autorId_criadoEm_idx" ON "eventos_ordem"("tenantId", "autorId", "criadoEm");

-- CreateIndex
CREATE UNIQUE INDEX "eventos_ordem_ordemId_sequencia_key" ON "eventos_ordem"("ordemId", "sequencia");

-- CreateIndex
CREATE INDEX "fotos_tenantId_ordemId_categoria_idx" ON "fotos"("tenantId", "ordemId", "categoria");

-- CreateIndex
CREATE INDEX "fotos_tenantId_criadoEm_idx" ON "fotos"("tenantId", "criadoEm");

-- CreateIndex
CREATE INDEX "assinaturas_tenantId_ordemId_tipo_idx" ON "assinaturas"("tenantId", "ordemId", "tipo");

-- CreateIndex
CREATE INDEX "orcamentos_tenantId_status_criadoEm_idx" ON "orcamentos"("tenantId", "status", "criadoEm");

-- CreateIndex
CREATE INDEX "orcamentos_tenantId_ordemId_idx" ON "orcamentos"("tenantId", "ordemId");

-- CreateIndex
CREATE UNIQUE INDEX "orcamentos_tenantId_numero_versao_key" ON "orcamentos"("tenantId", "numero", "versao");

-- CreateIndex
CREATE INDEX "orcamento_itens_tenantId_orcamentoId_idx" ON "orcamento_itens"("tenantId", "orcamentoId");

-- CreateIndex
CREATE INDEX "orcamento_itens_tenantId_pecaId_idx" ON "orcamento_itens"("tenantId", "pecaId");

-- CreateIndex
CREATE INDEX "pecas_tenantId_ativo_nome_idx" ON "pecas"("tenantId", "ativo", "nome");

-- CreateIndex
CREATE INDEX "pecas_tenantId_categoria_idx" ON "pecas"("tenantId", "categoria");

-- CreateIndex
CREATE UNIQUE INDEX "pecas_tenantId_sku_key" ON "pecas"("tenantId", "sku");

-- CreateIndex
CREATE INDEX "movimentos_estoque_tenantId_pecaId_criadoEm_idx" ON "movimentos_estoque"("tenantId", "pecaId", "criadoEm");

-- CreateIndex
CREATE INDEX "movimentos_estoque_tenantId_ordemId_idx" ON "movimentos_estoque"("tenantId", "ordemId");

-- CreateIndex
CREATE INDEX "movimentos_estoque_tenantId_tipo_criadoEm_idx" ON "movimentos_estoque"("tenantId", "tipo", "criadoEm");

-- CreateIndex
CREATE UNIQUE INDEX "faturas_ordemId_key" ON "faturas"("ordemId");

-- CreateIndex
CREATE INDEX "faturas_tenantId_status_vencimento_idx" ON "faturas"("tenantId", "status", "vencimento");

-- CreateIndex
CREATE INDEX "faturas_tenantId_clienteId_idx" ON "faturas"("tenantId", "clienteId");

-- CreateIndex
CREATE INDEX "faturas_tenantId_conferido_quitadaEm_idx" ON "faturas"("tenantId", "conferido", "quitadaEm");

-- CreateIndex
CREATE UNIQUE INDEX "faturas_tenantId_numero_key" ON "faturas"("tenantId", "numero");

-- CreateIndex
CREATE INDEX "pagamentos_tenantId_faturaId_idx" ON "pagamentos"("tenantId", "faturaId");

-- CreateIndex
CREATE INDEX "pagamentos_tenantId_recebidoEm_idx" ON "pagamentos"("tenantId", "recebidoEm");

-- CreateIndex
CREATE INDEX "pagamentos_tenantId_forma_recebidoEm_idx" ON "pagamentos"("tenantId", "forma", "recebidoEm");

-- CreateIndex
CREATE INDEX "agendamentos_tenantId_motoristaId_previstoPara_idx" ON "agendamentos"("tenantId", "motoristaId", "previstoPara");

-- CreateIndex
CREATE INDEX "agendamentos_tenantId_status_previstoPara_idx" ON "agendamentos"("tenantId", "status", "previstoPara");

-- CreateIndex
CREATE INDEX "agendamentos_tenantId_ordemId_tipo_idx" ON "agendamentos"("tenantId", "ordemId", "tipo");

-- CreateIndex
CREATE UNIQUE INDEX "documentos_tokenAcesso_key" ON "documentos"("tokenAcesso");

-- CreateIndex
CREATE INDEX "documentos_tenantId_ordemId_tipo_idx" ON "documentos"("tenantId", "ordemId", "tipo");

-- CreateIndex
CREATE UNIQUE INDEX "outbox_jobs_dedupeKey_key" ON "outbox_jobs"("dedupeKey");

-- CreateIndex
CREATE INDEX "outbox_jobs_status_agendadoPara_prioridade_idx" ON "outbox_jobs"("status", "agendadoPara", "prioridade");

-- CreateIndex
CREATE INDEX "outbox_jobs_tenantId_tipo_criadoEm_idx" ON "outbox_jobs"("tenantId", "tipo", "criadoEm");

-- CreateIndex
CREATE INDEX "mensagens_whatsapp_tenantId_ordemId_idx" ON "mensagens_whatsapp"("tenantId", "ordemId");

-- CreateIndex
CREATE INDEX "mensagens_whatsapp_tenantId_status_criadoEm_idx" ON "mensagens_whatsapp"("tenantId", "status", "criadoEm");

-- CreateIndex
CREATE INDEX "mensagens_whatsapp_providerId_idx" ON "mensagens_whatsapp"("providerId");

-- CreateIndex
CREATE UNIQUE INDEX "templates_mensagem_tenantId_chave_key" ON "templates_mensagem"("tenantId", "chave");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_instances_tenantId_key" ON "whatsapp_instances"("tenantId");

-- CreateIndex
CREATE INDEX "leads_tenantId_status_criadoEm_idx" ON "leads"("tenantId", "status", "criadoEm");

-- CreateIndex
CREATE INDEX "audit_logs_tenantId_criadoEm_idx" ON "audit_logs"("tenantId", "criadoEm");

-- CreateIndex
CREATE INDEX "audit_logs_userId_criadoEm_idx" ON "audit_logs"("userId", "criadoEm");

-- CreateIndex
CREATE INDEX "audit_logs_acao_criadoEm_idx" ON "audit_logs"("acao", "criadoEm");

-- CreateIndex
CREATE INDEX "audit_logs_negado_criadoEm_idx" ON "audit_logs"("negado", "criadoEm");

-- AddForeignKey
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessoes" ADD CONSTRAINT "sessoes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clientes" ADD CONSTRAINT "clientes_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipamentos" ADD CONSTRAINT "equipamentos_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipamentos" ADD CONSTRAINT "equipamentos_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "clientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ordens" ADD CONSTRAINT "ordens_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ordens" ADD CONSTRAINT "ordens_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "clientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ordens" ADD CONSTRAINT "ordens_equipamentoId_fkey" FOREIGN KEY ("equipamentoId") REFERENCES "equipamentos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ordens" ADD CONSTRAINT "ordens_atendenteId_fkey" FOREIGN KEY ("atendenteId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ordens" ADD CONSTRAINT "ordens_tecnicoId_fkey" FOREIGN KEY ("tecnicoId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eventos_ordem" ADD CONSTRAINT "eventos_ordem_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eventos_ordem" ADD CONSTRAINT "eventos_ordem_ordemId_fkey" FOREIGN KEY ("ordemId") REFERENCES "ordens"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eventos_ordem" ADD CONSTRAINT "eventos_ordem_autorId_fkey" FOREIGN KEY ("autorId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fotos" ADD CONSTRAINT "fotos_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fotos" ADD CONSTRAINT "fotos_ordemId_fkey" FOREIGN KEY ("ordemId") REFERENCES "ordens"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fotos" ADD CONSTRAINT "fotos_autorId_fkey" FOREIGN KEY ("autorId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assinaturas" ADD CONSTRAINT "assinaturas_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assinaturas" ADD CONSTRAINT "assinaturas_ordemId_fkey" FOREIGN KEY ("ordemId") REFERENCES "ordens"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orcamentos" ADD CONSTRAINT "orcamentos_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orcamentos" ADD CONSTRAINT "orcamentos_ordemId_fkey" FOREIGN KEY ("ordemId") REFERENCES "ordens"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orcamentos" ADD CONSTRAINT "orcamentos_tecnicoId_fkey" FOREIGN KEY ("tecnicoId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orcamentos" ADD CONSTRAINT "orcamentos_revisorId_fkey" FOREIGN KEY ("revisorId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orcamento_itens" ADD CONSTRAINT "orcamento_itens_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orcamento_itens" ADD CONSTRAINT "orcamento_itens_orcamentoId_fkey" FOREIGN KEY ("orcamentoId") REFERENCES "orcamentos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orcamento_itens" ADD CONSTRAINT "orcamento_itens_pecaId_fkey" FOREIGN KEY ("pecaId") REFERENCES "pecas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pecas" ADD CONSTRAINT "pecas_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimentos_estoque" ADD CONSTRAINT "movimentos_estoque_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimentos_estoque" ADD CONSTRAINT "movimentos_estoque_pecaId_fkey" FOREIGN KEY ("pecaId") REFERENCES "pecas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimentos_estoque" ADD CONSTRAINT "movimentos_estoque_ordemId_fkey" FOREIGN KEY ("ordemId") REFERENCES "ordens"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimentos_estoque" ADD CONSTRAINT "movimentos_estoque_autorId_fkey" FOREIGN KEY ("autorId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "faturas" ADD CONSTRAINT "faturas_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "faturas" ADD CONSTRAINT "faturas_ordemId_fkey" FOREIGN KEY ("ordemId") REFERENCES "ordens"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "faturas" ADD CONSTRAINT "faturas_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "clientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pagamentos" ADD CONSTRAINT "pagamentos_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pagamentos" ADD CONSTRAINT "pagamentos_faturaId_fkey" FOREIGN KEY ("faturaId") REFERENCES "faturas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pagamentos" ADD CONSTRAINT "pagamentos_autorId_fkey" FOREIGN KEY ("autorId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agendamentos" ADD CONSTRAINT "agendamentos_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agendamentos" ADD CONSTRAINT "agendamentos_ordemId_fkey" FOREIGN KEY ("ordemId") REFERENCES "ordens"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agendamentos" ADD CONSTRAINT "agendamentos_motoristaId_fkey" FOREIGN KEY ("motoristaId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documentos" ADD CONSTRAINT "documentos_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documentos" ADD CONSTRAINT "documentos_ordemId_fkey" FOREIGN KEY ("ordemId") REFERENCES "ordens"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outbox_jobs" ADD CONSTRAINT "outbox_jobs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mensagens_whatsapp" ADD CONSTRAINT "mensagens_whatsapp_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mensagens_whatsapp" ADD CONSTRAINT "mensagens_whatsapp_ordemId_fkey" FOREIGN KEY ("ordemId") REFERENCES "ordens"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "templates_mensagem" ADD CONSTRAINT "templates_mensagem_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_instances" ADD CONSTRAINT "whatsapp_instances_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contadores" ADD CONSTRAINT "contadores_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
