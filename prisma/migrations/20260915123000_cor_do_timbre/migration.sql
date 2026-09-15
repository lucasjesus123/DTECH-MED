-- =============================================================================
-- A COR DO TIMBRE, pelo mesmo motivo da logo
-- =============================================================================
-- `tenants."corPrimaria"` tem o mesmo problema que a logo tinha: está na linha
-- que guarda plano, `ativo` e `bloqueado`, e por isso só o dono da plataforma
-- a escreve. Sem esta coluna, o franqueado subiria a marca dele e a régua do
-- papel continuaria roxa para sempre — logo azul sobre régua roxa, em todo
-- documento que a empresa emite.
--
-- Nula é o comportamento de sempre: cai em `tenants."corPrimaria"`, que cai no
-- roxo de origem. Quem nunca escolher cor nenhuma não vê diferença.
--
-- MIGRAÇÃO SEPARADA, e não um acréscimo à de cima: aquela já rodou. Editar o
-- arquivo de uma migração aplicada muda a soma de verificação que o Prisma
-- guardou, e o `migrate deploy` do próximo `subir.sh` para com "migration
-- modified after it was applied" — no servidor, não aqui.
-- -----------------------------------------------------------------------------

ALTER TABLE public.marca_empresa ADD COLUMN IF NOT EXISTS "corPrimaria" TEXT;

-- A conferência mora no BANCO, e não só na tela. O valor acaba dentro do
-- PDFKit, e o que ele não entende não vira "cor errada": vira o contrato que
-- não foi emitido, na etapa em que o cliente estava esperando o documento.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'marca_empresa_cor_hex') THEN
    ALTER TABLE public.marca_empresa
      ADD CONSTRAINT marca_empresa_cor_hex
      CHECK ("corPrimaria" IS NULL OR "corPrimaria" ~ '^#[0-9a-fA-F]{6}$');
  END IF;
END
$$;
