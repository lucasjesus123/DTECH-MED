-- ============================================================================
-- CONFERIR O DINHEIRO — seis perguntas cuja resposta certa é sempre ZERO
-- ============================================================================
-- Somente leitura. Nenhuma linha é alterada.
--
-- Uso, dentro da gaveta na VPS:
--
--   docker exec -i dtechmed_db psql -U dtechmed_owner -d dtechmed \
--     < scripts/conferir-dinheiro.sql
--
-- Rode no fechamento de cada mês, e depois de qualquer mexida no financeiro.
--
-- ----------------------------------------------------------------------------
-- POR QUE ESTAS SEIS
-- ----------------------------------------------------------------------------
-- São as formas conhecidas de o dinheiro parar de bater num sistema de gestão.
-- Cada uma some silenciosamente: nenhuma dá erro na tela, e todas aparecem
-- semanas depois como "o relatório não fecha".
--
-- O que se procura aqui não é bug de código — é DIVERGÊNCIA no dado. Um sistema
-- pode ter a conta certa e mesmo assim carregar linhas tortas, deixadas por uma
-- versão antiga, uma importação ou uma correção feita direto no banco.
-- ============================================================================

\echo ''
\echo '  1. Fatura com valor diferente do orçamento aprovado'
\echo '     Se der > 0: alguém alterou o orçamento depois de faturar, ou a'
\echo '     fatura foi criada com outro valor. O cliente pode estar sendo'
\echo '     cobrado por um número que não foi o que ele aprovou.'
SELECT count(*) AS divergentes
FROM faturas f
JOIN orcamentos o ON o."ordemId" = f."ordemId" AND o.status = 'APROVADO'
WHERE f."valorTotalCentavos" <> o."totalCentavos";

\echo ''
\echo '  2. Fatura quitada com valor pago diferente do devido'
\echo '     Se der > 0: o sistema acha que recebeu o que não recebeu. É o'
\echo '     buraco que só aparece na conciliação bancária.'
SELECT count(*) AS divergentes
FROM faturas
WHERE status = 'QUITADA' AND "valorPagoCentavos" <> "valorTotalCentavos";

\echo ''
\echo '  3. Soma dos pagamentos diferente do valor pago da fatura'
\echo '     Se der > 0: houve baixa gravada sobre valor desatualizado. Dinheiro'
\echo '     recebido que sumiu do total, ou total inflado sem pagamento por trás.'
SELECT count(*) AS divergentes
FROM faturas f
LEFT JOIN (
  SELECT "faturaId", sum("valorCentavos") AS somado
  FROM pagamentos GROUP BY "faturaId"
) p ON p."faturaId" = f.id
WHERE coalesce(p.somado, 0) <> f."valorPagoCentavos";

\echo ''
\echo '  4. Fatura órfã, sem ordem por trás'
\echo '     Se der > 0: a ordem foi apagada em vez de cancelada. O cliente pode'
\echo '     ser cobrado por um serviço que não existe mais no sistema.'
SELECT count(*) AS orfas
FROM faturas f LEFT JOIN ordens o ON o.id = f."ordemId"
WHERE o.id IS NULL;

\echo ''
\echo '  5. Status desalinhado com os números'
\echo '     Quitada com saldo em aberto some da inadimplência; paga sem estar'
\echo '     marcada como quitada volta a ser cobrada.'
SELECT count(*) AS desalinhadas
FROM faturas
WHERE (status = 'QUITADA' AND "valorPagoCentavos" < "valorTotalCentavos")
   OR (status <> 'QUITADA' AND "valorPagoCentavos" >= "valorTotalCentavos" AND "valorTotalCentavos" > 0);

\echo ''
\echo '  6. Mais de uma fatura para a mesma ordem'
\echo '     O banco impede por chave única. Se der > 0, a restrição caiu.'
SELECT count(*) AS duplicadas
FROM (SELECT "ordemId" FROM faturas GROUP BY "ordemId" HAVING count(*) > 1) x;

\echo ''
\echo '  --- o que foi conferido ---'
SELECT
  count(*) AS faturas,
  (SELECT count(*) FROM pagamentos) AS pagamentos,
  to_char(sum("valorPagoCentavos") / 100.0, 'FM999G999G990D00') AS recebido_reais
FROM faturas;
\echo ''
