-- =============================================================================
-- COMPROMISSOS — a única coisa do Calendário que não cabia em lugar nenhum
-- =============================================================================
-- O Calendário nasceu juntando cinco fontes: parada de rota, preventiva, conta
-- a pagar, conta a receber e contrato terminando. Todas as cinco são
-- CONSEQUÊNCIA de outra coisa — a parada vem de uma ordem, a preventiva vem de
-- um contrato, o vencimento vem de um lançamento. Nenhuma delas nasce sozinha
-- num dia.
--
-- Só que o dia de quem toca a assistência tem coisa que não é nenhuma das
-- cinco: "visitar a Clínica Bella Pelle para ver o aparelho antes de orçar",
-- "reunião com o contador dia 5", "treinamento do Rafael no forno novo". Isso
-- não é ordem, não é contrato e não é dinheiro — e por isso o Calendário só
-- espelhava as outras telas, sem deixar marcar nada.
--
-- Esta tabela é o que faltava, e é deliberadamente pequena: título, dia, hora e
-- quem vai. Um compromisso que precisasse de mais campos que isso já seria
-- outra coisa — uma ordem, um contrato — e teria de nascer na tela dela.
--
-- -----------------------------------------------------------------------------
-- POR QUE ELE É DA EMPRESA, E NÃO DE CADA UM
-- -----------------------------------------------------------------------------
-- Uma agenda privada por pessoa responderia "o que EU tenho hoje" e perderia a
-- pergunta que o Calendário existe para responder: "o que a EQUIPE tem essa
-- semana". Numa assistência de sete pessoas, a segunda pergunta é a que evita
-- mandar dois técnicos para o mesmo lado.
--
-- Por isso todo mundo do painel vê todos os compromissos, e o `responsavelId`
-- diz quem vai. Ele é OPCIONAL: metade dos compromissos de uma empresa pequena
-- não tem dono ("entrega do fornecedor chega dia 12"), e obrigar um nome faria
-- alguém escolher um qualquer só para o formulário deixar salvar.
--
-- -----------------------------------------------------------------------------
-- O DIA É `date`, E NÃO `timestamp`
-- -----------------------------------------------------------------------------
-- As outras fontes do Calendário guardam instante porque o instante importa
-- (a parada tem hora marcada, o vencimento tem fuso). Um compromisso é do DIA:
-- guardar `timestamp` aqui traria de volta o problema clássico de um evento do
-- dia 12 aparecer no 11 para quem abre a tela de outro fuso.
--
-- A hora vem separada, em texto 'HH:MM', e é opcional — porque "quinta de
-- manhã" é um compromisso legítimo e não tem hora.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.compromissos (
  "id"       text PRIMARY KEY,
  "tenantId" text NOT NULL,

  "titulo" text NOT NULL,

  -- O dia, sem fuso. Ver o bloco acima.
  "dia" date NOT NULL,

  -- 'HH:MM' ou nulo. Texto, e não `time`, porque ele só é exibido e ordenado
  -- como texto — 'HH:MM' ordena igual em texto e em relógio.
  "hora" text,

  -- Quem vai. Nulo quando o compromisso é da casa e não de uma pessoa.
  "responsavelId" text,

  "observacao" text,

  -- Marcado como resolvido. O compromisso NÃO é apagado quando cumprido: a
  -- agenda de trás é o que responde "quando foi mesmo que estivemos lá".
  "concluido" boolean NOT NULL DEFAULT false,

  -- Quem criou, guardado como id E como nome. O id some se a pessoa for
  -- removida; o nome fica, e é ele que a tela mostra.
  "autorId"   text,
  "autorNome" text,

  "criadoEm"     timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizadoEm" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  -- Título vazio é linha invisível na grade: ela ocupa o dia e não diz nada.
  CONSTRAINT "compromissos_titulo_nao_vazio" CHECK (length(btrim("titulo")) > 0),
  -- A hora, quando existe, tem de ser hora. Sem isso um '25:00' entra e a
  -- ordenação do dia fica errada para sempre.
  CONSTRAINT "compromissos_hora_valida"
    CHECK ("hora" IS NULL OR "hora" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')
);

-- O índice que sustenta a tela: "os compromissos DESTE mês".
CREATE INDEX IF NOT EXISTS "compromissos_tenantId_dia_idx"
  ON public.compromissos ("tenantId", "dia");
-- "o que o Rafael tem pela frente" — a ficha da pessoa e o filtro por responsável.
CREATE INDEX IF NOT EXISTS "compromissos_tenantId_responsavelId_dia_idx"
  ON public.compromissos ("tenantId", "responsavelId", "dia");

-- -----------------------------------------------------------------------------
-- As chaves
-- -----------------------------------------------------------------------------
-- O tenant CASCATA: apagar uma franquia leva a agenda dela junto.
-- O responsável e o autor viram NULL: uma pessoa que sai da empresa não pode
-- apagar o compromisso que ainda vai acontecer.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'compromissos_tenantId_fkey') THEN
    ALTER TABLE public.compromissos
      ADD CONSTRAINT "compromissos_tenantId_fkey" FOREIGN KEY ("tenantId")
      REFERENCES public.tenants("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'compromissos_responsavelId_fkey') THEN
    ALTER TABLE public.compromissos
      ADD CONSTRAINT "compromissos_responsavelId_fkey" FOREIGN KEY ("responsavelId")
      REFERENCES public.usuarios("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END
$$;

-- -----------------------------------------------------------------------------
-- RLS — o mesmo desenho de todas as tabelas de negócio
-- -----------------------------------------------------------------------------
-- Uma franquia não vê a agenda da outra, e quem garante isso é o Postgres.
-- FORCE prende o DONO da tabela junto: sem ele, o papel que roda as migrações
-- continuaria enxergando tudo, e é com esse papel que um script de manutenção
-- roda no dia em que alguém tiver pressa.
ALTER TABLE public.compromissos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compromissos FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS compromissos_tenant ON public.compromissos;
CREATE POLICY compromissos_tenant ON public.compromissos
  FOR ALL
  USING ("tenantId" = app.current_tenant_id() OR app.is_super_admin())
  WITH CHECK ("tenantId" = app.current_tenant_id() OR app.is_super_admin());

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dtechmed_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.compromissos TO dtechmed_app';
  END IF;
END
$$;
