-- ---------------------------------------------------------------------------
-- O ID DO GOOGLE TAG MANAGER NO CONTEÚDO JÁ SALVO
-- ---------------------------------------------------------------------------
-- O campo `seo.gtmId` nasceu agora. Quem nunca salvou o site pelo painel pega o
-- valor de fábrica do código e a tag sobe funcionando. Quem JÁ salvou tem no
-- banco um JSON gravado por uma versão anterior do editor — sem esse campo. A
-- validação preenche o que falta com vazio, e vazio DESLIGA a tag.
--
-- O resultado seria o pior tipo de defeito: nada quebra, nada avisa, e o
-- tráfego pago simplesmente não é medido. Alguém descobre semanas depois,
-- olhando um relatório zerado, sem nenhuma pista do porquê.
--
-- Esta migração escreve o id SÓ onde a chave não existe. Onde alguém já
-- decidiu — inclusive decidiu deixar em branco para desligar — nada é tocado.
--
-- ---------------------------------------------------------------------------
-- POR QUE UM BLOCO `DO`, E NÃO UM `SET LOCAL` SOLTO
-- ---------------------------------------------------------------------------
-- `conteudo_site` tem `FORCE ROW LEVEL SECURITY`, e o FORCE vale inclusive para
-- o DONO da tabela — que é quem roda as migrações. Sem declarar o contexto,
-- este UPDATE não enxerga linha nenhuma e responde "UPDATE 0", com cara de
-- sucesso.
--
-- A primeira versão deste arquivo usava `SET LOCAL` no topo. Funciona pelo
-- `prisma migrate`, que embrulha cada migração numa transação — e falha calada
-- quando alguém roda o arquivo à mão no psql, que é exatamente o que se faz
-- para investigar. `SET LOCAL` fora de transação é só um WARNING.
--
-- Dentro de um bloco `DO` sempre existe transação, então o contexto vale nos
-- dois casos. E o `RAISE NOTICE` no fim diz quantas linhas mudaram, para
-- ninguém precisar acreditar.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_antes text := coalesce(current_setting('app.is_super_admin', true), '');
  v_linhas integer;
BEGIN
  PERFORM set_config('app.is_super_admin', 'on', true);

  UPDATE "conteudo_site"
     SET "dados" = jsonb_set("dados", '{seo,gtmId}', '"GTM-THVZJV46"'::jsonb, true)
   WHERE "dados" -> 'seo' IS NOT NULL
     AND NOT ("dados" -> 'seo' ? 'gtmId');

  GET DIAGNOSTICS v_linhas = ROW_COUNT;
  PERFORM set_config('app.is_super_admin', v_antes, true);

  RAISE NOTICE 'conteudo_site: % linha(s) receberam o seo.gtmId', v_linhas;
END $$;
