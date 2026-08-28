-- =============================================================================
-- MODELOS DE DOCUMENTO — o molde deixa de ser código e vira cadastro
-- =============================================================================
-- Contrato de prestação e nota promissória nasceram com o texto ESCRITO DENTRO
-- DO CÓDIGO. Funciona para um molde e só para um: a cláusula de foro é a de
-- Lajeado, o prazo é o que eu escrevi, e mudar qualquer vírgula é mexer no
-- sistema e subir de novo.
--
-- Uma assistência que atende hospital, clínica e órgão público não tem UM
-- contrato: tem o do particular, o do convênio, o que o setor de compras exige.
-- E uma franquia nova terá os dela, com outro foro e outro prazo.
--
-- Daqui em diante o molde é DADO: cada empresa escreve os seus, quantos quiser,
-- e escolhe qual é o padrão de cada tipo.
--
-- -----------------------------------------------------------------------------
-- O CORPO É TEXTO COM `{{marcador}}`
-- -----------------------------------------------------------------------------
-- Contrato não é formulário: é texto corrido com o dado no meio da frase. O
-- marcador é o formato que quem escreve contrato reconhece, e o mesmo que o
-- sistema de locação já usa — quem monta copia da paleta e cola.
--
-- Marcador desconhecido NÃO é apagado na hora de gerar: ele sai impresso como
-- está. Um contrato com `{{cliente_nomee}}` no meio da folha é constrangedor e
-- notado na hora; um com um buraco no lugar do nome é assinado. A regra está em
-- `src/server/documentos/variaveis.ts`, com teste.
--
-- -----------------------------------------------------------------------------
-- POR QUE O TIPO É TEXTO, E NÃO O ENUM `TipoDocumento`
-- -----------------------------------------------------------------------------
-- `TipoDocumento` é o que a ESTEIRA emite — dez valores, cada um disparado por
-- um fato. Aqui o tipo é o que se pode MODELAR à mão, e são três: contrato,
-- nota promissória e ordem de serviço.
--
-- Amarrar os dois faria a lista de modelos oferecer "comprovante de retirada"
-- e "recibo de pagamento", que nascem da esteira e ninguém escreve. E cada
-- valor novo do enum apareceria aqui sem ninguém pedir.
--
-- A trava é o CHECK abaixo: barato, legível, e recusa o valor errado no banco,
-- não só na tela.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.modelos_documento (
  "id"       text PRIMARY KEY,
  "tenantId" text NOT NULL,

  -- Como a pessoa chama este molde: "Contrato hospital", "Promissória 30 dias".
  "nome" text NOT NULL,

  "tipo" text NOT NULL,

  -- O texto, com os marcadores dentro.
  "corpo" text NOT NULL,

  -- Uma linha curta abaixo do nome no cartão, para diferenciar dois moldes
  -- parecidos sem precisar abrir os dois.
  "descricao" text,

  -- O molde que a emissão usa quando ninguém escolhe. UM por tipo — garantido
  -- pelo índice único parcial mais abaixo, e não por promessa da tela.
  "padrao" boolean NOT NULL DEFAULT false,

  -- Aposentar um molde sem apagá-lo: documento já emitido aponta para ele, e a
  -- pergunta "com que texto isto foi assinado?" precisa de resposta.
  "ativo" boolean NOT NULL DEFAULT true,

  "autorId"   text,
  "autorNome" text,

  "criadoEm"     timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizadoEm" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "modelos_documento_nome_nao_vazio" CHECK (length(btrim("nome")) > 0),
  CONSTRAINT "modelos_documento_corpo_nao_vazio" CHECK (length(btrim("corpo")) > 0),
  CONSTRAINT "modelos_documento_tipo_valido"
    CHECK ("tipo" IN ('CONTRATO_PRESTACAO', 'NOTA_PROMISSORIA', 'ORDEM_SERVICO'))
);

CREATE INDEX IF NOT EXISTS "modelos_documento_tenantId_tipo_idx"
  ON public.modelos_documento ("tenantId", "tipo", "ativo");

-- -----------------------------------------------------------------------------
-- UM PADRÃO POR TIPO, GARANTIDO PELO BANCO
-- -----------------------------------------------------------------------------
-- Índice único PARCIAL: ele só vale para as linhas com `padrao = true`, então
-- quantos moldes não-padrão a empresa quiser, e no máximo um padrão por tipo.
--
-- Sem isso, dois cliques rápidos em "definir como padrão" deixariam dois moldes
-- marcados, e a emissão escolheria um deles por acaso — o tipo de erro que só
-- aparece num contrato já assinado com o texto errado.
CREATE UNIQUE INDEX IF NOT EXISTS "modelos_documento_um_padrao_por_tipo"
  ON public.modelos_documento ("tenantId", "tipo")
  WHERE "padrao";

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'modelos_documento_tenantId_fkey') THEN
    ALTER TABLE public.modelos_documento
      ADD CONSTRAINT "modelos_documento_tenantId_fkey" FOREIGN KEY ("tenantId")
      REFERENCES public.tenants("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;

-- -----------------------------------------------------------------------------
-- RLS — o mesmo desenho de todas as tabelas de negócio
-- -----------------------------------------------------------------------------
-- Aqui ela pesa mais que o normal: o modelo de contrato de uma franquia traz o
-- texto comercial dela — prazo, multa, foro. É documento de estratégia, não só
-- de operação. FORCE prende o dono da tabela junto.
ALTER TABLE public.modelos_documento ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.modelos_documento FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS modelos_documento_tenant ON public.modelos_documento;
CREATE POLICY modelos_documento_tenant ON public.modelos_documento
  FOR ALL
  USING ("tenantId" = app.current_tenant_id() OR app.is_super_admin())
  WITH CHECK ("tenantId" = app.current_tenant_id() OR app.is_super_admin());

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dtechmed_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.modelos_documento TO dtechmed_app';
  END IF;
END
$$;
