-- ---------------------------------------------------------------------------
-- O CONTEÚDO EDITADO NO PAINEL NUNCA CHEGAVA AO SITE
-- ---------------------------------------------------------------------------
-- Defeito antigo, e do tipo que não dá sinal: o Super Admin abre a tela do
-- site, troca um texto, salva, vê "salvo com sucesso" — e o site continua
-- exatamente igual. Nenhum erro, nenhum log. O texto de fábrica escrito no
-- código é idêntico ao que estava lá no lançamento, então a tela parece certa e
-- ninguém desconfia. Só aparece quando alguém troca uma frase e ela não muda.
--
-- ---------------------------------------------------------------------------
-- A CAUSA
-- ---------------------------------------------------------------------------
-- `conteudo_site` é visível só para quem tem a marca de Super Admin ligada. O
-- visitante do site não tem — e não pode ter. A ponte para ele era
-- `app.conteudo_publicado()`, marcada `SECURITY DEFINER` justamente para
-- atravessar a política.
--
-- Só que `SECURITY DEFINER` dá os poderes do DONO da função, e o dono aqui é
-- `dtechmed_owner`, que é também o dono da tabela. E a tabela tem
-- `FORCE ROW LEVEL SECURITY` — o FORCE existe exatamente para que a política
-- valha INCLUSIVE para o dono. A função rodava com o poder de alguém que a
-- política também barra: devolvia NULL, sempre, para todo mundo.
--
-- As outras quatro funções `SECURITY DEFINER` deste esquema já resolviam isso
-- ligando a marca dentro do próprio corpo (`empresa_do_token`, `registrar_lead`
-- e as demais). Esta, escrita em SQL puro em vez de plpgsql, ficou sem.
--
-- ---------------------------------------------------------------------------
-- A CORREÇÃO
-- ---------------------------------------------------------------------------
-- Exatamente o que as irmãs fazem: liga a marca, lê, devolve a marca ao valor
-- que tinha antes. O `true` do `set_config` limita o efeito à transação
-- corrente, então nada disso escapa para a conexão.
--
-- A tentativa mais curta — a cláusula `SET` da própria função — não serve aqui:
-- o PostgreSQL exige privilégio especial para fixar um parâmetro de nome
-- próprio na definição, e o dono do banco não tem. Em tempo de execução,
-- `set_config` funciona normalmente. É por isso que as outras quatro são
-- plpgsql, e não SQL puro.
--
-- O alcance continua mínimo, e é o que sempre foi a intenção: a função não
-- recebe parâmetro, não aceita filtro, e devolve UMA coluna de UMA linha — o
-- conteúdo que já está publicado para qualquer um ver na home. Não há o que
-- injetar nem o que vazar.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.conteudo_publicado()
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path = public, pg_temp
AS $function$
DECLARE
  v_antes text := coalesce(current_setting('app.is_super_admin', true), '');
  v_dados jsonb;
BEGIN
  PERFORM set_config('app.is_super_admin', 'on', true);
  SELECT "dados" INTO v_dados FROM public."conteudo_site" WHERE "id" = 'site';
  PERFORM set_config('app.is_super_admin', v_antes, true);
  RETURN v_dados;
END;
$function$;
