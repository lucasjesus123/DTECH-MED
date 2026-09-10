-- A CHAVE DO SISTEMA NOVO, EMPRESA POR EMPRESA
--
-- O redesenho "Azul Máquina" entra num endereço próprio, `/sistema`, ao lado do
-- painel que já está no ar. Esta coluna é o interruptor: com ela ligada, quem
-- entra naquela empresa cai no sistema novo; desligada, nada muda para ninguém.
--
-- POR QUE POR EMPRESA, E NÃO UMA VARIÁVEL DE AMBIENTE
--
-- Variável de ambiente liga para todo mundo ao mesmo tempo, e desligar exige
-- um deploy. Aqui a rede pode ter a DTECH inteira no sistema novo enquanto as
-- outras franquias continuam no painel antigo — e voltar atrás é um UPDATE,
-- não uma implantação às onze da noite.
--
-- O PADRÃO É FALSO, e é a parte que importa: nenhuma empresa existente muda de
-- tela por causa desta migração. Quem liga é gente, uma de cada vez.
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS "uiV2" BOOLEAN NOT NULL DEFAULT false;
