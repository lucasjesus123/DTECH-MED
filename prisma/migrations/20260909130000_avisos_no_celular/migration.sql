-- O AVISO NO CELULAR DE QUEM ESTÁ NA RUA
--
-- O passo 5 do processo diz "já vai para o app do motorista (calendário e
-- notificação)". O calendário existia; a notificação não existia em lugar
-- nenhum do código. Na prática, o motorista só descobria uma corrida nova se
-- abrisse o aplicativo por conta própria — e é ele que está dirigindo.
--
-- Uma inscrição é o endereço que o navegador dá para o servidor push do
-- fabricante (Google, Apple, Mozilla). Ela é POR APARELHO, não por pessoa: o
-- mesmo motorista com dois celulares tem duas linhas, e as duas tocam.
--
-- O `endpoint` é único no banco inteiro, e isso é de propósito: reinstalar o
-- aplicativo devolve o mesmo endereço, e sem a unicidade cada reinstalação
-- criaria uma linha nova que faria o aparelho tocar duas vezes.

CREATE TABLE IF NOT EXISTS public.push_inscricoes (
  "id"        TEXT NOT NULL,
  "tenantId"  TEXT NOT NULL,
  "usuarioId" TEXT NOT NULL,

  -- O endereço do servidor push do fabricante. Longo de propósito: ele carrega
  -- o identificador do aparelho.
  "endpoint"  TEXT NOT NULL,
  -- As duas chaves da criptografia ponta a ponta do Web Push. Sem elas o
  -- servidor do fabricante entrega um envelope que o aparelho não abre.
  "p256dh"    TEXT NOT NULL,
  "auth"      TEXT NOT NULL,

  -- Qual aparelho é este, para a pessoa reconhecer o que desligar.
  "aparelho"  TEXT,

  "criadoEm"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "ultimoEnvioEm" TIMESTAMP(3),
  -- Falhas SEGUIDAS. O servidor do fabricante responde 404/410 quando o
  -- aparelho desinstalou o aplicativo; nesse caso a linha é apagada na hora.
  -- Este contador é para a falha passageira — sinal, servidor fora do ar — e
  -- serve para parar de insistir com quem nunca recebe.
  "falhas"    INTEGER NOT NULL DEFAULT 0,

  CONSTRAINT "push_inscricoes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "push_inscricoes_endpoint_key"
  ON public.push_inscricoes("endpoint");
-- A pergunta do envio é sempre "quais aparelhos são desta pessoa": o índice é
-- por usuário, dentro da empresa.
CREATE INDEX IF NOT EXISTS "push_inscricoes_tenantId_usuarioId_idx"
  ON public.push_inscricoes("tenantId", "usuarioId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'push_inscricoes_tenantId_fkey') THEN
    ALTER TABLE public.push_inscricoes
      ADD CONSTRAINT "push_inscricoes_tenantId_fkey" FOREIGN KEY ("tenantId")
      REFERENCES public.tenants("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  -- CASCATA no usuário: desligar alguém da empresa cala o celular dele. Uma
  -- inscrição órfã continuaria recebendo aviso de corrida de uma empresa em
  -- que a pessoa não trabalha mais.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'push_inscricoes_usuarioId_fkey') THEN
    ALTER TABLE public.push_inscricoes
      ADD CONSTRAINT "push_inscricoes_usuarioId_fkey" FOREIGN KEY ("usuarioId")
      REFERENCES public.usuarios("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;

-- -----------------------------------------------------------------------------
-- RLS — o mesmo desenho de todas as tabelas de negócio
-- -----------------------------------------------------------------------------
-- Uma franquia não manda aviso para o celular da outra, e quem garante isso é
-- o Postgres. FORCE prende o DONO da tabela junto.
ALTER TABLE public.push_inscricoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_inscricoes FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS push_inscricoes_tenant ON public.push_inscricoes;
CREATE POLICY push_inscricoes_tenant ON public.push_inscricoes
  FOR ALL
  USING ("tenantId" = app.current_tenant_id() OR app.is_super_admin())
  WITH CHECK ("tenantId" = app.current_tenant_id() OR app.is_super_admin());

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dtechmed_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.push_inscricoes TO dtechmed_app';
  END IF;
END
$$;
