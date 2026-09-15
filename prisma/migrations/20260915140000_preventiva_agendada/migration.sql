-- =============================================================================
-- A PREVENTIVA DEIXA DE SER UMA LISTA E VIRA UMA AGENDA
-- =============================================================================
-- `visitas_preventivas` tinha UMA data: `previstaPara`, calculada pelo contrato.
-- E o enum `StatusVisita` já trazia `AGENDADA`, com o comentário "Marcada na
-- agenda, com técnico" — um estado que NADA no sistema sabia produzir, porque
-- não havia onde guardar a data marcada nem quem vai.
--
-- Na prática: o contrato dizia "a cada 6 meses, dia 16", a tela mostrava "em 1
-- dia", e combinar o horário com a clínica acontecia por WhatsApp, fora do
-- sistema. Quem abrisse o calendário via a data do CONTRATO, não a data
-- COMBINADA — e as duas são a mesma coisa só até a primeira clínica pedir para
-- passar de quinta para sexta.
--
-- As colunas abaixo são as quatro perguntas que faltavam: QUANDO ficou, A QUE
-- HORAS, QUEM VAI, e SE O CLIENTE JÁ SABE.
-- -----------------------------------------------------------------------------

-- O DIA COMBINADO. `previstaPara` fica onde está e nunca muda: é ela que
-- responde "a visita de março aconteceu em abril", e sobrescrevê-la apagaria
-- o atraso da própria história do contrato.
ALTER TABLE public.visitas_preventivas
  ADD COLUMN IF NOT EXISTS "agendadaPara" TIMESTAMP(3);

-- 'HH:MM' ou nulo. Texto, e não `time`, pelo mesmo motivo dos compromissos:
-- só é exibido e ordenado, e 'HH:MM' ordena igual em texto e em relógio.
-- "Quinta de manhã" é um combinado legítimo e não tem hora.
ALTER TABLE public.visitas_preventivas
  ADD COLUMN IF NOT EXISTS "hora" TEXT;

-- QUEM VAI. Opcional: marcar o dia com a clínica e decidir o técnico depois é
-- a ordem normal das coisas numa casa pequena.
ALTER TABLE public.visitas_preventivas
  ADD COLUMN IF NOT EXISTS "responsavelId" TEXT;

-- QUANDO O CLIENTE FOI AVISADO, e o que deu errado se não foi.
--
-- Sem a segunda coluna, "avisar o cliente" seria uma promessa sem prova: a
-- clínica diria que não recebeu nada e não haveria como saber se a mensagem
-- saiu, se o número estava errado, ou se o WhatsApp da casa estava fora do ar.
ALTER TABLE public.visitas_preventivas
  ADD COLUMN IF NOT EXISTS "avisadoEm" TIMESTAMP(3);
ALTER TABLE public.visitas_preventivas
  ADD COLUMN IF NOT EXISTS "avisoErro" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'visitas_preventivas_responsavelId_fkey'
  ) THEN
    ALTER TABLE public.visitas_preventivas
      ADD CONSTRAINT "visitas_preventivas_responsavelId_fkey" FOREIGN KEY ("responsavelId")
      REFERENCES public.usuarios("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END
$$;

-- A HORA É CONFERIDA NO BANCO.
--
-- Ela vem de um campo de formulário e acaba impressa ao lado do nome da
-- clínica, no celular do cliente. "25:99" não é erro que apareça em teste: é
-- erro que aparece na mensagem enviada.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'visitas_preventivas_hora_valida') THEN
    ALTER TABLE public.visitas_preventivas
      ADD CONSTRAINT visitas_preventivas_hora_valida
      CHECK ("hora" IS NULL OR "hora" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');
  END IF;
END
$$;

-- A visita AGENDADA precisa ter dia marcado, e a PREVISTA não pode ter.
--
-- Sem esta trava, um caminho novo de código poderia gravar `status=AGENDADA`
-- sem data — e a tela mostraria "agendada" sem dizer para quando, que é a
-- única informação que a palavra promete.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'visitas_preventivas_agenda_coerente') THEN
    ALTER TABLE public.visitas_preventivas
      ADD CONSTRAINT visitas_preventivas_agenda_coerente
      CHECK (
        (status <> 'AGENDADA' AND "agendadaPara" IS NULL)
        OR (status = 'AGENDADA' AND "agendadaPara" IS NOT NULL)
        -- REALIZADA e CANCELADA guardam a data combinada como histórico.
        OR status IN ('REALIZADA', 'CANCELADA')
      );
  END IF;
END
$$;

-- O índice que a agenda usa: "o que está marcado nesta janela de dias".
CREATE INDEX IF NOT EXISTS "visitas_preventivas_tenantId_agendadaPara_idx"
  ON public.visitas_preventivas("tenantId", "agendadaPara");
