-- ---------------------------------------------------------------------------
-- A FOTO TAMBÉM É PROVA
-- ---------------------------------------------------------------------------
-- O diagrama do sistema promete, com todas as letras: "Fotos, assinaturas,
-- eventos da linha do tempo, movimentos de estoque e peças retiradas não podem
-- ser editados nem excluídos — nem pelo administrador. O banco nem concede a
-- permissão."
--
-- Das cinco, quatro eram verdade. A foto não:
--
--     assinaturas         -> INSERT, SELECT
--     eventos_ordem       -> INSERT, SELECT
--     movimentos_estoque  -> INSERT, SELECT
--     pecas_retiradas     -> INSERT, SELECT
--     fotos               -> INSERT, SELECT, UPDATE, DELETE   <-- aqui
--
-- E a foto é justamente a prova que o comentário do próprio código diz
-- resolver "chegou riscado" meses depois: são as seis fotos do estado em que o
-- aparelho entrou na assistência, e as da entrega. Uma prova que se apaga não
-- prova nada.
--
-- Nada no código escreve por cima de uma foto nem apaga uma: a varredura achou
-- só `create`, `count`, `findUnique` e `groupBy`. Revogar não tira função
-- nenhuma de ninguém — só fecha uma porta que estava aberta por esquecimento.
--
-- O arquivo em disco continua sendo apagável pelo dono da máquina; o que esta
-- migração garante é que o REGISTRO, com o hash que amarra o arquivo à ordem,
-- não some pela aplicação.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dtechmed_app') THEN
    EXECUTE 'REVOKE UPDATE, DELETE ON TABLE public.fotos FROM dtechmed_app';
    RAISE NOTICE 'fotos: UPDATE e DELETE revogados de dtechmed_app';
  ELSE
    RAISE NOTICE 'papel dtechmed_app não existe aqui; nada a revogar';
  END IF;
END
$$;
