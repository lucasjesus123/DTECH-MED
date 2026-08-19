-- ---------------------------------------------------------------------------
-- A PEÇA RETIRADA É PROVA, E PROVA NÃO SE EDITA
-- ---------------------------------------------------------------------------
-- A migração anterior concedeu os quatro verbos em `pecas_retiradas` por
-- simetria com as tabelas de cadastro. Está errado: esta tabela é da mesma
-- família de `eventos_ordem`, `assinaturas`, `movimentos_estoque` e
-- `audit_logs` — o que se grava nela responde, meses depois, "cadê a placa
-- velha?" e "quem mandou a peça contaminada para o descarte comum?".
--
-- Um registro que a própria aplicação pode reescrever não sustenta nenhuma
-- dessas respostas. Errou o destino? Registra outra linha dizendo o que
-- aconteceu; a primeira continua lá, com quem escreveu e quando.
--
-- O apagamento em cascata (ordem ou empresa removida) continua funcionando:
-- o PostgreSQL executa a ação referencial com o dono da tabela, e não com o
-- papel que disparou o DELETE. Limpeza de dados de demonstração continua
-- possível pelo dono, via DIRECT_DATABASE_URL.
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dtechmed_app') THEN
    EXECUTE 'REVOKE UPDATE, DELETE ON "pecas_retiradas" FROM dtechmed_app';
  END IF;
END $$;
